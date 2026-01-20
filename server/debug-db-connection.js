#!/usr/bin/env node

/**
 * Database Connection Diagnostic Script
 * 
 * Run this to diagnose PostgreSQL connection issues
 * Usage: node debug-db-connection.js
 */

require('dotenv').config();
const url = require('url');
const { Pool } = require('pg');
const dns = require('dns').promises;

console.log('🔍 SPIN Database Connection Diagnostic Tool\n');
console.log('=' .repeat(60));

// Step 1: Check environment variables
console.log('\n📋 Step 1: Checking Environment Variables');
console.log('-' .repeat(60));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set!');
  console.error('   Set DATABASE_URL in your .env file');
  process.exit(1);
}

console.log('✅ DATABASE_URL is set');
console.log(`   Length: ${databaseUrl.length} characters`);

// Step 2: Parse DATABASE_URL
console.log('\n🔧 Step 2: Parsing DATABASE_URL');
console.log('-' .repeat(60));

try {
  const parsed = url.parse(databaseUrl, true);
  
  const hostname = parsed.hostname || 'localhost';
  const port = parsed.port || 5432;
  const database = parsed.pathname ? parsed.pathname.slice(1) : 'postgres';
  const username = parsed.auth ? parsed.auth.split(':')[0] : 'postgres';
  const password = parsed.auth ? parsed.auth.split(':')[1] : '';
  
  console.log('✅ URL parsing successful:');
  console.log(`   Protocol: ${parsed.protocol}`);
  console.log(`   Hostname: ${hostname}`);
  console.log(`   Port: ${port}`);
  console.log(`   Database: ${database}`);
  console.log(`   Username: ${username}`);
  console.log(`   Password: ${password ? `(${password.length} chars)` : '(empty)'}`);
  
  // Check for special characters in password
  if (password && !password.match(/^[a-zA-Z0-9_-]+$/)) {
    console.warn('⚠️  Password contains special characters');
    console.warn('   Make sure they are URL-encoded in DATABASE_URL');
  }
  
  // Step 3: DNS resolution test
  console.log('\n🌐 Step 3: Testing DNS Resolution');
  console.log('-' .repeat(60));
  
  (async () => {
    try {
      console.log(`   Resolving ${hostname}...`);
      const addresses = await dns.resolve4(hostname);
      console.log(`✅ IPv4 resolution successful:`);
      addresses.forEach((addr, i) => {
        console.log(`   [${i + 1}] ${addr}`);
      });
    } catch (err) {
      console.error(`❌ IPv4 resolution failed: ${err.message}`);
    }
    
    try {
      console.log(`   Resolving ${hostname} (IPv6)...`);
      const addresses = await dns.resolve6(hostname);
      console.log(`⚠️  IPv6 resolution successful (this may cause ENETUNREACH):`);
      addresses.forEach((addr, i) => {
        console.log(`   [${i + 1}] ${addr}`);
      });
      console.warn('   💡 TIP: The connection config now forces family: 4 to use IPv4');
    } catch (err) {
      console.log(`   IPv6 resolution not available (OK): ${err.code}`);
    }
    
    // Step 4: Test connection
    console.log('\n🔌 Step 4: Testing Database Connection');
    console.log('-' .repeat(60));
    
    try {
      const config = {
        host: hostname,
        port: port,
        database: database,
        user: username,
        password: password || undefined,
        ssl: hostname.includes('supabase') || hostname.includes('amazonaws') 
          ? { rejectUnauthorized: false } 
          : false,
        family: 4, // Force IPv4
        connectionTimeoutMillis: 10000,
      };
      
      console.log('   Connection config:');
      console.log(`   - Host: ${config.host}`);
      console.log(`   - Port: ${config.port}`);
      console.log(`   - Database: ${config.database}`);
      console.log(`   - User: ${config.user}`);
      console.log(`   - SSL: ${config.ssl ? 'Yes' : 'No'}`);
      console.log(`   - Force IPv4: Yes (family: 4)`);
      
      const pool = new Pool(config);
      
      console.log('\n   Attempting connection...');
      const client = await pool.connect();
      
      console.log('✅ Connection successful!');
      
      // Test a simple query
      const result = await client.query('SELECT NOW() as current_time, version()');
      console.log('\n✅ Query test successful:');
      console.log(`   Current Time: ${result.rows[0].current_time}`);
      console.log(`   Server: ${result.rows[0].version.split(',')[0]}`);
      
      client.release();
      await pool.end();
      
      console.log('\n' + '=' .repeat(60));
      console.log('✅ All tests passed! Your database connection is working.');
      console.log('=' .repeat(60));
      
    } catch (err) {
      console.error('❌ Connection test failed!');
      console.error(`   Error: ${err.message}`);
      console.error(`   Code: ${err.code}`);
      
      if (err.code === 'ENETUNREACH') {
        console.error('\n💡 ENETUNREACH means:');
        console.error('   - IPv6 connection was attempted but failed');
        console.error('   - Fix: The code now forces IPv4 (family: 4)');
      } else if (err.code === 'ECONNREFUSED') {
        console.error('\n💡 ECONNREFUSED means:');
        console.error('   - The server refused the connection');
        console.error('   - Check if PostgreSQL is running');
        console.error('   - Check hostname, port, and credentials');
      } else if (err.message.includes('password')) {
        console.error('\n💡 Authentication error:');
        console.error('   - Check password in DATABASE_URL');
        console.error('   - Check if special characters are URL-encoded');
      } else if (err.code === 'ENOTFOUND') {
        console.error('\n💡 ENOTFOUND means:');
        console.error('   - The hostname could not be resolved');
        console.error('   - Check DATABASE_URL has correct hostname');
      }
      
      console.log('\n' + '=' .repeat(60));
      console.error('❌ Connection test failed. See errors above.');
      console.log('=' .repeat(60));
      process.exit(1);
    }
  })();
  
} catch (err) {
  console.error('❌ Error parsing DATABASE_URL:');
  console.error(`   ${err.message}`);
  process.exit(1);
}
