# Nexus State Service Dockerfile
# FastAPI service for Nexus state management with Redis caching and Git snapshots

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy trilog and trilog-schemas first (dependencies)
COPY trilog /app/trilog
COPY trilog-schemas /app/trilog_schemas

# Create symlink for trilog-schemas (trilog_setup.py looks for hyphen version)
RUN ln -s /app/trilog_schemas /app/trilog-schemas

# Install trilog first
RUN pip install --no-cache-dir -e /app/trilog

# Copy package directories
COPY packages/nexus-protocol /app/packages/nexus-protocol
COPY runtime/nexus-core /app/runtime/nexus-core
COPY runtime/nexus-state /app/runtime/nexus-state

# Install Python packages
RUN pip install --no-cache-dir -e /app/packages/nexus-protocol
RUN pip install --no-cache-dir -e /app/runtime/nexus-core
RUN pip install --no-cache-dir -e /app/runtime/nexus-state

# Create directories for Git state storage
RUN mkdir -p /app/state-snapshots

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV GIT_WORKSPACE_ROOT=/app/state-snapshots
ENV PYTHONPATH=/app/runtime/nexus-state:/app

# Run application
CMD ["uvicorn", "nexus_state.main:app", "--host", "0.0.0.0", "--port", "8001"]
