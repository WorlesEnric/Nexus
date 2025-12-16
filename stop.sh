#!/bin/bash

# Nexus Stop Script
# Kills processes running on Nexus ports (3000, 4000, 5173, 8000)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║             Stopping Nexus Services                  ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

kill_port() {
    local port=$1
    local name=$2
    
    # Find PID using lsof
    local pid=$(lsof -ti:$port)
    
    if [ -n "$pid" ]; then
        echo -e "${YELLOW}Stopping $name on port $port (PID: $pid)...${NC}"
        kill -9 $pid
        echo -e "${GREEN}✔ Stopped $name${NC}"
    else
        echo -e "${BLUE}ℹ No service running on port $port ($name)${NC}"
    fi
}

# Kill services by port (matches dev.sh services)
kill_port 3000 "Workspace Kernel"
kill_port 4000 "NexusOS"
kill_port 5173 "Frontend"
kill_port 8000 "Auth Backend"

echo ""
echo -e "${GREEN}✨ All Nexus services stopped.${NC}"
echo ""
