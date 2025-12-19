#!/bin/bash

# ============================================
# Nexus K8s - Build Docker Images
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Nexus - Building Docker Images${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/../.."

# Start local registry if not running
if [ ! "$(docker ps -q -f name=registry)" ]; then
    echo -e "${YELLOW}Starting local Docker registry on port 5001...${NC}"
    docker run -d -p 5001:5000 --name registry registry:2 || true
fi

# Build workspace-kernel
echo -e "${GREEN}Building workspace-kernel...${NC}"
docker build -f docker/workspace-kernel.Dockerfile \
    -t nexus/workspace-kernel:latest \
    -t localhost:5001/nexus/workspace-kernel:latest \
    .

# Push to local registry
docker push localhost:5001/nexus/workspace-kernel:latest

# Build nexus-os
echo -e "${GREEN}Building nexus-os...${NC}"
docker build -f docker/nexus-os.Dockerfile \
    -t nexus/nexus-os:latest \
    -t localhost:5001/nexus/nexus-os:latest \
    .

docker push localhost:5001/nexus/nexus-os:latest

# Build graphstudio frontend
echo -e "${GREEN}Building graphstudio-frontend...${NC}"
docker build -f docker/graphstudio.Dockerfile \
    -t nexus/graphstudio:latest \
    -t localhost:5001/nexus/graphstudio:latest \
    .

docker push localhost:5001/nexus/graphstudio:latest

# Build graphstudio backend
echo -e "${GREEN}Building graphstudio-backend...${NC}"
docker build -f docker/graphstudio-backend.Dockerfile \
    -t nexus/graphstudio-backend:latest \
    -t localhost:5001/nexus/graphstudio-backend:latest \
    .

docker push localhost:5001/nexus/graphstudio-backend:latest

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  All images built successfully!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "Images available:"
echo -e "  - ${BLUE}localhost:5001/nexus/workspace-kernel:latest${NC}"
echo -e "  - ${BLUE}localhost:5001/nexus/nexus-os:latest${NC}"
echo -e "  - ${BLUE}localhost:5001/nexus/graphstudio:latest${NC}"
echo -e "  - ${BLUE}localhost:5001/nexus/graphstudio-backend:latest${NC}"
echo ""
