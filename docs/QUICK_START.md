# Nexus Quick Start (5 Minutes)

Get Nexus running in under 5 minutes with this streamlined guide.

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

Check versions:
```bash
node --version && npm --version
```

---

## Installation & Setup

```bash
# 1. Clone and navigate
git clone <repository-url> nexus-mono
cd nexus-mono

# 2. Install all dependencies
cd runtime/workspace-kernel && npm install
cd ../../apps/GraphStudio && npm install
cd ../../packages/nexus-protocol && npm install
cd ../nexus-reactor && npm install

# 3. Build shared packages
cd ../../packages/nexus-protocol && npm run build
cd ../nexus-reactor && npm run build

# 4. Setup database
cd ../../runtime/workspace-kernel
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# 5. Create environment files
cat > .env << 'EOF'
DATABASE_URL="file:./dev.db"
PORT=3000
HOST=localhost
CORS_ORIGINS="http://localhost:5173"
JWT_SECRET="dev-secret-change-in-production"
LOG_LEVEL="info"
AUTH_ENABLED=true
EOF

cd ../../apps/GraphStudio
cat > .env << 'EOF'
VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_ENABLE_MARKETPLACE=true
VITE_ENABLE_AI=true
EOF
```

---

## Run the Application

**Terminal 1 - Backend:**
```bash
cd runtime/workspace-kernel
npm run dev
```

Wait for: `✔ HTTP server listening on http://localhost:3000`

**Terminal 2 - Frontend:**
```bash
cd apps/GraphStudio
npm run dev
```

Wait for: `➜  Local:   http://localhost:5173/`

---

## Access & Test

1. Open http://localhost:5173
2. Click "Sign Up" and create an account
3. You'll see Notes and Chat panels automatically loaded
4. Try:
   - ✏️ Creating a note
   - 💬 Chatting with AI
   - ➕ Adding more panels (click "+" in sidebar)
   - 🔗 NOG Viewer (Network icon in sidebar)
   - 📤 Publish Panel (Upload icon in sidebar)

---

## One-Liner Dev Setup

For macOS/Linux, copy this entire block:

```bash
cd nexus-mono && \
  (cd runtime/workspace-kernel && npm install && npm run prisma:generate && npm run prisma:migrate && npm run prisma:seed && \
   echo 'DATABASE_URL="file:./dev.db"
PORT=3000
CORS_ORIGINS="http://localhost:5173"
JWT_SECRET="dev-secret-change-in-production"
LOG_LEVEL="info"
AUTH_ENABLED=true' > .env) && \
  (cd apps/GraphStudio && npm install && \
   echo 'VITE_API_BASE_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3000
VITE_ENABLE_MARKETPLACE=true' > .env) && \
  (cd packages/nexus-protocol && npm install && npm run build) && \
  (cd packages/nexus-reactor && npm install && npm run build) && \
  echo "✅ Setup complete! Run 'npm run dev' in runtime/workspace-kernel and apps/GraphStudio"
```

---

## Common Issues

| Problem | Solution |
|---------|----------|
| Port 3000 in use | `lsof -ti:3000 \| xargs kill -9` |
| Module not found | `cd packages/nexus-{protocol,reactor} && npm run build` |
| Prisma error | `cd runtime/workspace-kernel && npm run prisma:generate` |
| WebSocket fails | Check workspace-kernel is running on port 3000 |

---

## What's Next?

- 📖 Read [GETTING_STARTED.md](./GETTING_STARTED.md) for detailed documentation
- 🔧 Learn NXML syntax in `docs/01_reactor_spec.md`
- 🏗️ Understand architecture in `docs/nexus_spec.md`
- 🎨 Create your first panel using the Publish Panel modal
- 🔍 Explore the NOG Viewer to see the object graph

**Need help?** Check `docs/GETTING_STARTED.md` troubleshooting section.

---

**That's it! You're running Nexus! 🎉**
