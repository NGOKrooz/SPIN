# SPIN Production Deployment Guide

## ✅ Production Readiness Checklist

### 1. Database Configuration (CRITICAL)

**Status: ✅ FIXED**

- ✅ PostgreSQL-only connection via `DATABASE_URL`
- ✅ SQLite dependency removed from `package.json`
- ✅ No SQLite fallback logic
- ✅ Explicit startup validation for `DATABASE_URL`
- ✅ Enhanced error messages for missing configuration
- ✅ Connection retry logic with IPv4 forcing

**Required Environment Variables:**
```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

**Important Notes:**
- Use Supabase **pooling connection string** for production
- Password must be URL-encoded if it contains special characters
- Examples in `server/env.example`

---

### 2. Environment Variables (Render Configuration)

**Status: ✅ CONFIGURED**

All environment variables properly handled via `process.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | **YES** | None | PostgreSQL connection string (Supabase) |
| `NODE_ENV` | Recommended | `development` | Set to `production` for production |
| `PORT` | Auto-set by Render | `5000` | Server port (Render sets automatically) |
| `ADMIN_PASSWORD` | Recommended | None | Admin authentication for write operations |
| `AUTO_ROTATION` | Optional | `true` | Enable automatic rotation advancement |
| `BACKUP_SCHEDULE` | Optional | None | Backup schedule (`daily`, `weekly`, etc.) |
| `AUTO_RESTORE_ENABLED` | Optional | `true` | Enable auto-restore on deployment |

**Render Configuration:**
1. Go to Dashboard → Environment
2. Add `DATABASE_URL` (from Supabase)
3. Add `ADMIN_PASSWORD` (generate secure password)
4. Set `NODE_ENV=production`

---

### 3. Production Build Stability

**Status: ✅ VALIDATED**

#### Backend:
- ✅ Production start uses `node server/index.js` (no nodemon)
- ✅ Dev dependencies not included in production build
- ✅ Prisma client generation in build step
- ✅ Error handling middleware present
- ✅ Global error handlers (unhandledRejection, uncaughtException)

#### Frontend:
- ✅ Build script: `npm run build`
- ✅ `CI=false` flag prevents warnings from breaking build
- ✅ Production build optimized

#### Docker:
- ✅ Multi-stage dependency installation
- ✅ `--omit=dev` flag for server dependencies
- ✅ Prisma generation before client build
- ✅ Exposes port 5000
- ✅ Correct start command

---

### 4. Error Handling & Logging

**Status: ✅ IMPLEMENTED**

All critical error handlers in place:

```javascript
// Global Express error middleware
app.use((err, req, res, next) => { ... })

// Unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => { ... })

// Uncaught exceptions
process.on('uncaughtException', (error) => { ... })

// Server errors
server.on('error', (err) => { ... })

// Database connection errors
pool.on('error', (err) => { ... })
```

**Logging Strategy:**
- ✅ Connection status logged (without credentials)
- ✅ Startup configuration displayed
- ✅ Database errors with helpful diagnostics
- ✅ Request logging for debugging
- ✅ Environment validation on startup

---

### 5. Render Deployment Configuration

**File: `render.yaml`**

**Status: ✅ UPDATED**

Key changes:
- ✅ Removed SQLite references (`DB_TYPE`, `DB_PATH`)
- ✅ Added `DATABASE_URL` environment variable
- ✅ Build command generates Prisma client
- ✅ Health check endpoint configured: `/api/health`
- ✅ Production start command correct

**Build Command:**
```bash
npm install && cd server && npm install && npm run prisma:generate && cd ../client && npm install && CI=false npm run build
```

**Start Command:**
```bash
node server/index.js
```

---

## 🚀 Deployment Steps

### Step 1: Pre-Deployment Validation

Run these tests locally before deploying:

```powershell
# 1. Install dependencies
cd SPIN
npm install
cd server
npm install
cd ../client
npm install
cd ..

# 2. Set environment variables for testing
$env:DATABASE_URL="your-supabase-connection-string"
$env:NODE_ENV="production"
$env:ADMIN_PASSWORD="test-password"

# 3. Generate Prisma client
cd server
npm run prisma:generate

# 4. Build frontend
cd ../client
npm run build

# 5. Test backend startup
cd ../server
node index.js
```

**Expected Output:**
```
🚀 SPIN Server Starting...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Environment: production
🔌 Port: 5000
🗄️  Database: PostgreSQL (Supabase)
🔒 Admin Auth: Configured ✓
🔄 Auto-Rotation: Enabled
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 SPIN Server running on port 5000
📊 Health check: http://localhost:5000/api/health
🔌 Attempting to connect to PostgreSQL...
✅ Connected on attempt 1
✅ Database tables initialized successfully
✅ All routes loaded successfully
```

### Step 2: Test API Endpoints

```powershell
# Test health check
curl http://localhost:5000/api/health

# Test units endpoint (should require admin auth)
curl http://localhost:5000/api/units

# Test with admin auth
curl -H "x-admin-key: test-password" http://localhost:5000/api/units
```

### Step 3: Supabase Configuration

1. **Get Connection String:**
   - Go to Supabase Dashboard
   - Project Settings → Database
   - Copy **Connection Pooling** string (use Session mode)
   
2. **Format:**
   ```
   postgresql://postgres.xxxx:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
   ```

3. **URL-Encode Password if needed:**
   ```javascript
   // If password contains special characters
   const password = "my#pass@word";
   const encoded = encodeURIComponent(password);
   // Result: my%23pass%40word
   ```

### Step 4: Deploy to Render

1. **Push to Git:**
   ```bash
   git add .
   git commit -m "Production-ready deployment fixes"
   git push origin main
   ```

2. **Configure Render:**
   - Go to Render Dashboard
   - Select your service
   - Environment → Add Environment Variables:
     - `DATABASE_URL`: (paste Supabase connection string)
     - `NODE_ENV`: `production`
     - `ADMIN_PASSWORD`: (generate secure password)

3. **Trigger Deployment:**
   - Manual Deploy → Deploy Latest Commit
   - Or: Automatic deployment on push

4. **Monitor Logs:**
   - Logs tab should show:
     - ✅ Build successful
     - ✅ Prisma client generated
     - ✅ Frontend built
     - ✅ Server started
     - ✅ Database connected

---

## 🧪 Post-Deployment Testing

### Critical Tests:

1. **Health Check:**
   ```bash
   curl https://your-app.onrender.com/api/health
   ```
   Expected: `{"status":"OK","message":"SPIN API is running"}`

2. **Create Unit:**
   ```bash
   curl -X POST https://your-app.onrender.com/api/units \
     -H "Content-Type: application/json" \
     -H "x-admin-key: YOUR_ADMIN_PASSWORD" \
     -d '{"name":"Cardiology","duration_days":30,"workload":"Medium"}'
   ```

3. **Create Intern:**
   ```bash
   curl -X POST https://your-app.onrender.com/api/interns \
     -H "Content-Type: application/json" \
     -H "x-admin-key: YOUR_ADMIN_PASSWORD" \
     -d '{"name":"John Doe","gender":"Male","batch":"A","start_date":"2026-02-17","phone_number":"1234567890"}'
   ```

4. **Assign Intern to Unit:**
   - Use frontend to test manual assignment
   - Auto-rotation should create rotations automatically

---

## 🐛 Troubleshooting

### Issue: "DATABASE_URL is not configured"

**Solution:**
- Ensure `DATABASE_URL` is set in Render environment variables
- Check the connection string format
- Verify password is URL-encoded

### Issue: "Connection ENETUNREACH"

**Solution:**
- IPv6 resolution issue (already handled with `family: 4`)
- Check Supabase service status
- Verify network/firewall settings

### Issue: "password authentication failed"

**Solution:**
- Check password is correct in DATABASE_URL
- Verify special characters are URL-encoded
- Confirm user exists in Supabase

### Issue: Build fails with Prisma errors

**Solution:**
- Ensure `render.yaml` includes `npm run prisma:generate`
- Check `schema.prisma` is valid
- Verify Prisma version compatibility

### Issue: Frontend not served

**Solution:**
- Check client build completed: `client/build/index.html` exists
- Verify `CI=false` in build command
- Check for build warnings/errors in logs

---

## 📋 Production Verification Checklist

After deployment completes:

- [ ] Health endpoint responds: `/api/health`
- [ ] Database connection successful (check logs)
- [ ] No SQLite references in logs
- [ ] Admin authentication works
- [ ] Units can be created via API
- [ ] Interns can be created via API
- [ ] Frontend loads correctly
- [ ] Rotation assignment works
- [ ] No runtime crashes (check logs for 24 hours)
- [ ] Auto-rotation creates rotations (if enabled)

---

## 🔒 Security Notes

1. **Never commit** `.env` files or credentials
2. **Use strong passwords** for `ADMIN_PASSWORD`
3. **Rotate secrets** periodically
4. **Monitor logs** for unauthorized access attempts
5. **Use HTTPS** only (Render provides automatically)
6. **Validate inputs** (already implemented in routes)

---

## 📊 Performance Optimization

- Database connection pooling: Enabled (max: 20 connections)
- Connection timeout: 10 seconds
- Statement timeout: 30 seconds
- Idle timeout: 30 seconds
- Frontend: Built with production optimizations
- Static assets: Cached appropriately

---

## 🔄 Rollback Procedure

If deployment fails:

1. **Check Render logs** for specific errors
2. **Revert to previous commit** if needed:
   ```bash
   git revert HEAD
   git push origin main
   ```
3. **Or redeploy previous version** from Render dashboard
4. **Restore database** from backup if needed

---

## ✅ Summary of Changes

### Files Modified:
- `server/package.json` - Removed SQLite dependency
- `render.yaml` - Updated for PostgreSQL-only deployment
- `server/database/init.js` - Enhanced error messages
- `server/index.js` - Added startup validation and logging
- `Dockerfile` - Updated comments

### Files Created:
- `PRODUCTION_DEPLOYMENT.md` - This guide

### No Changes Required:
- Error handlers already present ✅
- Production start script already correct ✅
- PORT handling already correct ✅
- Build configuration already stable ✅

---

## 📞 Support

For issues:
1. Check Render logs first
2. Verify environment variables
3. Test DATABASE_URL connection locally
4. Check Supabase service status
5. Review this guide for common issues

**Production is now ready for deployment! 🚀**
