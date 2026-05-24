const fs = require('fs');
const path = require('path');

const serverModules = path.join(__dirname, '..', 'server', 'node_modules');
const mongoose = require(path.join(serverModules, 'mongoose'));
require(path.join(serverModules, 'dotenv')).config({ path: './server/.env' });

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGO_URI environment variable not set');
    }

    const backupRoot = path.join(process.cwd(), 'backup');
    fs.mkdirSync(backupRoot, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(backupRoot, `pre-migration-${timestamp}`);
    fs.mkdirSync(backupDir, { recursive: true });

    await mongoose.connect(uri, { retryWrites: true, w: 'majority' });
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    for (const coll of collections) {
      const docs = await db.collection(coll.name).find({}).toArray();
      const filePath = path.join(backupDir, `${coll.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');
      console.log(`Exported ${docs.length} documents from ${coll.name}`);
    }

    await mongoose.disconnect();
    console.log('[BACKUP CREATED]', backupDir);
  } catch (err) {
    console.error('Backup failed:', err.message);
    process.exit(1);
  }
})();
