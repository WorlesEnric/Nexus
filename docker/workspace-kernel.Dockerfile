# ============================================
# Nexus Workspace Kernel Dockerfile
# Multi-tenant backend service
# ============================================

FROM node:20-alpine AS builder
WORKDIR /app

# Copy all source code
COPY packages/nexus-protocol ./packages/nexus-protocol
COPY packages/nexus-reactor ./packages/nexus-reactor
COPY runtime/workspace-kernel ./runtime/workspace-kernel

# Build nexus-protocol
WORKDIR /app/packages/nexus-protocol
RUN npm ci && npm run build

# Build nexus-reactor
WORKDIR /app/packages/nexus-reactor
RUN npm ci && npm run build

# Build workspace-kernel
WORKDIR /app/runtime/workspace-kernel
RUN npm ci

# Link local packages
RUN rm -rf node_modules/@nexus/protocol && \
    rm -rf node_modules/@nexus/reactor && \
    mkdir -p node_modules/@nexus && \
    ln -sf /app/packages/nexus-protocol node_modules/@nexus/protocol && \
    ln -sf /app/packages/nexus-reactor node_modules/@nexus/reactor

# Build workspace-kernel
RUN npm run build

# Generate Prisma Client
RUN npx prisma generate

# Production stage
FROM node:20-alpine AS runtime

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

WORKDIR /app

# Copy built artifacts
COPY --from=builder /app/runtime/workspace-kernel/dist ./dist
COPY --from=builder /app/runtime/workspace-kernel/prisma ./prisma
COPY --from=builder /app/runtime/workspace-kernel/node_modules ./node_modules
COPY --from=builder /app/runtime/workspace-kernel/package.json ./package.json
COPY --from=builder /app/packages/nexus-protocol ./node_modules/@nexus/protocol
COPY --from=builder /app/packages/nexus-reactor ./node_modules/@nexus/reactor

# Create workspace directory and change ownership
RUN mkdir -p /workspaces && chmod 777 /workspaces && \
    chown -R node:node /app

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info
ENV MULTI_TENANT_MODE=true
ENV MAX_WORKSPACES_PER_POD=50
ENV IDLE_WORKSPACE_TIMEOUT_MS=1800000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Expose port
EXPOSE 3000

# Run as non-root user
USER node

# Start server
CMD ["node", "dist/index.js"]
