# Use Node.js 18 as base image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install all dependencies
RUN npm install --production=false
RUN cd server && npm install --production=false
RUN cd client && npm install --production=false

# Verify react-scripts is installed
RUN cd client && ls -la node_modules/.bin/react-scripts || npm install react-scripts --save

# Copy source code
COPY . .

# Build the client
RUN cd client && npm run build

# Expose port
EXPOSE 5000

# Start the server
CMD ["npm", "run", "server"]
