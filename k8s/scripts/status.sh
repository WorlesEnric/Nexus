#!/bin/bash

# ============================================
# Nexus Python - Check Status
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Nexus Python - Kubernetes Status${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if namespace exists
if ! kubectl get namespace nexus-python &> /dev/null; then
    echo -e "${RED}Namespace 'nexus-python' does not exist${NC}"
    echo -e "${YELLOW}Run ./k8s/scripts/deploy.sh to deploy${NC}"
    exit 1
fi

# Pods status
echo -e "${GREEN}Pods:${NC}"
kubectl get pods -n nexus-python -o wide

echo ""
echo -e "${GREEN}Services:${NC}"
kubectl get svc -n nexus-python

echo ""
echo -e "${GREEN}Deployments:${NC}"
kubectl get deployments -n nexus-python

echo ""
echo -e "${GREEN}StatefulSets:${NC}"
kubectl get statefulsets -n nexus-python

echo ""
echo -e "${GREEN}HPA (Horizontal Pod Autoscaler):${NC}"
kubectl get hpa -n nexus-python

echo ""
echo -e "${GREEN}ConfigMaps:${NC}"
kubectl get configmap -n nexus-python

echo ""
echo -e "${GREEN}Secrets:${NC}"
kubectl get secrets -n nexus-python

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Resource Usage${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if metrics-server is available
if kubectl top nodes &> /dev/null; then
    echo -e "${GREEN}Node Resources:${NC}"
    kubectl top nodes

    echo ""
    echo -e "${GREEN}Pod Resources:${NC}"
    kubectl top pods -n nexus-python
else
    echo -e "${YELLOW}Metrics server not available. Install it to see resource usage.${NC}"
fi

echo ""
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Recent Events${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""
kubectl get events -n nexus-python --sort-by='.lastTimestamp' | tail -10

echo ""
