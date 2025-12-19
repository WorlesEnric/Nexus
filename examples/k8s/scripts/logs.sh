#!/bin/bash

# ============================================
# Nexus K8s - View Service Logs
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

SERVICE=$1
FOLLOW=${2:-false}
TAIL=${3:-100}

if [ -z "$SERVICE" ]; then
    echo -e "${RED}Usage: $0 <service-name> [follow] [tail]${NC}"
    echo ""
    echo -e "${YELLOW}Available services:${NC}"
    echo -e "  - workspace-kernel"
    echo -e "  - nexus-os"
    echo -e "  - graphstudio-frontend"
    echo -e "  - postgres"
    echo -e "  - redis"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo -e "  ${GREEN}$0 workspace-kernel${NC}           # View last 100 lines"
    echo -e "  ${GREEN}$0 workspace-kernel true${NC}      # Follow logs"
    echo -e "  ${GREEN}$0 workspace-kernel false 500${NC} # View last 500 lines"
    exit 1
fi

# Map service names to deployment/statefulset names
case $SERVICE in
    workspace-kernel)
        RESOURCE_TYPE="deployment"
        RESOURCE_NAME="workspace-kernel"
        ;;
    nexus-os)
        RESOURCE_TYPE="deployment"
        RESOURCE_NAME="nexus-os"
        ;;
    graphstudio-frontend|graphstudio)
        RESOURCE_TYPE="deployment"
        RESOURCE_NAME="graphstudio-frontend"
        ;;
    postgres|postgresql)
        RESOURCE_TYPE="statefulset"
        RESOURCE_NAME="postgres"
        ;;
    redis)
        RESOURCE_TYPE="deployment"
        RESOURCE_NAME="redis"
        ;;
    *)
        echo -e "${RED}Unknown service: $SERVICE${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Viewing logs for: ${GREEN}$SERVICE${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Build kubectl command
CMD="kubectl logs -n nexus $RESOURCE_TYPE/$RESOURCE_NAME --tail=$TAIL"

if [ "$FOLLOW" = "true" ] || [ "$FOLLOW" = "follow" ] || [ "$FOLLOW" = "-f" ]; then
    CMD="$CMD --follow"
fi

# Execute
eval $CMD
