// PRODUCTION REQUIREMENT: ONLY PostgreSQL supported via DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('');
  console.error('═════════════════════════════════════════════════════════');
  console.error('❌ CRITICAL ERROR: DATABASE_URL is not configured');
  console.error('═════════════════════════════════════════════════════════');
  console.error('');
  console.error('This application requires PostgreSQL (Supabase) connection.');
  console.error('SQLite is NOT supported in production.');
  console.error('');
  console.error('To fix this:');
  console.error('  1. Set DATABASE_URL environment variable');
  console.error('  2. Use your Supabase connection string:');
  console.error('     postgresql://user:password@host:port/database');
  console.error('');
  console.error('For Render.com deployment:');
  console.error('  - Add DATABASE_URL in Environment Variables section');
  console.error('  - Use Supabase pooling connection string for production');
  console.error('');
  console.error('═════════════════════════════════════════════════════════');
  console.error('');
  process.exit(1);
}

console.log('🔗 DATABASE_URL detected - Connecting to PostgreSQL database...');
console.log('📊 Database host:', DATABASE_URL.split('@')[1]?.split('/')[0] || 'unknown');

// Use PostgreSQL only
const postgres = require('./postgres');
const { initializeDatabase, getDatabase } = postgres;

module.exports = { initializeDatabase, getDatabase };
