#!/bin/bash

# ============================================
# Nexus K8s - Deploy All Services
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Nexus - Deploying to Kubernetes${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Navigate to project root
cd "$(dirname "$0")/../.."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    exit 1
fi

# Apply base configuration
echo -e "${GREEN}Creating namespace...${NC}"
kubectl apply -f k8s/base/namespace.yaml

echo -e "${GREEN}Creating ConfigMaps and Secrets...${NC}"
kubectl apply -f k8s/base/configmap.yaml
kubectl apply -f k8s/base/secrets.yaml

# Deploy database services
echo -e "${GREEN}Deploying PostgreSQL...${NC}"
kubectl apply -f k8s/services/postgres/statefulset.yaml
kubectl apply -f k8s/services/postgres/service.yaml

echo -e "${GREEN}Deploying Redis...${NC}"
kubectl apply -f k8s/services/redis/deployment.yaml
kubectl apply -f k8s/services/redis/service.yaml

# Wait for databases to be ready
echo -e "${YELLOW}Waiting for databases to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=postgres -n nexus --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis -n nexus --timeout=60s

# Deploy application services
echo -e "${GREEN}Deploying workspace-kernel...${NC}"
kubectl apply -f k8s/services/workspace-kernel/deployment.yaml
kubectl apply -f k8s/services/workspace-kernel/service.yaml
kubectl apply -f k8s/services/workspace-kernel/hpa.yaml

echo -e "${GREEN}Deploying nexus-os...${NC}"
kubectl apply -f k8s/services/nexus-os/deployment.yaml
kubectl apply -f k8s/services/nexus-os/service.yaml

echo -e "${GREEN}Deploying graphstudio-frontend...${NC}"
kubectl apply -f k8s/services/graphstudio/deployment.yaml
kubectl apply -f k8s/services/graphstudio/service.yaml

# Wait for deployments to be ready
echo -e "${YELLOW}Waiting for deployments to be ready...${NC}"
kubectl wait --for=condition=available deployment/workspace-kernel -n nexus --timeout=180s
kubectl wait --for=condition=available deployment/nexus-os -n nexus --timeout=120s
kubectl wait --for=condition=available deployment/graphstudio-frontend -n nexus --timeout=120s

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Deployment completed successfully!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""

# Show status
echo -e "${BLUE}Current Status:${NC}"
kubectl get pods -n nexus

echo ""
echo -e "${BLUE}Services:${NC}"
kubectl get svc -n nexus

echo ""
echo -e "${YELLOW}To access GraphStudio frontend:${NC}"
echo -e "  ${GREEN}kubectl port-forward -n nexus svc/graphstudio-frontend 8080:80${NC}"
echo -e "  Then open: ${BLUE}http://localhost:8080${NC}"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo -e "  ${GREEN}./k8s/scripts/logs.sh workspace-kernel${NC}"
echo -e "  ${GREEN}./k8s/scripts/logs.sh nexus-os${NC}"
echo -e "  ${GREEN}./k8s/scripts/logs.sh graphstudio-frontend${NC}"
echo ""
