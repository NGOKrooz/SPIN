# 🚀 Deploy SPIN to Railway (FREE)

## Quick Deploy to Railway

### Step 1: Push Your Code to GitHub ✅
**Already done!** Your code is at: `https://github.com/NGOKrooz/SPIN.git`

### Step 2: Sign Up for Railway
1. Go to: **https://railway.app**
2. Click "Start a New Project"
3. Sign in with GitHub
4. Authorize Railway to access your repositories

### Step 3: Deploy from GitHub

1. **Create New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose: `NGOKrooz/SPIN`
   - Railway will detect the Dockerfile automatically ✅

2. **Set Environment Variables**
   Click on your service → "Variables" tab and add:

   ```env
   PORT=5000
   NODE_ENV=production
   ADMIN_PASSWORD=YourSecurePasswordHere123!
   JWT_SECRET=your-random-secret-key-min-32-chars
   CORS_ORIGIN=*
   ```

   **Important**: 
   - Replace `ADMIN_PASSWORD` with a strong password
   - Generate a random `JWT_SECRET` (at least 32 characters)

3. **Deploy!**
   - Railway will automatically build and deploy your app
   - Wait 3-5 minutes for the first deployment
   - You'll get a URL like: `https://spin-production.up.railway.app`

### Step 4: Access Your App

Once deployed:
- **Frontend & API**: `https://your-app-name.up.railway.app`
- **API Health Check**: `https://your-app-name.up.railway.app/api/health`
- **Dashboard**: `https://your-app-name.up.railway.app/`

### Step 5: Add Custom Domain (Optional)

1. Go to your service settings
2. Click "Settings" → "Networking" → "Public Networking"
3. Click "Generate Domain" (free Railway domain)
4. Or add your own custom domain

### Step 6: Add Database (Required)

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically add `DATABASE_URL` to your service
4. Redeploy your app (it will use PostgreSQL automatically)

---

## 🎯 Alternative: Deploy to Render (Also Free)

### Option 1: One-Click Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Option 2: Manual Deploy

1. Go to: **https://render.com**
2. Sign up with GitHub
3. Click "New" → "Web Service"
4. Connect your GitHub repo: `NGOKrooz/SPIN`
5. Configure:
   - **Name**: spin-app
   - **Environment**: Docker
   - **Branch**: main
   - **Plan**: Free
6. Add Environment Variables (same as Railway)
7. Click "Create Web Service"

---

## 🔒 Security Checklist

Before going live:

- [ ] Set a strong `ADMIN_PASSWORD` (min 12 characters)
- [ ] Generate a random `JWT_SECRET` (min 32 characters)
- [ ] Update `CORS_ORIGIN` to your actual domain (after deploy)
- [ ] Enable HTTPS (automatic on Railway/Render)
- [ ] Test the admin login with your password

---

## 📊 Monitor Your Deployment

### Railway Dashboard
- View logs: Click your service → "Deployments" → "View Logs"
- Check metrics: CPU, Memory, Network usage
- Monitor builds: See build status and errors

### Health Check
```bash
curl https://your-app-name.up.railway.app/api/health
```

Should return:
```json
{
  "status": "OK",
  "message": "SPIN API is running",
  "timestamp": "2025-11-06T..."
}
```

---

## 🔄 Update Your Deployed App

After making changes:

```bash
# Commit and push changes
git add .
git commit -m "Your update message"
git push origin main
```

Railway will automatically:
1. Detect the new commit
2. Build the new Docker image
3. Deploy the update
4. Switch over with zero downtime

---

## 💡 Tips

1. **Free Tier Limits**:
   - Railway: $5 free credit/month
   - Render: 750 hours/month free
   - Both include HTTPS automatically

2. **Database**:
   - PostgreSQL is required (no SQLite fallback)

3. **Backup Strategy**:
   - Enable cloud backups for PostgreSQL

4. **Performance**:
   - First load might be slow (cold start)
   - Upgrade to paid plan for always-on instances

---

## 🆘 Troubleshooting

### Build Fails
- Check Railway logs for errors
- Ensure all dependencies are in package.json
- Verify Dockerfile is correct

### App Won't Start
- Check environment variables are set
- Verify PORT is set to 5000
- Check logs for startup errors

### API Not Working
- Test health endpoint: `/api/health`
- Check CORS_ORIGIN is set correctly
- Verify admin password is set

### Database Issues
- Ensure DATABASE_URL is set by Railway

---

## 📞 Support

- Railway Docs: https://docs.railway.app
- Render Docs: https://render.com/docs
- GitHub Issues: https://github.com/NGOKrooz/SPIN/issues

---

**Your app is ready to deploy! 🚀**

Choose Railway (recommended) or Render and follow the steps above.

