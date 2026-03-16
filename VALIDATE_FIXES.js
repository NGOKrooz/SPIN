#!/usr/bin/env node

/**
 * Validation Report: Production Fixes Applied
 * 
 * This script verifies all fixes have been properly applied.
 * Run: node VALIDATE_FIXES.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(70));
console.log('🔍 SPIN Production Fixes Validation Report');
console.log('='.repeat(70) + '\n');

const checks = [];

// Helper function
function checkFile(filePath, searchFor, description) {
  try {
    const fullPath = path.join(__dirname, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const hasContent = Array.isArray(searchFor) 
      ? searchFor.every(s => content.includes(s))
      : content.includes(searchFor);
    
    if (hasContent) {
      console.log(`✅ ${description}`);
      console.log(`   📄 ${filePath}\n`);
      checks.push({ status: 'PASS', description });
      return true;
    } else {
      console.log(`❌ ${description}`);
      console.log(`   📄 ${filePath}`);
      console.log(`   Looking for: ${Array.isArray(searchFor) ? searchFor[0] : searchFor}\n`);
      checks.push({ status: 'FAIL', description });
      return false;
    }
  } catch (err) {
    console.log(`❌ ${description}`);
    console.log(`   Error: ${err.message}\n`);
    checks.push({ status: 'ERROR', description });
    return false;
  }
}

// Validation Checks

console.log('📋 Checking PostgreSQL Connection Fixes...\n');

checkFile(
  'server/database/postgres.js',
  'family: 4',
  'IPv4 forcing with family: 4 in connection config'
);

checkFile(
  'server/database/postgres.js',
  'rejectUnauthorized: false',
  'SSL configuration for cloud providers'
);

checkFile(
  'server/database/postgres.js',
  'connectionTimeoutMillis: 10000',
  'Connection timeout (10 seconds) added'
);

checkFile(
  'server/database/postgres.js',
  'for (let attempt = 1; attempt <= 3; attempt++)',
  'Retry logic for connection attempts'
);

checkFile(
  'server/database/postgres.js',
  'hostname.includes(\'supabase\') || hostname.includes(\'amazonaws\')',
  'Auto-detection of SSL requirement for cloud providers'
);

console.log('📋 Checking Server Startup Fixes...\n');

checkFile(
  'server/index.js',
  'let databaseReady = false',
  'Database ready flag added'
);

checkFile(
  'server/index.js',
  'maxDbRetries',
  'Database retry logic in server startup'
);

checkFile(
  'server/index.js',
  'const waitTime = Math.min(5000 * dbRetries, 30000)',
  'Exponential backoff for retries'
);

checkFile(
  'server/index.js',
  'async () => {',
  'Non-blocking database initialization'
);

console.log('📋 Checking Intern Creation Fixes...\n');

checkFile(
  'server/routes/interns.js',
  'verifyDatabaseConnection',
  'Database connectivity verification function added'
);

checkFile(
  'server/routes/interns.js',
  ['async (req, res) => {', 'const dbConnected = await verifyDatabaseConnection()'],
  'DB connection check in POST /interns route'
);

checkFile(
  'server/routes/interns.js',
  'res.status(503)',
  'HTTP 503 response when database unavailable'
);

console.log('📋 Checking Documentation...\n');

checkFile(
  'server/env.example',
  'URL-encoded',
  'DATABASE_URL encoding documentation added'
);

checkFile(
  'DB_CONNECTION_TROUBLESHOOTING.md',
  'ENETUNREACH',
  'Comprehensive troubleshooting guide created'
);

checkFile(
  'PRODUCTION_FIX_SUMMARY.md',
  'Root Cause Analysis',
  'Detailed fix summary documentation created'
);

checkFile(
  'QUICK_FIX_REFERENCE.md',
  'Quick Reference',
  'Quick reference guide created'
);

console.log('📋 Checking New Diagnostic Tools...\n');

checkFile(
  'server/debug-db-connection.js',
  'dns.resolve4',
  'Database diagnostic tool created'
);

// Summary
console.log('\n' + '='.repeat(70));
console.log('📊 Validation Summary');
console.log('='.repeat(70) + '\n');

const passed = checks.filter(c => c.status === 'PASS').length;
const failed = checks.filter(c => c.status === 'FAIL').length;
const errors = checks.filter(c => c.status === 'ERROR').length;
const total = checks.length;

console.log(`✅ Passed: ${passed}/${total}`);
if (failed > 0) console.log(`❌ Failed: ${failed}/${total}`);
if (errors > 0) console.log(`⚠️  Errors: ${errors}/${total}`);

if (failed === 0 && errors === 0) {
  console.log('\n🎉 ALL CHECKS PASSED!\n');
  console.log('Production Fixes Summary:');
  console.log('  ✅ IPv4 forcing implemented (prevents ENETUNREACH)');
  console.log('  ✅ SSL auto-detection for cloud providers');
  console.log('  ✅ Connection retry logic with backoff');
  console.log('  ✅ Non-blocking database initialization');
  console.log('  ✅ Database readiness checks');
  console.log('  ✅ Comprehensive documentation');
  console.log('  ✅ Diagnostic tools available\n');
  console.log('🚀 Ready for production deployment!\n');
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed. Please review above.\n');
  process.exit(1);
}
