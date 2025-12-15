# Nexus

> A distributed IDE architecture with dynamic panel-based interface and semantic state management

[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🚀 Quick Start

```bash
# 1. Run the automated setup script
./setup.sh

# 2. Start development servers
./dev.sh

# 3. Open http://localhost:5173
```

**That's it!** See [docs/QUICK_START.md](./docs/QUICK_START.md) for a 5-minute walkthrough.

---

## 📖 Documentation

- **[Getting Started Guide](./docs/GETTING_STARTED.md)** - Complete installation and configuration
- **[Quick Start](./docs/QUICK_START.md)** - Get running in 5 minutes
- **[Architecture Overview](./docs/nexus_spec.md)** - High-level design and concepts
- **[Protocol Specification](./docs/01_protocol_spec.md)** - NXML and protocol details
- **[Reactor Specification](./docs/01_reactor_spec.md)** - NXML parser and execution
- **[Runtime Specification](./docs/02_runtime_spec.md)** - workspace-kernel implementation

---

## 🏗️ Architecture

Nexus is a monorepo consisting of:

### Frontend
- **[GraphStudio](./apps/GraphStudio)** - React-based IDE with panel interface
  - Panel-based workspace
  - Drag & drop support
  - Glass morphism UI
  - 3D animated background

### Backend
- **[workspace-kernel](./runtime/workspace-kernel)** - Express + WebSocket server
  - Panel lifecycle management
  - NOG (Nexus Object Graph) state engine
  - Marketplace API
  - JWT authentication

### Packages
- **[nexus-protocol](./packages/nexus-protocol)** - Protocol definitions and AST types
- **[nexus-reactor](./packages/nexus-reactor)** - NXML parser and execution engine

---

## ✨ Features

### 🎨 Panel System
- **Dynamic Panels**: Create panels with NXML (Nexus Extensible Markup Language)
- **Marketplace**: Browse, install, and publish panels
- **Real-time Sync**: WebSocket-based state synchronization
- **Multiple Modes**: Flexible, fullscreen, minimized, hidden

### 🧠 State Management
- **NOG (Nexus Object Graph)**: Semantic state layer across panels
- **Patch System**: Review and approve cross-panel state changes
- **Conflict Resolution**: Smart conflict detection and resolution

### 🔧 Developer Experience
- **Hot Reload**: Both frontend and backend auto-reload on changes
- **TypeScript**: Full type safety across the stack
- **Prisma ORM**: Type-safe database queries
- **NXML**: Declarative panel definition language

### 🎯 Built-in Panels
- **Notes**: Simple note-taking with filtering
- **Chat**: AI assistant integration
- **Canvas**: Drawing and diagramming (coming soon)
- **Kanban**: Task board (coming soon)
- **Code Editor**: Syntax highlighting (coming soon)

---

## 🛠️ Development

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0

### Setup
```bash
# Option 1: Automated setup (recommended)
./setup.sh

# Option 2: Manual setup
cd runtime/workspace-kernel && npm install
cd ../../apps/GraphStudio && npm install
cd ../../packages/nexus-protocol && npm install && npm run build
cd ../nexus-reactor && npm install && npm run build
cd ../../runtime/workspace-kernel
npm run prisma:generate && npm run prisma:migrate && npm run prisma:seed
```

### Run Development Servers

**Option 1: Single Command**
```bash
./dev.sh
```

**Option 2: Separate Terminals**
```bash
# Terminal 1 - Backend
cd runtime/workspace-kernel
npm run dev

# Terminal 2 - Frontend
cd apps/GraphStudio
npm run dev
```

### Common Tasks

```bash
# Type checking
cd runtime/workspace-kernel && npm run typecheck

# Linting
cd runtime/workspace-kernel && npm run lint

# Testing
cd runtime/workspace-kernel && npm test

# Database migration
cd runtime/workspace-kernel && npm run prisma:migrate

# Build for production
cd apps/GraphStudio && npm run build
cd ../../runtime/workspace-kernel && npm run build
```

---

## 📦 Project Structure

```
nexus-mono/
├── apps/
│   └── GraphStudio/          # Frontend React application
│       ├── src/
│       │   ├── components/   # UI components
│       │   ├── context/      # React contexts
│       │   ├── panels/       # Panel definitions
│       │   └── marketplace/  # Marketplace integration
│       └── package.json
│
├── packages/
│   ├── nexus-protocol/       # Protocol & AST definitions
│   └── nexus-reactor/        # NXML parser & executor
│
├── runtime/
│   └── workspace-kernel/     # Backend server
│       ├── src/
│       │   ├── server.ts     # Express + WebSocket
│       │   ├── panels/       # Panel management
│       │   ├── state/        # NOG state engine
│       │   ├── marketplace/  # Marketplace API
│       │   └── auth/         # Authentication
│       └── prisma/           # Database schema
│
├── docs/                     # Documentation
│   ├── GETTING_STARTED.md
│   ├── QUICK_START.md
│   └── ...
│
├── setup.sh                  # Automated setup script
└── dev.sh                    # Development startup script
```

---

## 🎯 Roadmap

### Phase 1: Core Infrastructure ✅
- [x] NXML parser and reactor
- [x] workspace-kernel runtime
- [x] GraphStudio frontend
- [x] Marketplace system
- [x] NOG state engine

### Phase 2: Enhanced Features 🚧
- [ ] Custom React components in NXML
- [ ] Advanced AI integration
- [ ] MCP (Model Context Protocol) support
- [ ] Real-time collaboration
- [ ] Panel templates library

### Phase 3: Production Ready 📋
- [ ] Comprehensive test coverage
- [ ] Performance optimizations
- [ ] Production deployment guide
- [ ] Security hardening
- [ ] CI/CD pipelines

### Phase 4: Ecosystem 🌟
- [ ] Plugin system
- [ ] VSCode extension
- [ ] CLI tool
- [ ] Public marketplace
- [ ] Community panels

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Areas for Contribution
- 🐛 Bug fixes
- ✨ New features
- 📝 Documentation improvements
- 🎨 UI/UX enhancements
- 🧪 Test coverage
- 🌍 Translations

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with:
- [React](https://react.dev/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Express](https://expressjs.com/) - HTTP server
- [Prisma](https://www.prisma.io/) - Database ORM
- [Vite](https://vitejs.dev/) - Build tool
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Lucide](https://lucide.dev/) - Icons

---

## 📞 Support

- 📖 [Documentation](./docs/)
- 💬 [Discussions](../../discussions)
- 🐛 [Issue Tracker](../../issues)
- 📧 Email: support@nexus.dev (coming soon)

---

<p align="center">
  <strong>Built with ❤️ by the Nexus Team</strong>
</p>

<p align="center">
  <a href="#nexus">⬆ Back to top</a>
</p>
