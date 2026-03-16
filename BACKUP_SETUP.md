# Backup and Restore System Setup Guide

## Overview

The SPIN platform includes a comprehensive backup and restore system that supports:
- Manual backups (local download)
- Cloud backups (OneDrive/Google Drive)
- Scheduled automatic backups
- Automatic restore on fresh deployments

## Quick Start

### 1. Install Dependencies

```bash
cd SPIN/server
npm install
```

This will install:
- `@microsoft/microsoft-graph-client` (OneDrive support)
- `@azure/msal-node` (Microsoft authentication)
- `googleapis` (Google Drive support)
- `node-cron` (Scheduled backups)

### 2. Configure Cloud Storage (Optional)

Edit `SPIN/server/.env` (create from `env.example` if it doesn't exist):

```env
# Enable cloud backup
CLOUD_BACKUP_ENABLED=true
CLOUD_BACKUP_PROVIDER=googledrive  # or 'onedrive'

# For Google Drive
GOOGLE_DRIVE_CLIENT_ID=your_client_id
GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret

# For OneDrive
ONEDRIVE_CLIENT_ID=your_client_id
ONEDRIVE_CLIENT_SECRET=your_client_secret
ONEDRIVE_TENANT_ID=common

# Backup Schedule
BACKUP_SCHEDULE=daily  # or 'weekly', 'disabled'
BACKUP_TIME=02:00      # Time in HH:MM format
BACKUP_RETENTION_COUNT=10  # Number of backups to keep
AUTO_RESTORE_ENABLED=true  # Enable automatic restore on fresh deployments
```

### 3. Get Cloud Storage Credentials

#### Google Drive Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google Drive API
4. Create OAuth 2.0 credentials (Desktop app type)
5. Copy Client ID and Client Secret to `.env`

#### OneDrive Setup

1. Go to [Azure Portal](https://portal.azure.com/)
2. Register a new application
3. Add API permissions for Microsoft Graph (Files.ReadWrite)
4. Create a client secret
5. Copy Application (client) ID and secret to `.env`

## Features

### Manual Backup

1. Go to Settings → Data Management
2. Click "Backup Full Database" or "Backup Settings Only"
3. Backup file will download automatically

### Cloud Backup

1. Ensure cloud credentials are configured in `.env`
2. Go to Settings → Data Management
3. Click "Backup to Cloud" button
4. Backup will be uploaded to your cloud storage

### Scheduled Backups

- Automatically runs at configured time (default: 2 AM daily)
- Uploads to cloud storage if enabled
- Keeps only the most recent backups (based on retention count)
- Logs backup operations

### Automatic Restore

On fresh deployment:
- System detects if database is empty (< 5 interns, < 10 settings)
- Automatically downloads latest backup from cloud storage
- Restores critical data (interns, rotations, settings)

## Backup File Structure

Backups are JSON files with the following structure:

```json
{
  "metadata": {
    "type": "critical",
    "created_at": "2024-01-15T10:30:00.000Z",
    "version": "1.0.0"
  },
  "interns": [...],
  "rotations": [...],
  "settings": [...]
}
```

## Troubleshooting

### Cloud Backup Not Working

1. Check `.env` file has correct credentials
2. Verify `CLOUD_BACKUP_ENABLED=true`
3. Check server logs for authentication errors
4. Ensure dependencies are installed: `npm install`

### Scheduled Backups Not Running

1. Verify `BACKUP_SCHEDULE` is not set to 'disabled'
2. Check server logs on startup for scheduler initialization
3. Ensure server timezone is correct

### Auto-Restore Not Working

1. Check `AUTO_RESTORE_ENABLED=true` in `.env`
2. Verify cloud credentials are configured
3. Check that backups exist in cloud storage
4. Review server logs for restore operation status

## Security Notes

- Never commit `.env` file with credentials
- Store credentials securely
- Use environment variables in production
- Regularly rotate API credentials

