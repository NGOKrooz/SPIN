# PostgreSQL Connection Troubleshooting Guide

## Problem: `ENETUNREACH` Error with IPv6

### Root Cause
The error `connect ENETUNREACH 2a05:d018:135e:163d:2a25:4fc5:d579:8c06:5432` indicates:
- The database hostname is resolving to an **IPv6 address**
- IPv6 is not available in your deployment environment (Render/Railway)
- The connection fails without falling back to IPv4

### Symptoms
- Deployment fails with "ENETUNREACH"
- Backend crashes on startup
- Error shows an IPv6 address (contains colons, looks like: `2a05:...`)
- App cannot create interns ("failed to create intern" error)

### Solution ✅
**The code has been fixed!** All PostgreSQL connections now:
1. **Force IPv4** with `family: 4` in the Pool config
2. **Auto-detect SSL requirement** for cloud providers (Supabase, AWS, Azure)
3. **Parse DATABASE_URL correctly** with proper credential handling
4. **Add connection timeouts** and retries

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

## Problem: Intern Creation Fails

### Root Cause
If database connection isn't ready, POST `/api/interns` fails silently.

### Symptoms
- "failed to create intern" error when creating new interns
- Works sometimes, fails other times
- POST request hangs or returns 500 error

### Solution ✅
**The code has been fixed!** The POST route now:
1. **Verifies DB connection** before processing
2. **Returns 503** if database is unavailable
3. **Logs connection errors** with diagnostic info

## Database URL Configuration

### Format
```
postgresql://username:password@host:port/database
```

### For Supabase
1. Go to **Project Settings > Database**
2. Copy the **Connection string** (not Connection pooler)
3. Paste into `DATABASE_URL` in environment variables
4. Ensure special characters in password are **URL-encoded**

### Encoding Special Characters in Password
If your password is: `my#pass@word123`

URL-encode it to: `my%23pass%40word123`

Common encodings:
- `#` → `%23`
- `@` → `%40`
- `:` → `%3A`
- `/` → `%2F`
- `%` → `%25`
- `?` → `%3F`
- `&` → `%26`
- `=` → `%3D`

### For Render Railway
1. Go to PostgreSQL service
2. Copy the **Internal Database URL** (for private networking)
3. Paste into `DATABASE_URL`
4. Or use **External Database URL** if internal networking not available

## Diagnostic Commands

### Test Connection Locally
```bash
node server/debug-db-connection.js
```

This will:
- Parse your DATABASE_URL
- Test DNS resolution (IPv4 and IPv6)
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
- `✅ PostgreSQL connected successfully` (good)
- `❌ ENETUNREACH` (IPv6 issue - now fixed)
- `📡 Database host:` (shows what hostname is being used)
- `🔒 SSL: Enabled` (should be enabled for Supabase)

## Environment Variables Checklist

Verify these are set correctly:

- `DATABASE_URL` - Full PostgreSQL connection string
  - Format: `postgresql://user:password@host:port/database`
  - Special characters URL-encoded
  
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
