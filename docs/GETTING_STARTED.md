# Getting Started with Nexus

This guide will walk you through setting up and running the complete Nexus development environment.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Project](#running-the-project)
- [Development Workflow](#development-workflow)
- [Troubleshooting](#troubleshooting)
- [Next Steps](#next-steps)

---

## Overview

Nexus is a distributed IDE architecture consisting of:

- **workspace-kernel**: Backend runtime server that manages panel instances, NOG (Nexus Object Graph), and WebSocket connections
- **GraphStudio**: React-based frontend IDE with panel-based interface
- **nexus-protocol**: Core protocol definitions and AST types
- **nexus-reactor**: NXML parser and execution engine

## Prerequisites

Before you begin, ensure you have the following installed:

### Required

- **Node.js** >= 18.0.0 ([Download](https://nodejs.org/))
- **npm** >= 9.0.0 (comes with Node.js)
- **Git** ([Download](https://git-scm.com/))

### Recommended

- **VS Code** or your preferred code editor
- **PostgreSQL** (optional - SQLite is used by default for development)
- **Docker** (optional - for containerized deployment)

### Verify Installation

```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Check npm version
npm --version   # Should be >= 9.0.0

# Check Git
git --version
```

---

## Project Structure

```
nexus-mono/
├── apps/
│   └── GraphStudio/          # Frontend React application
│       ├── src/
│       │   ├── components/   # React components
│       │   ├── context/      # React contexts (StudioContext, NexusContext)
│       │   ├── panels/       # Panel definitions
│       │   ├── marketplace/  # Marketplace client
│       │   └── api/          # API clients
│       ├── public/
│       └── package.json
│
├── packages/
│   ├── nexus-protocol/       # Protocol definitions & AST
│   │   ├── src/
│   │   │   ├── ast/         # AST node types
│   │   │   └── types/       # TypeScript types
│   │   └── package.json
│   │
│   └── nexus-reactor/        # NXML parser & execution engine
│       ├── src/
│       │   ├── parser/      # NXML parser
│       │   ├── executor/    # Tool execution
│       │   └── view/        # React hydrator
│       └── package.json
│
├── runtime/
│   └── workspace-kernel/     # Backend runtime server
│       ├── src/
│       │   ├── server.ts    # Express + WebSocket server
│       │   ├── panels/      # Panel lifecycle management
│       │   ├── state/       # NOG state engine
│       │   ├── marketplace/ # Marketplace API
│       │   └── auth/        # Authentication
│       ├── prisma/
│       │   ├── schema.prisma  # Database schema
│       │   └── seed.ts        # Seed data
│       └── package.json
│
└── docs/                     # Documentation
    ├── GETTING_STARTED.md   # This file
    ├── nexus_spec.md        # Architecture overview
    ├── 01_protocol_spec.md  # Protocol specification
    ├── 01_reactor_spec.md   # Reactor specification
    └── 02_runtime_spec.md   # Runtime specification
```

---

## Installation

### 1. Clone the Repository

```bash
git clone <repository-url> nexus-mono
cd nexus-mono
```

### 2. Install Dependencies

The project uses npm workspaces for monorepo management. Install all dependencies from the root:

```bash
# Install all workspace dependencies
cd nexus-mono

# Install workspace-kernel dependencies
cd runtime/workspace-kernel
npm install

# Install GraphStudio dependencies
cd ../../apps/GraphStudio
npm install

# Install nexus-protocol dependencies
cd ../../packages/nexus-protocol
npm install

# Install nexus-reactor dependencies
cd ../nexus-reactor
npm install
```

### 3. Build Shared Packages

Build the shared packages that other parts of the project depend on:

```bash
# Build nexus-protocol
cd packages/nexus-protocol
npm run build

# Build nexus-reactor
cd ../nexus-reactor
npm run build
```

---

## Configuration

### 1. Database Setup (workspace-kernel)

The workspace-kernel uses Prisma ORM with SQLite by default for development.

```bash
cd runtime/workspace-kernel

# Generate Prisma client
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Seed the database with built-in panels
npm run prisma:seed
```

**Expected output:**
```
✔ Prisma schema loaded
✔ Prisma Client generated
✔ Database migrations applied
✔ Built-in panels seeded successfully
```

### 2. Environment Variables

Create a `.env` file in `runtime/workspace-kernel/`:

```bash
cd runtime/workspace-kernel
cat > .env << EOF
# Database
DATABASE_URL="file:./dev.db"

# Server
PORT=3000
HOST=localhost

# CORS
CORS_ORIGINS="http://localhost:5173,http://localhost:3000"

# JWT Secret (generate a random string)
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# Logging
LOG_LEVEL="info"

# Features
AUTH_ENABLED=true
EOF
```

**Important:** Change `JWT_SECRET` to a secure random string in production!

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Frontend Configuration

Create a `.env` file in `apps/GraphStudio/`:

```bash
cd apps/GraphStudio
cat > .env << EOF
# API endpoints
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000

# Features
VITE_ENABLE_MARKETPLACE=true
VITE_ENABLE_AI=true
EOF
```

---

## Running the Project

You need to run both the backend (workspace-kernel) and frontend (GraphStudio) simultaneously.

### Option 1: Using Separate Terminals (Recommended for Development)

**Terminal 1 - Start workspace-kernel (Backend):**

```bash
cd runtime/workspace-kernel
npm run dev
```

**Expected output:**
```
[INFO] Workspace Kernel starting...
[INFO] Database connected
[INFO] HTTP server listening on http://localhost:3000
[INFO] WebSocket server ready
[INFO] Marketplace routes registered
[INFO] Auth routes registered
```

**Terminal 2 - Start GraphStudio (Frontend):**

```bash
cd apps/GraphStudio
npm run dev
```

**Expected output:**
```
VITE v4.x.x  ready in 500 ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

### Option 2: Using a Process Manager

Create a `dev.sh` script in the root:

```bash
#!/bin/bash
cd runtime/workspace-kernel && npm run dev &
cd apps/GraphStudio && npm run dev &
wait
```

Make it executable and run:

```bash
chmod +x dev.sh
./dev.sh
```

### Access the Application

Once both servers are running:

1. **Open your browser** to: http://localhost:5173
2. **Sign up** for a new account (or use test credentials if seeded)
3. **Explore** the default workspace with Notes and Chat panels

---

## Development Workflow

### Common Development Tasks

#### 1. Adding a New Panel (NXML)

Create an NXML file in the marketplace or use the PublishPanelModal:

```xml
<NexusPanel id="my-panel" title="My Panel">
  <Data>
    <State name="count" type="number" default="0" />
  </Data>

  <Logic>
    <Tool name="increment">
      <Handler>
        $state.count = $state.count + 1;
      </Handler>
    </Tool>
  </Logic>

  <View>
    <Layout strategy="flex" direction="column">
      <Text>Count: {$state.count}</Text>
      <Button trigger="increment">Increment</Button>
    </Layout>
  </View>
</NexusPanel>
```

Publish via the GraphStudio UI:
1. Click the **Upload** icon in the sidebar
2. Fill in metadata (name, description, category)
3. Paste your NXML code
4. Preview and publish

#### 2. Modifying the Backend API

Edit files in `runtime/workspace-kernel/src/`:

```bash
cd runtime/workspace-kernel

# Make your changes to src/...

# Restart the dev server (it auto-restarts on file changes)
# Changes are hot-reloaded
```

#### 3. Modifying the Frontend

Edit files in `apps/GraphStudio/src/`:

```bash
cd apps/GraphStudio

# Make your changes to src/...

# Vite will hot-reload automatically
# No restart needed
```

#### 4. Database Schema Changes

When you modify `prisma/schema.prisma`:

```bash
cd runtime/workspace-kernel

# Create a migration
npm run prisma:migrate

# Regenerate Prisma client
npm run prisma:generate

# Restart workspace-kernel
```

#### 5. Running Tests

```bash
# Test workspace-kernel
cd runtime/workspace-kernel
npm test

# Test with coverage
npm test -- --coverage

# Watch mode
npm run test:watch
```

#### 6. Type Checking

```bash
# Check workspace-kernel types
cd runtime/workspace-kernel
npm run typecheck

# Check GraphStudio types
cd ../../apps/GraphStudio
npm run build  # Vite includes type checking
```

#### 7. Linting

```bash
# Lint workspace-kernel
cd runtime/workspace-kernel
npm run lint

# Fix linting issues
npm run lint -- --fix
```

---

## Troubleshooting

### Common Issues

#### 1. "Port 3000 already in use"

**Solution:**
```bash
# Find and kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
PORT=3001 npm run dev
```

#### 2. "Cannot find module '@nexus/protocol'"

**Solution:**
```bash
# Rebuild shared packages
cd packages/nexus-protocol
npm run build

cd ../nexus-reactor
npm run build
```

#### 3. "Prisma Client not generated"

**Solution:**
```bash
cd runtime/workspace-kernel
npm run prisma:generate
```

#### 4. "WebSocket connection failed"

**Causes:**
- workspace-kernel not running
- CORS misconfiguration
- Wrong WebSocket URL

**Solution:**
```bash
# Check workspace-kernel is running
curl http://localhost:3000/health

# Check CORS_ORIGINS in .env includes http://localhost:5173
# Check VITE_WS_URL in GraphStudio/.env is ws://localhost:3000
```

#### 5. "Database migration failed"

**Solution:**
```bash
cd runtime/workspace-kernel

# Reset the database (CAUTION: destroys all data)
rm -f prisma/dev.db
npm run prisma:migrate
npm run prisma:seed
```

#### 6. "NXML panel not rendering"

**Checklist:**
- Is workspace-kernel running?
- Is the panel installed? (Check "My Panels" in AddPanelModal)
- Does the NXML have syntax errors? (Check browser console)
- Is NexusProvider configured in App.jsx?

**Debug:**
```javascript
// In browser console
console.log(useStudioStore.getState().installedPanels);
console.log(useStudioStore.getState().panels);
```

#### 7. "Authentication not working"

**Solution:**
```bash
# Check JWT_SECRET is set in runtime/workspace-kernel/.env
# Clear localStorage and try signing up again

# In browser console:
localStorage.clear();
location.reload();
```

#### 8. "Cannot connect to marketplace"

**Solution:**
```bash
# Check database is seeded
cd runtime/workspace-kernel
npm run prisma:seed

# Check marketplace routes are registered (should see in workspace-kernel logs)
# Check VITE_ENABLE_MARKETPLACE=true in GraphStudio/.env
```

### Getting Help

If you encounter issues not covered here:

1. **Check the logs**:
   - workspace-kernel logs in terminal
   - Browser DevTools console (F12)
   - Network tab for API errors

2. **Check the documentation**:
   - `docs/nexus_spec.md` - Architecture overview
   - `docs/01_protocol_spec.md` - Protocol details
   - `docs/01_reactor_spec.md` - NXML syntax
   - `docs/02_runtime_spec.md` - Runtime details

3. **Search existing issues** in the repository

4. **Create a new issue** with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Logs and error messages
   - Environment info (Node version, OS, etc.)

---

## Next Steps

Now that you have Nexus running, explore these features:

### 1. Explore the UI

- **Panels**: Try Notes and Chat panels
- **Sidebar**: Add new panels using the "+" button
- **NOG Viewer**: Click the Network icon to view the object graph
- **Settings**: Customize keyboard shortcuts and theme

### 2. Create Your First Panel

- Click the **Upload** icon (Publish Panel)
- Follow the wizard to create an NXML panel
- Publish to your local marketplace
- Add it to your workspace

### 3. Learn NXML Syntax

Read `docs/01_reactor_spec.md` for comprehensive NXML documentation:
- Data modeling with `<State>`
- Business logic with `<Tool>`
- UI components with `<View>`
- Advanced features (MCP, Custom Components)

### 4. Explore the Marketplace

- Browse available panels in AddPanelModal
- Install community panels
- Rate and review panels

### 5. Understand NOG (Nexus Object Graph)

- Open NOG Viewer (Network icon)
- Add panels and see entities created
- Trigger cross-panel sync to see patches
- Review and approve patches

### 6. Integrate AI

- Enable AI observation on panels (Eye icon)
- Use Chat panel to interact with AI
- See AI context in NOG Viewer

### 7. Read the Architecture Docs

- `docs/nexus_spec.md` - High-level architecture
- `docs/01_protocol_spec.md` - Protocol specification
- `docs/02_runtime_spec.md` - Runtime implementation
- `docs/03_state_engine_spec.md` - NOG state engine

---

## Production Deployment

For production deployment, see:
- `docs/DEPLOYMENT.md` (coming soon)
- Use PostgreSQL instead of SQLite
- Set strong JWT_SECRET
- Enable HTTPS/WSS
- Configure proper CORS origins
- Use a reverse proxy (nginx/Caddy)

---

## Contributing

See `CONTRIBUTING.md` for guidelines on:
- Code style
- Commit conventions
- Pull request process
- Testing requirements

---

## License

MIT License - see `LICENSE` file for details

---

**Happy building with Nexus! 🚀**

If you have questions or feedback, please open an issue or discussion on GitHub.
