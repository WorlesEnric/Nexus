#!/bin/bash

# ============================================
# Nexus K8s - Cleanup All Resources
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${RED}================================================${NC}"
echo -e "${RED}  WARNING: This will delete all Nexus resources${NC}"
echo -e "${RED}================================================${NC}"
echo ""

# Confirm
read -p "Are you sure you want to delete all resources? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo -e "${YELLOW}Cleanup cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Deleting all resources in nexus namespace...${NC}"

# Delete all resources in namespace
kubectl delete namespace nexus --wait=true

echo ""
echo -e "${GREEN}Cleanup completed!${NC}"
echo ""

# Ask if user wants to delete persistent volumes
read -p "Do you want to delete persistent volumes? (yes/no): " delete_pv

if [ "$delete_pv" = "yes" ]; then
    echo -e "${YELLOW}Deleting persistent volumes...${NC}"
    kubectl delete pvc --all -n nexus || true
    kubectl delete pv -l app=postgres || true
    echo -e "${GREEN}Persistent volumes deleted${NC}"
fi

echo ""
echo -e "${BLUE}To redeploy, run: ./k8s/scripts/deploy.sh${NC}"
echo ""
