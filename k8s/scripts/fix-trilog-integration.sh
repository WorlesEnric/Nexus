#!/bin/bash
#
# TriLog K8s Integration Fix Script
# This script configures Nexus services to properly connect to TriLog infrastructure
#
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔧 Fixing TriLog K8s Integration...${NC}"
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl not found. Please install kubectl first.${NC}"
    exit 1
fi

# Check if TriLog namespace exists
echo -e "${YELLOW}📍 Checking TriLog infrastructure...${NC}"
if ! kubectl get namespace trilog-system &> /dev/null; then
    echo -e "${RED}❌ TriLog namespace 'trilog-system' not found!${NC}"
    echo -e "${YELLOW}   Please deploy TriLog infrastructure first:${NC}"
    echo -e "   kubectl apply -f trilog/k8s/namespace.yaml"
    echo -e "   kubectl apply -k trilog/k8s/base/"
    exit 1
fi

# Check if TriLog OTel Collector is running
if ! kubectl get svc trilog-otel-collector -n trilog-system &> /dev/null; then
    echo -e "${RED}❌ TriLog OTel Collector service not found!${NC}"
    echo -e "${YELLOW}   Please deploy TriLog infrastructure first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ TriLog infrastructure found${NC}"
echo ""

# Update ConfigMap
echo -e "${YELLOW}📝 Updating Nexus ConfigMap...${NC}"
kubectl patch configmap nexus-config -n nexus-python --type merge -p '{
  "data": {
    "TRILOG_ENABLED": "true",
    "OTEL_ENDPOINT": "trilog-otel-collector.trilog-system.svc.cluster.local:4317",
    "DEPLOYMENT_ENV": "production"
  }
}' || {
    echo -e "${RED}❌ Failed to update ConfigMap${NC}"
    exit 1
}
echo -e "${GREEN}✅ ConfigMap updated${NC}"
echo ""

# Restart services
echo -e "${YELLOW}🔄 Restarting Nexus services to apply changes...${NC}"

# Restart graphstudio-backend
if kubectl get deployment graphstudio-backend -n nexus-python &> /dev/null; then
    echo "  → Restarting graphstudio-backend..."
    kubectl rollout restart deployment/graphstudio-backend -n nexus-python
else
    echo -e "${YELLOW}  ⚠️  graphstudio-backend not found, skipping${NC}"
fi

# Restart workspace-kernel
if kubectl get deployment workspace-kernel -n nexus-python &> /dev/null; then
    echo "  → Restarting workspace-kernel..."
    kubectl rollout restart deployment/workspace-kernel -n nexus-python
else
    echo -e "${YELLOW}  ⚠️  workspace-kernel not found, skipping${NC}"
fi

echo -e "${GREEN}✅ Services restarted${NC}"
echo ""

# Wait for rollouts
echo -e "${YELLOW}⏳ Waiting for deployments to complete...${NC}"

if kubectl get deployment graphstudio-backend -n nexus-python &> /dev/null; then
    echo "  → Waiting for graphstudio-backend..."
    kubectl rollout status deployment/graphstudio-backend -n nexus-python --timeout=120s || true
fi

if kubectl get deployment workspace-kernel -n nexus-python &> /dev/null; then
    echo "  → Waiting for workspace-kernel..."
    kubectl rollout status deployment/workspace-kernel -n nexus-python --timeout=120s || true
fi

echo ""

# Verify integration
echo -e "${YELLOW}✅ Verifying TriLog initialization...${NC}"
echo ""

# Wait a bit for services to initialize
sleep 10

# Check graphstudio-backend
if kubectl get deployment graphstudio-backend -n nexus-python &> /dev/null; then
    echo -e "${YELLOW}📋 graphstudio-backend logs:${NC}"
    if kubectl logs -n nexus-python deployment/graphstudio-backend --tail=50 2>/dev/null | grep -i "trilog initialized"; then
        echo -e "${GREEN}   ✅ TriLog initialized successfully${NC}"
    else
        echo -e "${YELLOW}   ⚠️  No TriLog initialization message found (may still be starting)${NC}"
    fi
    echo ""
fi

# Check workspace-kernel
if kubectl get deployment workspace-kernel -n nexus-python &> /dev/null; then
    echo -e "${YELLOW}📋 workspace-kernel logs:${NC}"
    if kubectl logs -n nexus-python deployment/workspace-kernel --tail=50 2>/dev/null | grep -i "trilog initialized"; then
        echo -e "${GREEN}   ✅ TriLog initialized successfully${NC}"
    else
        echo -e "${YELLOW}   ⚠️  No TriLog initialization message found (may still be starting)${NC}"
    fi
    echo ""
fi

# Test DNS resolution
echo -e "${YELLOW}🔍 Testing cross-namespace DNS resolution...${NC}"
if kubectl get deployment workspace-kernel -n nexus-python &> /dev/null; then
    WORKSPACE_POD=$(kubectl get pods -n nexus-python -l app=workspace-kernel -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    if [ -n "$WORKSPACE_POD" ]; then
        if kubectl exec -n nexus-python "$WORKSPACE_POD" -- nslookup trilog-otel-collector.trilog-system.svc.cluster.local &> /dev/null; then
            echo -e "${GREEN}   ✅ DNS resolution working${NC}"
        else
            echo -e "${YELLOW}   ⚠️  DNS resolution test failed (may need CoreDNS restart)${NC}"
        fi
    fi
fi
echo ""

# Summary
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✨ TriLog Integration Fix Complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Check pod logs for 'TriLog initialized' messages:"
echo "     kubectl logs -n nexus-python deployment/graphstudio-backend"
echo "     kubectl logs -n nexus-python deployment/workspace-kernel"
echo ""
echo "  2. Verify events are reaching ClickHouse:"
echo "     kubectl port-forward -n trilog-system svc/trilog-clickhouse 8123:8123"
echo "     curl 'http://localhost:8123/?query=SELECT+COUNT(*)+FROM+trilog.trilog_events'"
echo ""
echo "  3. Check OTel Collector health:"
echo "     kubectl port-forward -n trilog-system svc/trilog-otel-collector 13133:13133"
echo "     curl http://localhost:13133/health"
echo ""
echo -e "${GREEN}📚 Full documentation: k8s/TRILOG_K8S_INTEGRATION_ISSUES.md${NC}"
