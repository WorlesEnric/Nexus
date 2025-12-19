#!/bin/bash

# ============================================
# Nexus Python - Build Docker Images
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Nexus Python - Building Docker Images${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/../.."

# Build workspace-kernel
echo -e "${GREEN}Building workspace-kernel...${NC}"
docker build -f docker/workspace-kernel.Dockerfile \
    -t nexus/workspace-kernel:latest \
    .

# Build graphstudio-backend
echo -e "${GREEN}Building graphstudio-backend...${NC}"
docker build -f docker/graphstudio-backend.Dockerfile \
    -t nexus/graphstudio-backend:latest \
    .

# Build graphstudio frontend
echo -e "${GREEN}Building graphstudio-frontend...${NC}"
docker build -f docker/graphstudio-frontend.Dockerfile \
    --build-arg VITE_API_BASE_URL=http://localhost:30090 \
    --build-arg VITE_WORKSPACE_KERNEL_URL=http://localhost:30091 \
    -t nexus/graphstudio-frontend:latest \
    .

# Build nexus-state
echo -e "${GREEN}Building nexus-state...${NC}"
docker build -f docker/nexus-state.Dockerfile \
    -t nexus/nexus-state:latest \
    .

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  All images built successfully!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "Images available:"
echo -e "  - ${BLUE}nexus/workspace-kernel:latest${NC}"
echo -e "  - ${BLUE}nexus/graphstudio-backend:latest${NC}"
echo -e "  - ${BLUE}nexus/graphstudio-frontend:latest${NC}"
echo -e "  - ${BLUE}nexus/nexus-state:latest${NC}"
echo ""
