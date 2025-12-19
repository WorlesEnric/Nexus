#!/bin/bash

# ============================================
# Nexus Python - Deploy All Services
# ============================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Nexus Python - Deploying to Kubernetes${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Navigate to project root
cd "$(dirname "$0")/../.."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed${NC}"
    exit 1
fi

# Detect if using kind cluster
CURRENT_CONTEXT=$(kubectl config current-context)
IS_KIND=false
if [[ "$CURRENT_CONTEXT" == kind-* ]]; then
    IS_KIND=true
    CLUSTER_NAME=${CURRENT_CONTEXT#kind-}
    echo -e "${YELLOW}Detected kind cluster: ${CLUSTER_NAME}${NC}"
fi

# Check if images exist
echo -e "${YELLOW}Checking Docker images...${NC}"
IMAGES=(
    "nexus/workspace-kernel:latest"
    "nexus/graphstudio-frontend:latest"
    "nexus/graphstudio-backend:latest"
    "nexus/nexus-state:latest"
)

MISSING_IMAGES=()
for img in "${IMAGES[@]}"; do
    if ! docker image inspect "$img" > /dev/null 2>&1; then
        MISSING_IMAGES+=("$img")
    fi
done

if [ ${#MISSING_IMAGES[@]} -gt 0 ]; then
    echo -e "${RED}Error: Missing Docker images:${NC}"
    for img in "${MISSING_IMAGES[@]}"; do
        echo -e "  - ${RED}$img${NC}"
    done
    echo ""
    echo -e "${YELLOW}Please run: ./k8s/scripts/build-images.sh${NC}"
    exit 1
fi

# Load images to kind cluster if needed
if [ "$IS_KIND" = true ]; then
    echo -e "${YELLOW}Loading images to kind cluster...${NC}"
    for img in "${IMAGES[@]}"; do
        echo -e "  Loading ${BLUE}$img${NC}"
        kind load docker-image "$img" --name "$CLUSTER_NAME"
    done
    echo -e "${GREEN}Images loaded successfully${NC}"
    echo ""
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
kubectl wait --for=condition=ready pod -l app=postgres -n nexus-python --timeout=120s
kubectl wait --for=condition=ready pod -l app=redis -n nexus-python --timeout=60s

# Deploy application services
echo -e "${GREEN}Deploying workspace-kernel...${NC}"
kubectl apply -f k8s/services/workspace-kernel/deployment.yaml
kubectl apply -f k8s/services/workspace-kernel/service.yaml
kubectl apply -f k8s/services/workspace-kernel/hpa.yaml

echo -e "${GREEN}Deploying nexus-state...${NC}"
kubectl apply -f k8s/services/nexus-state/deployment.yaml
kubectl apply -f k8s/services/nexus-state/service.yaml
kubectl apply -f k8s/services/nexus-state/hpa.yaml

echo -e "${GREEN}Deploying graphstudio-backend...${NC}"
kubectl apply -f k8s/services/graphstudio/backend-deployment.yaml
kubectl apply -f k8s/services/graphstudio/backend-service.yaml

echo -e "${GREEN}Deploying graphstudio-frontend...${NC}"
kubectl apply -f k8s/services/graphstudio/frontend-deployment.yaml
kubectl apply -f k8s/services/graphstudio/frontend-service.yaml

# Deploy ingress (optional)
if [ -f k8s/ingress/ingress.yaml ]; then
    echo -e "${GREEN}Deploying ingress...${NC}"
    kubectl apply -f k8s/ingress/ingress.yaml
fi

# Wait for deployments to be ready
echo -e "${YELLOW}Waiting for deployments to be ready...${NC}"
echo -e "  Waiting for workspace-kernel..."
kubectl wait --for=condition=available deployment/workspace-kernel -n nexus-python --timeout=18s || {
    echo -e "${RED}Warning: workspace-kernel deployment timed out${NC}"
    echo -e "${YELLOW}Checking pod status...${NC}"
    kubectl get pods -n nexus-python -l app=workspace-kernel
}

echo -e "  Waiting for nexus-state..."
kubectl wait --for=condition=available deployment/nexus-state -n nexus-python --timeout=18s || {
    echo -e "${RED}Warning: nexus-state deployment timed out${NC}"
    echo -e "${YELLOW}Checking pod status...${NC}"
    kubectl get pods -n nexus-python -l app=nexus-state
}

echo -e "  Waiting for graphstudio-backend..."
kubectl wait --for=condition=available deployment/graphstudio-backend -n nexus-python --timeout=12s || {
    echo -e "${RED}Warning: graphstudio-backend deployment timed out${NC}"
    echo -e "${YELLOW}Checking pod status...${NC}"
    kubectl get pods -n nexus-python -l app=graphstudio-backend
}

echo -e "  Waiting for graphstudio-frontend..."
kubectl wait --for=condition=available deployment/graphstudio-frontend -n nexus-python --timeout=12s || {
    echo -e "${RED}Warning: graphstudio-frontend deployment timed out${NC}"
    echo -e "${YELLOW}Checking pod status...${NC}"
    kubectl get pods -n nexus-python -l app=graphstudio-frontend
}

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Deployment completed successfully!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""

# Show status
echo -e "${BLUE}Current Status:${NC}"
kubectl get pods -n nexus-python

echo ""
echo -e "${BLUE}Services:${NC}"
kubectl get svc -n nexus-python

echo ""
echo -e "${YELLOW}To access GraphStudio frontend:${NC}"
echo -e "  ${GREEN}kubectl port-forward -n nexus-python svc/graphstudio-frontend 8080:80${NC}"
echo -e "  Then open: ${BLUE}http://localhost:8080${NC}"
echo -e ""
echo -e "  Or via NodePort: ${BLUE}http://localhost:30080${NC}"
echo ""
echo -e "${YELLOW}To view logs:${NC}"
echo -e "  ${GREEN}./k8s/scripts/logs.sh workspace-kernel${NC}"
echo -e "  ${GREEN}./k8s/scripts/logs.sh nexus-state${NC}"
echo -e "  ${GREEN}./k8s/scripts/logs.sh graphstudio-backend${NC}"
echo -e "  ${GREEN}./k8s/scripts/logs.sh graphstudio-frontend${NC}"
echo ""
echo -e "${YELLOW}To check status:${NC}"
echo -e "  ${GREEN}./k8s/scripts/status.sh${NC}"
echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Setting up port forwarding...${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
echo -e "${YELLOW}Killing any existing port-forwards...${NC}"
pkill -f "kubectl port-forward" || true
sleep 2
echo -e "${GREEN}Starting port-forwards in background...${NC}"
kubectl port-forward -n nexus-python svc/graphstudio-frontend 8080:80 > /dev/null 2>&1 &
kubectl port-forward -n nexus-python svc/graphstudio-backend 30090:3000 > /dev/null 2>&1 &
kubectl port-forward -n nexus-python svc/workspace-kernel 30091:8000 > /dev/null 2>&1 &
kubectl port-forward -n nexus-python svc/nexus-state 30092:8001 > /dev/null 2>&1 &
sleep 3
echo ""
echo -e "${GREEN}Port-forwards established!${NC}"
echo -e "  ${BLUE}Frontend:${NC}         http://localhost:8080"
echo -e "  ${BLUE}Backend API:${NC}      http://localhost:30090"
echo -e "  ${BLUE}Workspace Kernel:${NC} http://localhost:30091"
echo -e "  ${BLUE}Nexus State:${NC}      http://localhost:30092"
echo ""
echo -e "${YELLOW}Note: Port-forwards run in background. To stop them:${NC}"
echo -e "  ${GREEN}pkill -f 'kubectl port-forward'${NC}"
echo ""
