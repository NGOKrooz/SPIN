const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../database/init');

// Conditional imports for cloud services
let Client, ConfidentialClientApplication, google;
try {
  const graphClient = require('@microsoft/microsoft-graph-client');
  Client = graphClient.Client;
  const msal = require('msal-node');
  ConfidentialClientApplication = msal.ConfidentialClientApplication;
  const googleapis = require('googleapis');
  google = googleapis.google;
} catch (error) {
  console.warn('Cloud backup dependencies not installed. Install with: npm install @microsoft/microsoft-graph-client googleapis msal-node');
}

const db = getDatabase();

// OneDrive configuration
const getOneDriveClient = async () => {
  if (!Client || !ConfidentialClientApplication) {
    throw new Error('OneDrive dependencies not installed. Run: npm install @microsoft/microsoft-graph-client msal-node');
  }

  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
  const tenantId = process.env.ONEDRIVE_TENANT_ID || 'common';

  if (!clientId || !clientSecret) {
    throw new Error('OneDrive credentials not configured');
  }

  const msalConfig = {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };

  const pca = new ConfidentialClientApplication(msalConfig);
  
  // Get stored token or authenticate
  const tokenResult = await pca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });

  const client = Client.init({
    authProvider: (done) => {
      done(null, tokenResult.accessToken);
    },
  });

  return client;
};

// Google Drive configuration
const getGoogleDriveClient = async () => {
  if (!google) {
    throw new Error('Google Drive dependencies not installed. Run: npm install googleapis');
  }

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';

  if (!clientId || !clientSecret) {
    throw new Error('Google Drive credentials not configured');
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Get stored refresh token from settings
  const refreshToken = await getStoredToken('google_refresh_token');
  if (refreshToken) {
    oauth2Client.setCredentials({ refresh_token: refreshToken });
  }

  return { drive: google.drive({ version: 'v3', auth: oauth2Client }), oauth2Client };
};

// Helper to get/set tokens from database
async function getStoredToken(key) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) return reject(err);
      resolve(row?.value || null);
    });
  });
}

async function setStoredToken(key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO settings (key, value, description, updated_at) 
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [key, value, `OAuth token for ${key}`],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

// Upload backup to OneDrive
async function uploadToOneDrive(filePath, fileName) {
  const client = await getOneDriveClient();
  
  try {
    const fileContent = fs.readFileSync(filePath);
    const uploadPath = `/me/drive/root:/SPIN Backups/${fileName}:/content`;
    
    await client.api(uploadPath).put(fileContent);
    
    return {
      success: true,
      message: 'Backup uploaded to OneDrive successfully',
      fileName,
    };
  } catch (error) {
    console.error('OneDrive upload error:', error);
    throw new Error(`Failed to upload to OneDrive: ${error.message}`);
  }
}

// Upload backup to Google Drive
async function uploadToGoogleDrive(filePath, fileName) {
  const { drive, oauth2Client } = await getGoogleDriveClient();
  
  try {
    const fileContent = fs.readFileSync(filePath);
    const fileMetadata = {
      name: fileName,
      parents: ['root'], // Can be configured to use a specific folder
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: {
        mimeType: 'application/json',
        body: fileContent,
      },
    });

    // Move to SPIN Backups folder if it exists, or create it
    const folderName = 'SPIN Backups';
    let folderId = await findOrCreateFolder(drive, folderName);
    
    if (folderId && response.data.id) {
      await drive.files.update({
        fileId: response.data.id,
        addParents: folderId,
        removeParents: response.data.parents?.[0],
      });
    }

    return {
      success: true,
      message: 'Backup uploaded to Google Drive successfully',
      fileName,
      fileId: response.data.id,
    };
  } catch (error) {
    console.error('Google Drive upload error:', error);
    throw new Error(`Failed to upload to Google Drive: ${error.message}`);
  }
}

// Find or create folder in Google Drive
async function findOrCreateFolder(drive, folderName) {
  try {
    // Try to find existing folder
    const response = await drive.files.list({
      q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    // Create folder if not found
    const folderResponse = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      },
      fields: 'id',
    });

    return folderResponse.data.id;
  } catch (error) {
    console.error('Error finding/creating folder:', error);
    return null;
  }
}

// List backups from OneDrive
async function listOneDriveBackups() {
  const client = await getOneDriveClient();
  
  try {
    const response = await client.api('/me/drive/root:/SPIN Backups:/children').get();
    const files = response.value
      .filter(item => item.name.startsWith('spin-backup-') && item.name.endsWith('.json'))
      .map(item => ({
        name: item.name,
        size: item.size,
        modified: item.lastModifiedDateTime,
        id: item.id,
      }))
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));

    return files;
  } catch (error) {
    console.error('Error listing OneDrive backups:', error);
    throw new Error(`Failed to list OneDrive backups: ${error.message}`);
  }
}

// List backups from Google Drive
async function listGoogleDriveBackups() {
  const { drive } = await getGoogleDriveClient();
  
  try {
    const folderId = await findOrCreateFolder(drive, 'SPIN Backups');
    let query = "name contains 'spin-backup-' and mimeType='application/json' and trashed=false";
    
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, size, modifiedTime)',
      orderBy: 'modifiedTime desc',
    });

    return response.data.files.map(file => ({
      name: file.name,
      size: file.size,
      modified: file.modifiedTime,
      id: file.id,
    }));
  } catch (error) {
    console.error('Error listing Google Drive backups:', error);
    throw new Error(`Failed to list Google Drive backups: ${error.message}`);
  }
}

// Download backup from OneDrive
async function downloadFromOneDrive(fileId) {
  const client = await getOneDriveClient();
  
  try {
    const fileContent = await client.api(`/me/drive/items/${fileId}/content`).get();
    return fileContent;
  } catch (error) {
    console.error('Error downloading from OneDrive:', error);
    throw new Error(`Failed to download from OneDrive: ${error.message}`);
  }
}

// Download backup from Google Drive
async function downloadFromGoogleDrive(fileId) {
  const { drive } = await getGoogleDriveClient();
  
  try {
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    }, { responseType: 'stream' });
    
    return response.data;
  } catch (error) {
    console.error('Error downloading from Google Drive:', error);
    throw new Error(`Failed to download from Google Drive: ${error.message}`);
  }
}

// Delete old backups from OneDrive
async function deleteOldOneDriveBackups(keepCount = 10) {
  const client = await getOneDriveClient();
  const backups = await listOneDriveBackups();
  
  if (backups.length <= keepCount) return;

  const toDelete = backups.slice(keepCount);
  
  for (const backup of toDelete) {
    try {
      await client.api(`/me/drive/items/${backup.id}`).delete();
    } catch (error) {
      console.error(`Error deleting backup ${backup.name}:`, error);
    }
  }
}

// Delete old backups from Google Drive
async function deleteOldGoogleDriveBackups(keepCount = 10) {
  const { drive } = await getGoogleDriveClient();
  const backups = await listGoogleDriveBackups();
  
  if (backups.length <= keepCount) return;

  const toDelete = backups.slice(keepCount);
  
  for (const backup of toDelete) {
    try {
      await drive.files.delete({ fileId: backup.id });
    } catch (error) {
      console.error(`Error deleting backup ${backup.name}:`, error);
    }
  }
}

module.exports = {
  uploadToCloud: async (cloudType, filePath, fileName) => {
    if (cloudType === 'onedrive') {
      return await uploadToOneDrive(filePath, fileName);
    } else if (cloudType === 'googledrive') {
      return await uploadToGoogleDrive(filePath, fileName);
    }
    throw new Error(`Unsupported cloud type: ${cloudType}`);
  },
  
  downloadFromCloud: async (cloudType, fileId) => {
    if (cloudType === 'onedrive') {
      return await downloadFromOneDrive(fileId);
    } else if (cloudType === 'googledrive') {
      return await downloadFromGoogleDrive(fileId);
    }
    throw new Error(`Unsupported cloud type: ${cloudType}`);
  },
  
  listCloudBackups: async (cloudType) => {
    if (cloudType === 'onedrive') {
      return await listOneDriveBackups();
    } else if (cloudType === 'googledrive') {
      return await listGoogleDriveBackups();
    }
    throw new Error(`Unsupported cloud type: ${cloudType}`);
  },
  
  deleteOldBackups: async (cloudType, keepCount = 10) => {
    if (cloudType === 'onedrive') {
      return await deleteOldOneDriveBackups(keepCount);
    } else if (cloudType === 'googledrive') {
      return await deleteOldGoogleDriveBackups(keepCount);
    }
    throw new Error(`Unsupported cloud type: ${cloudType}`);
  },
  
  getStoredToken,
  setStoredToken,
};

