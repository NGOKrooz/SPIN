# Use Debian-based image for better prebuilt binaries (sqlite3, etc.)
FROM node:18-bullseye-slim

# Environment optimizations and skip heavy Chromium download for puppeteer
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_LOGLEVEL=warn \
    NPM_CONFIG_FETCH_TIMEOUT=300000 \
    NPM_CONFIG_FETCH_RETRIES=10 \
    CI=false \
    NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install root dependencies (use install instead of ci for flexibility)
RUN npm install --no-audit --fund=false --legacy-peer-deps || npm install --no-audit --fund=false

# Install server dependencies
RUN cd server && \
    if [ -f package-lock.json ]; then \
        npm ci --omit=dev --no-audit --fund=false --legacy-peer-deps || npm install --omit=dev --no-audit --fund=false --legacy-peer-deps; \
    else \
        npm install --omit=dev --no-audit --fund=false --legacy-peer-deps; \
    fi

# Install client dependencies
RUN cd client && \
    if [ -f package-lock.json ]; then \
        npm ci --no-audit --fund=false --legacy-peer-deps || npm install --no-audit --fund=false --legacy-peer-deps; \
    else \
        npm install --no-audit --fund=false --legacy-peer-deps; \
    fi

# Copy source code
COPY . .

# Build the client (with increased memory limit for Railway)
RUN cd client && NODE_OPTIONS="--max-old-space-size=2048" npm run build || \
    (echo "Build failed, retrying..." && NODE_OPTIONS="--max-old-space-size=2048" npm run build)

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Start the server (production)
CMD ["node", "server/index.js"]
