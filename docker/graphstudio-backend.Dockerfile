# GraphStudio Backend Dockerfile
# FastAPI service for authentication and subscription management

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install trilog first (local dependency with schemas)
COPY trilog /trilog
RUN pip install --no-cache-dir -e /trilog

# Copy trilog-schemas (needed for graphstudio-backend)
COPY trilog-schemas /trilog_schemas

# Create symlink for trilog-schemas (trilog_setup.py looks for hyphen version)
RUN ln -s /trilog_schemas /trilog-schemas

# Copy requirements and install
COPY runtime/graphstudio-backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy application code
COPY runtime/graphstudio-backend /app

# Copy NXML panel files for marketplace seeding
COPY apps/GraphStudio/src/panels/nxml /app/nxml_panels

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:3000/ || exit 1

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app:/

# Run application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
