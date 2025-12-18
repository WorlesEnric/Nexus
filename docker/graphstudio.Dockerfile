# ============================================
# GraphStudio Frontend Dockerfile
# React + Vite application served by Nginx
# ============================================

FROM node:20-alpine AS builder
WORKDIR /app

# Copy all source code
COPY packages/nexus-protocol ./packages/nexus-protocol
COPY packages/nexus-reactor ./packages/nexus-reactor
COPY apps/GraphStudio ./apps/GraphStudio

# Build nexus-protocol
WORKDIR /app/packages/nexus-protocol
RUN npm ci && npm run build

# Build nexus-reactor
WORKDIR /app/packages/nexus-reactor
RUN npm ci && npm run build

# Build GraphStudio
WORKDIR /app/apps/GraphStudio
RUN npm ci

# Link local packages
RUN rm -rf node_modules/@nexus/protocol && \
    rm -rf node_modules/@nexus/reactor && \
    mkdir -p node_modules/@nexus && \
    ln -sf /app/packages/nexus-protocol node_modules/@nexus/protocol && \
    ln -sf /app/packages/nexus-reactor node_modules/@nexus/reactor

# Build the application
RUN npm run build

# Production stage with Nginx
FROM nginx:alpine AS runtime

# Copy custom nginx config
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/apps/GraphStudio/dist /usr/share/nginx/html

# Create nginx user
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
