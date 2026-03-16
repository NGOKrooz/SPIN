#!/usr/bin/env node

/**
 * Database Connection Diagnostic Script
 *
 * Run this to diagnose MongoDB connection issues
 * Usage: node debug-db-connection.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

console.log('🔍 SPIN MongoDB Connection Diagnostic Tool\n');
console.log('='.repeat(60));

const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
  console.error('❌ MONGO_URI is not set!');
  console.error('   Set MONGO_URI in your .env file (e.g. mongodb+srv://<user>:<password>@<cluster>/spinDB)');
  process.exit(1);
}

console.log('✅ MONGO_URI is set');
console.log(`   Length: ${mongoUri.length} characters`);

(async () => {
  try {
    console.log('\n🔌 Attempting MongoDB connection...');
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connection successful!');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log(`\n📚 Found ${collections.length} collection(s):`);
    collections.forEach((col) => console.log(`  - ${col.name}`));

    console.log('\n✅ All tests passed! Your MongoDB connection is working.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection test failed!');
    console.error(`   Error: ${err.message}`);
    if (err.name === 'MongoParseError') {
      console.error('   - Check that your MONGO_URI is a valid MongoDB connection string.');
    }
    if (err.message.includes('authentication')) {
      console.error('   - Check username/password in your URI.');
    }
    if (err.message.includes('ECONNREFUSED')) {
      console.error('   - Check your network access rules (IP whitelist) and that the cluster is running.');
    }
    process.exit(1);
  }
})();
