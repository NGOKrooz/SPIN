# SPIN - Smart Physiotherapy Internship Network Deployment Guide

## 🚀 Production Deployment

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (for production)
- PM2 process manager (recommended)
- Nginx web server (optional)

### 1. Environment Setup

#### Server Environment Variables
Create `server/.env` with production values:
```env
PORT=5000
NODE_ENV=production
JWT_SECRET=your_secure_jwt_secret_here
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
CORS_ORIGIN=https://yourdomain.com
```

#### Client Environment Variables
Create `client/.env` with production values:
```env
REACT_APP_API_URL=https://yourdomain.com/api
```

### 2. Database Setup (PostgreSQL)
1. Install PostgreSQL
2. Create database:
```sql
CREATE DATABASE spin_production;
CREATE USER spin_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE spin_production TO spin_user;
```

3. Set `DATABASE_URL` in `server/.env`

### 3. Build and Deploy

#### Build the Application
```bash
# Install dependencies
npm run install-all

# Build client for production
cd client
npm run build
cd ..
```

#### Deploy with PM2
```bash
# Install PM2 globally
npm install -g pm2

# Create PM2 ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'spin-server',
    script: 'server/index.js',
    cwd: '/path/to/spin',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 4. Nginx Configuration (Optional)

Create `/etc/nginx/sites-available/spin`:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Serve React app
    location / {
        root /path/to/spin/client/build;
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/spin /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5. SSL Certificate (Recommended)

Using Let's Encrypt:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### 6. Backup Strategy

#### Database Backup
```bash
pg_dump -h localhost -U spin_user spin_production > backups/spin_$(date +%Y%m%d_%H%M%S).sql
```

#### Automated Backup Script
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/path/to/backups"
mkdir -p $BACKUP_DIR

# Database backup
pg_dump -h localhost -U spin_user spin_production > $BACKUP_DIR/spin_$DATE.sql

# Keep only last 30 days
find $BACKUP_DIR -name "spin_*.sql" -mtime +30 -delete

echo "Backup completed: spin_$DATE.sql"
```

### 7. Monitoring

#### PM2 Monitoring
```bash
pm2 monit
pm2 logs spin-server
```

#### Health Check
```bash
curl http://localhost:5000/api/health
```

### 8. Updates and Maintenance

#### Update Application
```bash
# Pull latest changes
git pull origin main

# Install new dependencies
npm run install-all

# Build client
cd client && npm run build && cd ..

# Restart server
pm2 restart spin-server
```

#### Database Migrations
```bash
# Run any database migrations
cd server
node scripts/migrate.js
```

### 9. Security Considerations

1. **Environment Variables**: Never commit `.env` files
2. **JWT Secret**: Use a strong, random JWT secret
3. **Database**: Use strong passwords and limit access
4. **HTTPS**: Always use SSL in production
5. **Firewall**: Restrict database access to application server only
6. **Updates**: Keep dependencies updated regularly

### 10. Performance Optimization

1. **Database Indexing**: Add indexes for frequently queried fields
2. **Caching**: Implement Redis for session storage
3. **CDN**: Use CDN for static assets
4. **Compression**: Enable gzip compression in Nginx
5. **Monitoring**: Set up application performance monitoring

### 11. Troubleshooting

#### Common Issues

**Server won't start:**
```bash
# Check logs
pm2 logs spin-server

# Check port availability
netstat -tulpn | grep :5000
```

**Database connection issues:**
```bash
# Check database file permissions
ls -la server/database/

# Test database connection
cd server && node -e "const db = require('./database/init'); console.log('DB OK');"
```

**Client build issues:**
```bash
# Clear cache and rebuild
cd client
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 12. Support

For technical support:
- Check the logs: `pm2 logs spin-server`
- Review the documentation in `/docs`
- Contact the development team

---

**Note**: This deployment guide assumes a Linux server environment. Adjust commands for Windows or macOS as needed.
