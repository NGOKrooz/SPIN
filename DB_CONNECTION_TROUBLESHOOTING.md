# MongoDB Atlas Connection Troubleshooting Guide

## Problem: `Could not connect to any servers` Error

### Root Cause
The error indicates:
- MongoDB Atlas is blocking connections from your IP address
- The IP whitelist in Atlas doesn't include your deployment environment's IP
- Atlas requires explicit IP whitelisting for security

### Symptoms
- Deployment fails with "Could not connect to any servers"
- Backend crashes on startup with MongoDB connection error
- Error shows "IP that isn't whitelisted"
- App cannot connect to database

### Solution ✅
**Configure MongoDB Atlas Network Access:**
1. Go to MongoDB Atlas Dashboard → Network Access
2. Click "Add IP Address"
3. For development: Add your current IP
4. For production (Render/Railway): Add `0.0.0.0/0` to allow all IPs
5. Wait 1-2 minutes for changes to propagate
6. Redeploy your application

## Problem: Database Initialization Fails

### Root Cause
Previous code called `process.exit(-1)` when DB init failed, killing the entire process.

### Symptoms
- Server crashes immediately on startup
- No logs after "Database initialization failed"
- Health endpoint not responding
- Cannot even access the UI

### Solution ✅
**The code has been fixed!** The server now:
1. **Starts before DB initialization** (non-blocking)
2. **Retries DB connection** up to 5 times
3. **Keeps the server running** even if DB fails
4. **Serves health endpoint** to confirm the app is responsive
5. **Logs detailed diagnostic info** about what went wrong

## Problem: Data Operations Fail

### Root Cause
If MongoDB connection isn't ready, API operations fail silently.

### Symptoms
- "failed to create intern" error when creating new records
- Works sometimes, fails other times
- POST request hangs or returns 500 error

### Solution ✅
**The code has been fixed!** The POST route now:
1. **Verifies DB connection** before processing
2. **Returns 503** if database is unavailable
3. **Logs connection errors** with diagnostic info

## MongoDB Atlas Configuration

### Format
```
mongodb+srv://username:password@cluster.mongodb.net/database
```

### For MongoDB Atlas
1. Go to **Clusters > Connect**
2. Choose **Connect your application**
3. Copy the **connection string**
4. Replace `<password>` with your database user password
5. Replace `<database>` with your database name (e.g., `spinDB`)
6. Paste into `MONGO_URI` in environment variables

### For Render/Railway Deployment
1. In MongoDB Atlas, go to **Network Access**
2. Add IP address: `0.0.0.0/0` (allows all IPs)
3. Wait 1-2 minutes for changes to apply
4. Use the full connection string in your deployment environment variables

## Diagnostic Commands

### Test Connection Locally
```bash
node server/debug-db-connection.js
```

This will:
- Parse your MONGO_URI
- Test DNS resolution
- Attempt database connection
- Run a test query
- Report any errors with solutions

### Check Server Health
```bash
curl http://localhost:5000/api/health
```

Response should be:
```json
{
  "status": "OK",
  "message": "SPIN API is running",
  "timestamp": "2024-01-20T..."
}
```

### View Server Logs
```bash
# If running locally
npm start

# If running in Docker
docker logs <container-id>

# On Render
Dashboard > Logs > All Logs

# On Railway
Dashboard > Logs
```

Look for:
- `✅ MongoDB Connected` (good)
- `❌ Could not connect to any servers` (IP whitelist issue)
- `📡 Database host:` (shows what hostname is being used)

## Environment Variables Checklist

Verify these are set correctly:

- `MONGO_URI` - Full MongoDB Atlas connection string
  - Format: `mongodb+srv://user:password@cluster.mongodb.net/database`
  
- `NODE_ENV` - Set to `production` for cloud deployments
  - Affects SSL settings and error logging
  
- `ADMIN_PASSWORD` - Required for POST/PUT/DELETE operations
  - Must match `x-admin-key` header in requests
  
- `PORT` - Usually `5000` (Render/Railway will set this automatically)

## Code Changes Made

### Files Modified:
1. **server/database/postgres.js** - Connection config and retry logic
2. **server/index.js** - Database initialization with retries
3. **server/routes/interns.js** - Database connectivity check
4. **server/env.example** - Better documentation

### Key Changes:
- ✅ Force IPv4 with `family: 4`
- ✅ Auto-detect SSL for cloud providers
- ✅ Parse DATABASE_URL properly
- ✅ Retry logic for connection failures
- ✅ Graceful degradation if DB fails
- ✅ Detailed logging for debugging
- ✅ Connection verification in routes

## Still Having Issues?

### 1. Check Supabase Firewall
Supabase may block connections from some IP ranges.
- Go to **Project Settings > Network**
- Ensure your deployment's IP range is allowed
- Or add `0.0.0.0/0` to allow all (less secure but testing)

### 2. Check DATABASE_URL is Correct
```bash
# Run diagnostic script
node server/debug-db-connection.js
```

### 3. Check Admin Password
If POST requests fail with 401:
- Ensure `ADMIN_PASSWORD` is set in environment
- Ensure client is sending `x-admin-key` header with correct password

### 4. Verify Node Version
```bash
node --version  # Should be 14+
npm --version   # Should be 6+
```

### 5. Check Postgres Client Version
```bash
npm list pg
```

Should show: `pg@^8.x.x` (8.16.3 or later)

## Next Steps

1. **Set your DATABASE_URL** in environment variables
   - Use URL encoding for special characters
   - Test with diagnostic script: `node server/debug-db-connection.js`

2. **Verify ADMIN_PASSWORD** is set
   - Required for create/update/delete operations
   - Send in `x-admin-key` header

3. **Deploy to Render/Railway**
   - Check the logs in the dashboard
   - Should see `✅ PostgreSQL connected successfully`
   - Server should stay running even if DB init takes time

4. **Test the API**
   - Health check: `GET /api/health`
   - Get interns: `GET /api/interns`
   - Create intern: `POST /api/interns` with admin key header

## Summary of Fixes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| ENETUNREACH | IPv6 resolution failure | Force IPv4 with `family: 4` |
| Connection fails | No SSL for cloud providers | Auto-detect and enable SSL |
| DB init crash | `process.exit()` on error | Keep server running, retry |
| Intern creation fails | No DB readiness check | Verify connection before queries |
| URL parsing errors | Special characters not encoded | Improved parsing and logging |

---

**Last Updated:** January 20, 2026
**SPIN Version:** 1.0.0
