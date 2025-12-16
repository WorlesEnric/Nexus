#!/bin/bash

# Nexus Setup Script
# This script automates the installation and configuration of Nexus

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✔${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✖${NC} $1"
}

# Header
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║              Nexus Setup Script v1.0                 ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js >= 18.0.0"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    log_error "Node.js version $NODE_VERSION is too old. Please install >= 18.0.0"
    exit 1
fi
log_success "Node.js $(node --version) found"

# Check npm
if ! command -v npm &> /dev/null; then
    log_error "npm is not installed"
    exit 1
fi
log_success "npm $(npm --version) found"

echo ""
log_info "Starting Nexus setup..."
echo ""

# Step 1: Install dependencies
log_info "[1/6] Installing workspace-kernel dependencies..."
cd runtime/workspace-kernel
npm install --silent
log_success "workspace-kernel dependencies installed"
echo ""

log_info "[2/6] Installing GraphStudio dependencies..."
cd ../../apps/GraphStudio
npm install --silent
# Install Python dependencies for backend
if [ -f "backend/requirements.txt" ]; then
    log_info "Installing GraphStudio backend dependencies..."
    pip install -r backend/requirements.txt --quiet
fi
log_success "GraphStudio dependencies installed"
echo ""

log_info "[3/6] Installing shared packages..."
cd ../../packages/nexus-protocol
npm install --silent
cd ../nexus-reactor
npm install --silent
log_success "Shared packages installed"
echo ""

# Step 2: Build shared packages
log_info "[4/6] Building nexus-protocol..."
cd ../../packages/nexus-protocol
npm run build > /dev/null 2>&1
log_success "nexus-protocol built"

log_info "Building nexus-reactor..."
cd ../nexus-reactor
npm run build > /dev/null 2>&1
log_success "nexus-reactor built"
echo ""

# Step 3: Setup database
log_info "[5/6] Setting up database..."
cd ../../runtime/workspace-kernel

log_info "Generating Prisma client..."
npm run prisma:generate > /dev/null 2>&1
log_success "Prisma client generated"

log_info "Running database migrations..."
npm run prisma:migrate > /dev/null 2>&1
log_success "Database migrations applied"

log_info "Seeding database with built-in panels..."
npm run prisma:seed > /dev/null 2>&1
log_success "Database seeded"
echo ""

# Step 4: Create environment files
log_info "[6/6] Creating environment files..."

# Generate a secure JWT secret
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Create workspace-kernel .env
cat > .env << EOF
# Database
DATABASE_URL="file:./dev.db"

# Server
PORT=3000
HOST=localhost

# CORS
CORS_ORIGINS="http://localhost:5173,http://localhost:3000"

# JWT Secret (auto-generated)
JWT_SECRET="$JWT_SECRET"

# Logging
LOG_LEVEL="info"

# Features
AUTH_ENABLED=true
EOF
log_success "Created runtime/workspace-kernel/.env"

# Create GraphStudio .env
cd ../../apps/GraphStudio
cat > .env << EOF
# API endpoints
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000

# Features
VITE_ENABLE_MARKETPLACE=true
VITE_ENABLE_AI=true

# Security (Shared with Kernel)
JWT_SECRET="$JWT_SECRET"
EOF
log_success "Created apps/GraphStudio/.env"

cd ../..

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                                                      ║"
echo "║            ✨  Setup Complete! ✨                    ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
log_success "Nexus is ready to run!"
echo ""
echo "Next steps:"
echo ""
echo "  ${BLUE}1.${NC} Start the backend:"
echo "     ${YELLOW}cd runtime/workspace-kernel && npm run dev${NC}"
echo ""
echo "  ${BLUE}2.${NC} In a new terminal, start the frontend:"
echo "     ${YELLOW}cd apps/GraphStudio && npm run dev${NC}"
echo ""
echo "  ${BLUE}3.${NC} Open your browser:"
echo "     ${YELLOW}http://localhost:5173${NC}"
echo ""
echo "📖 For more information, see ${BLUE}docs/GETTING_STARTED.md${NC}"
echo ""
