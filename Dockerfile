# Use Debian-based image for better prebuilt binaries (sqlite3, etc.)
FROM node:18-bullseye-slim

# Environment optimizations and skip heavy Chromium download for puppeteer
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_LOGLEVEL=error \
    NPM_CONFIG_FETCH_TIMEOUT=120000 \
    NPM_CONFIG_FETCH_RETRIES=5

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies deterministically and faster
RUN npm ci --no-audit --fund=false
RUN cd server && npm ci --omit=dev --no-audit --fund=false
RUN cd client && npm ci --no-audit --fund=false

# Copy source code
COPY . .

# Build the client
RUN cd client && npm run build

# Expose port
EXPOSE 5000

# Start the server
CMD ["npm", "run", "server"]
