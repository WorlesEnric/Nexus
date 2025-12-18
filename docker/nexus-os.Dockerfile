# ============================================
# Nexus OS Dockerfile
# AI service for context building and LLM integration
# ============================================

FROM node:20-alpine AS builder
WORKDIR /app

# Copy all source code
COPY packages/nexus-protocol ./packages/nexus-protocol
COPY packages/nexus-reactor ./packages/nexus-reactor
COPY services/nexus-os ./services/nexus-os

# Build nexus-protocol
WORKDIR /app/packages/nexus-protocol
RUN npm ci && npm run build

# Build nexus-reactor
WORKDIR /app/packages/nexus-reactor
RUN npm ci && npm run build

# Build NexusOS
WORKDIR /app/services/nexus-os
RUN npm ci

# Link local packages
RUN rm -rf node_modules/@nexus/protocol && \
    rm -rf node_modules/@nexus/reactor && \
    mkdir -p node_modules/@nexus && \
    ln -sf /app/packages/nexus-protocol node_modules/@nexus/protocol && \
    ln -sf /app/packages/nexus-reactor node_modules/@nexus/reactor

# Build NexusOS
RUN npm run build

# Production runtime
FROM node:20-alpine AS runtime
WORKDIR /app

# Copy everything from builder
COPY --from=builder /app/services/nexus-os ./

# Change ownership to node user
RUN chown -R node:node /app

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000
ENV LOG_LEVEL=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Expose port
EXPOSE 4000

# Run as non-root user
USER node

# Start server
CMD ["node", "dist/index.js"]
