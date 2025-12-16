#!/bin/bash

# Nexus Development Startup Script
# Runs both workspace-kernel and GraphStudio in parallel

set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║           Starting Nexus Development Mode           ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Function to cleanup background processes on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    kill $(jobs -p) 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

echo -e "${BLUE}[Kernel]${NC} Starting workspace-kernel on port 3000..."
(
    cd runtime/workspace-kernel
    npm run dev 2>&1 | sed "s/^/[Kernel] /"
) &

echo -e "${YELLOW}[NexusOS]${NC} Starting NexusOS mock service on port 4000..."
(
    cd services/nexus-os
    npm run dev 2>&1 | sed "s/^/[NexusOS] /"
) &

echo -e "${GREEN}[Frontend]${NC} Starting GraphStudio on port 5173..."
(
    cd apps/GraphStudio
    npm run dev 2>&1 | sed "s/^/[Frontend] /"
) &

echo ""
echo -e "${GREEN}✨ Development servers starting...${NC}"
echo ""
echo "  Kernel:   http://localhost:3000"
echo "  NexusOS:  http://localhost:4000"
echo "  Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Wait for all background processes
wait
