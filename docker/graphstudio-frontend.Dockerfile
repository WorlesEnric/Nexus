# GraphStudio Frontend Dockerfile
# React + Vite application served by Nginx

# Stage 1: Build the application
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY apps/GraphStudio/package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY apps/GraphStudio ./

# Build arguments for API URLs
ARG VITE_API_BASE_URL=http://localhost:30090
ARG VITE_WORKSPACE_KERNEL_URL=http://localhost:30091

# Set environment variables for Vite build
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_WORKSPACE_KERNEL_URL=$VITE_WORKSPACE_KERNEL_URL

# Build the application
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
