# Quick Reference: PostgreSQL Connection Fixes

## Problem: App crashes with ENETUNREACH on Render/Railway

### ✅ What Was Fixed

| Issue | Fix | Status |
|-------|-----|--------|
| IPv6 connection fails | Now forces IPv4 with `family: 4` | ✅ FIXED |
| No SSL for Supabase | Auto-detects and enables SSL | ✅ FIXED |
| Server crashes on DB error | Retries 5 times, stays running | ✅ FIXED |
| Intern creation fails silently | Checks DB connection first, returns 503 if down | ✅ FIXED |
| DATABASE_URL parsing fails | Better error handling and logging | ✅ FIXED |

## 1-Minute Setup

### Environment Variables (Required)
```
DATABASE_URL=postgresql://postgres:PASSWORD@db.supabase.co:5432/postgres
ADMIN_PASSWORD=your_secure_key
NODE_ENV=production
PORT=5000
```

### Special Character Encoding
If password is: `my#pass@123`
URL-encode to: `my%23pass%40123`

### Test Connection
```bash
node server/debug-db-connection.js
```

## Deploy & Test

```bash
# 1. Deploy code to Render/Railway
# 2. Check logs for this message:
# ✅ PostgreSQL connected successfully

# 3. Test health endpoint
curl https://your-app.com/api/health

# 4. Create an intern (with admin key header)
curl -X POST https://your-app.com/api/interns \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your_admin_password" \
  -d '{"name":"John","gender":"Male","start_date":"2024-01-20"}'
```

## Common Errors & Fixes

### Error: `ENETUNREACH` with IPv6 address
```
connect ENETUNREACH 2a05:d018:135e:163d:...
```
**Fix:** Already implemented! Code now forces IPv4.  
**Check:** Look for `🔒 SSL: Auto-detected as required for cloud provider` in logs

### Error: `Connection refused`
```
connect ECONNREFUSED 127.0.0.1:5432
```
**Fix:** Check DATABASE_URL hostname is correct  
**Test:** `node server/debug-db-connection.js`

### Error: `password authentication failed`
```
FATAL: password authentication failed for user "postgres"
```
**Fix:** Check PASSWORD in DATABASE_URL is URL-encoded  
**Example:** `#` becomes `%23`, `@` becomes `%40`

### Error: `HTTP 500 - failed to create intern`
**Fix:** Database may still be initializing  
**Wait:** 30 seconds, then try again  
**Check:** `curl http://localhost:5000/api/health` should return 200

## Files Modified

| File | What Changed |
|------|----------------|
| `server/database/postgres.js` | IPv4 forcing, SSL auto-detect, retry logic |
| `server/index.js` | Non-blocking DB init, retry loop |
| `server/routes/interns.js` | DB readiness check before creating intern |
| `server/env.example` | Better documentation of DATABASE_URL |

## New Files

| File | Purpose |
|------|---------|
| `server/debug-db-connection.js` | Diagnostic tool to test connection |
| `DB_CONNECTION_TROUBLESHOOTING.md` | Detailed troubleshooting guide |
| `PRODUCTION_FIX_SUMMARY.md` | Complete change documentation |

## Key Code Changes

### Force IPv4 (Prevents ENETUNREACH)
```javascript
return {
  host: hostname,
  port: port,
  family: 4,  // ← Forces IPv4 only
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  // ... rest of config
};
```

### Retry Logic (Prevents Server Crash)
```javascript
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    client = await pool.connect();
    break;
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, attempt * 2000));
    } else {
      throw err;
    }
  }
}
```

### DB Readiness Check (Prevents Silent Failures)
```javascript
router.post('/', async (req, res) => {
  const dbConnected = await verifyDatabaseConnection();
  if (!dbConnected) {
    return res.status(503).json({ error: 'Database unavailable' });
  }
  // ... proceed with intern creation
});
```

## Deployment Checklist

- [ ] DATABASE_URL set with URL-encoded password
- [ ] ADMIN_PASSWORD set
- [ ] NODE_ENV set to `production`
- [ ] Code deployed to Render/Railway
- [ ] Logs show `✅ PostgreSQL connected successfully`
- [ ] Health check endpoint responds: `curl /api/health`
- [ ] Can create intern via POST with admin key
- [ ] No ENETUNREACH errors in logs

## Expected Behavior

### On Startup
```
🚀 SPIN Server running on port 5000
🔧 Parsing DATABASE_URL...
📡 Database host: db.supabase.co:5432
🔒 SSL: Auto-detected as required for cloud provider
🔌 Attempting to connect to PostgreSQL...
✅ Connected on attempt 1
✅ PostgreSQL connected successfully
✅ Database tables initialized successfully
```

### Creating Intern (Success)
```
HTTP 201 Created
{
  "id": 1,
  "name": "John",
  "status": "Active",
  ...
}
```

### Creating Intern (DB Unavailable)
```
HTTP 503 Service Unavailable
{
  "error": "Database service unavailable",
  "details": "Cannot establish database connection. Please try again in a moment."
}
```

## Support

### Run Diagnostic
```bash
node server/debug-db-connection.js
```

### View Recent Logs
```bash
# Render Dashboard > Logs
# Railway Dashboard > Logs > Recent
```

### Manual Test Connection
```bash
psql postgresql://postgres:password@db.supabase.co:5432/postgres
```

---

**Status:** ✅ Production Ready  
**Last Updated:** January 20, 2026  
**Version:** 1.0.0
