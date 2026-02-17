// Determine database type - ONLY PostgreSQL supported, require DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required.');
  console.error('This application only supports PostgreSQL via Supabase.');
  console.error('Please set DATABASE_URL in your .env file or environment variables.');
  process.exit(1);
}

console.log('🔗 Connecting to PostgreSQL database...');

// Use PostgreSQL only
const postgres = require('./postgres');
const { initializeDatabase, getDatabase } = postgres;

module.exports = { initializeDatabase, getDatabase };
