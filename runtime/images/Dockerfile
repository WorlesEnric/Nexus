# Nexus Runtime Dockerfile
# Multi-stage build for optimal image size

# ============================================
# Stage 1: Build Rust WASM Bridge
# ============================================
FROM rust:1.75-bookworm AS rust-builder

WORKDIR /build

# Install WasmEdge runtime dependencies
RUN apt-get update && apt-get install -y \
    cmake \
    ninja-build \
    llvm-dev \
    libclang-dev \
    && rm -rf /var/lib/apt/lists/*

# Install WasmEdge
RUN curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash -s -- -v 0.13.5

# Copy Rust project
COPY nexus-wasm-bridge/Cargo.toml nexus-wasm-bridge/Cargo.lock ./
COPY nexus-wasm-bridge/src ./src

# Build the native module
ENV WASMEDGE_DIR=/root/.wasmedge
ENV LD_LIBRARY_PATH=/root/.wasmedge/lib
RUN cargo build --release

# ============================================
# Stage 2: Build Node.js Application
# ============================================
FROM node:20-bookworm-slim AS node-builder

WORKDIR /build

# Copy package files
COPY workspace-kernel/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy TypeScript source
COPY workspace-kernel/tsconfig.json ./
COPY workspace-kernel/src ./src

# Build TypeScript
RUN npm run build

# ============================================
# Stage 3: Production Runtime
# ============================================
FROM node:20-bookworm-slim AS production

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libstdc++6 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install WasmEdge runtime (libraries only)
RUN curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash -s -- -v 0.13.5 -p /usr/local

# Copy built artifacts
COPY --from=rust-builder /build/target/release/libnexus_wasm_bridge.so /app/native/
COPY --from=node-builder /build/dist ./dist
COPY --from=node-builder /build/node_modules ./node_modules
COPY --from=node-builder /build/package.json ./

# Copy QuickJS WASM module (must be built separately and provided)
# COPY assets/quickjs.async.wasm /app/assets/

# Create non-root user
RUN groupadd -r nexus && useradd -r -g nexus nexus
RUN chown -R nexus:nexus /app

# Create cache directory
RUN mkdir -p /tmp/nexus-cache && chown nexus:nexus /tmp/nexus-cache

USER nexus

# Environment
ENV NODE_ENV=production
ENV HTTP_PORT=3000
ENV WS_PORT=3001
ENV HOST=0.0.0.0
ENV LOG_LEVEL=info
ENV CACHE_DIR=/tmp/nexus-cache
ENV LD_LIBRARY_PATH=/usr/local/lib

# Expose ports
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Run the application
CMD ["node", "dist/index.js"]

# ============================================
# Stage 4: Development
# ============================================
FROM node:20-bookworm AS development

WORKDIR /app

# Install development dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    ninja-build \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Install WasmEdge
RUN curl -sSf https://raw.githubusercontent.com/WasmEdge/WasmEdge/master/utils/install.sh | bash -s -- -v 0.13.5
ENV WASMEDGE_DIR=/root/.wasmedge
ENV LD_LIBRARY_PATH=/root/.wasmedge/lib

# Copy all source
COPY . .

# Install Node.js dependencies
WORKDIR /app/workspace-kernel
RUN npm install

# Install pino-pretty for development logs
RUN npm install -D pino-pretty

WORKDIR /app

# Environment
ENV NODE_ENV=development
ENV HTTP_PORT=3000
ENV WS_PORT=3001
ENV HOST=0.0.0.0
ENV LOG_LEVEL=debug
ENV LOG_PRETTY=true

EXPOSE 3000 3001

CMD ["npm", "run", "dev", "--prefix", "workspace-kernel"]
