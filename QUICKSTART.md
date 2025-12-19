# Nexus Python - Quick Start Guide

Get the Nexus Python platform running locally in 5 minutes.

## Prerequisites

- Python 3.11 or higher
- Node.js 18 or higher
- npm or yarn
- Git

## Quick Start

### 1. Clone and Install

```bash
# Already in the nexus-python directory
cd /Users/worlesenric/wkspace/nexus-python

# Install Python dependencies for backends
cd runtime/graphstudio-backend
pip install -r requirements.txt
cd ../..

# Install frontend dependencies
cd apps/GraphStudio
npm install
cd ../..
```

### 2. Start Services

Open 3 terminal windows:

#### Terminal 1: GraphStudio Auth Backend

```bash
cd runtime/graphstudio-backend
uvicorn main:app --host 0.0.0.0 --port 3000 --reload
```

✅ Running on: http://localhost:3000

#### Terminal 2: Python Workspace Kernel (Coming Soon - Phase 2)

```bash
cd runtime/workspace-kernel
# Will be available after Phase 2 implementation
# uvicorn workspace_kernel.main:app --host 0.0.0.0 --port 8000 --reload
```

🚧 Coming in Phase 2 (NXML Parser Implementation)

#### Terminal 3: GraphStudio Frontend

```bash
cd apps/GraphStudio
npm run dev
```

✅ Running on: http://localhost:5173

### 3. Create an Account

1. Open http://localhost:5173 in your browser
2. Click "Sign Up"
3. Enter your details:
   - Email: test@example.com
   - Password: test123
   - Full Name: Test User
4. Click "Create Account"

### 4. Explore GraphStudio

Once logged in, you'll see:
- **Notes Panel**: Take markdown notes
- **AI Assistant**: Chat with AI (requires API key)
- **Add Panel** (+): Add new panels from marketplace

## Current Status

### ✅ Phase 1: Foundation (COMPLETED)

- [x] Directory structure created
- [x] Type definitions (AST, NOG, Messages)
- [x] GraphStudio frontend integrated
- [x] GraphStudio auth backend migrated to runtime/
- [x] NXMLRenderer updated for Python backend

### 🚧 Phase 2: NXML Parser (IN PROGRESS)

Phase 2 will implement:
- Python lexer and parser for NXML
- AST construction and validation
- LRU caching for parsed ASTs
- Integration with workspace-kernel backend

See [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) for details.

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│         GraphStudio Frontend                 │
│         (React + TypeScript)                 │
│         http://localhost:5173                │
└─────────────┬───────────────────────────────┘
              │
              ├─────────────────────────────────┐
              │                                 │
              ▼                                 ▼
┌──────────────────────────┐    ┌──────────────────────────┐
│  GraphStudio Backend     │    │  Workspace Kernel        │
│  (FastAPI - Python)      │    │  (FastAPI - Python)      │
│  Port 3000               │    │  Port 8000               │
│                          │    │                          │
│  - Authentication        │    │  - Panel CRUD            │
│  - User Management       │    │  - NXML Parsing          │
│  - Subscriptions         │    │  - NOG Management        │
│  - JWT Tokens            │    │  - WebSocket Sync        │
└──────────────────────────┘    └──────────────────────────┘
```

## API Endpoints

### GraphStudio Backend (Port 3000)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/signup | Create new user account |
| POST | /auth/token | Login and get JWT token |
| GET | /auth/me | Get current user profile |
| GET | /subscription/ | Get subscription details |
| POST | /subscription/upgrade | Upgrade subscription plan |

### Workspace Kernel (Port 8000) - Coming in Phase 2

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/panels | Create new panel from NXML |
| GET | /api/panels/{id}/ast | Get panel AST (JSON) |
| POST | /api/panels/{id}/execute | Execute panel handler |
| DELETE | /api/panels/{id} | Delete panel |
| WebSocket | /ws/{workspaceId} | Real-time state sync |

## Example: Creating Your First Panel

Once Phase 2 is complete, you'll be able to create NXML panels:

```xml
<NexusPanel id="counter" type="tool" version="1.0">
  <Data>
    <State name="count" type="number" default={0} />
  </Data>

  <Logic>
    <Handler name="increment">
      $state.count += 1;
    </Handler>

    <Handler name="decrement">
      $state.count -= 1;
    </Handler>
  </Logic>

  <View>
    <Layout direction="column" gap="1rem" padding="2rem">
      <Text size="2rem">Count: {$state.count}</Text>
      <Row gap="0.5rem">
        <Button label="+" onClick="increment" />
        <Button label="-" onClick="decrement" />
      </Row>
    </Layout>
  </View>
</NexusPanel>
```

## Environment Configuration

### GraphStudio Backend (.env)

```bash
JWT_SECRET=change-this-in-production
DATABASE_URL=sqlite:///./dev.db
OTEL_ENDPOINT=localhost:4317
```

### Workspace Kernel (.env) - Phase 2

```bash
DATABASE_URL=sqlite:///./dev.db
OTEL_ENDPOINT=localhost:4317
```

## Testing API with curl

### Signup

```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "full_name": "Test User"
  }'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@example.com&password=test123"
```

### Get User Profile

```bash
TOKEN="<your-token-from-login>"

curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## Common Issues

### Port Already in Use

**Error**: `Address already in use`

**Solution**:
```bash
# Find process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use a different port
uvicorn main:app --port 3001
```

### Module Not Found

**Error**: `ModuleNotFoundError: No module named 'fastapi'`

**Solution**:
```bash
pip install -r requirements.txt
```

### CORS Errors in Browser

**Error**: `CORS policy: No 'Access-Control-Allow-Origin' header`

**Solution**: Check that the frontend URL is in the CORS allowed origins in `main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Database Locked

**Error**: `sqlite3.OperationalError: database is locked`

**Solution**:
```bash
# Stop all backend services
# Delete the database
rm runtime/graphstudio-backend/dev.db

# Restart the service (will recreate DB)
```

## Next Steps

1. ✅ Complete Phase 1 (Foundation) - **DONE**
2. 🚧 Implement Phase 2 (NXML Parser)
   - Create lexer (`nexus-core/parser/lexer.py`)
   - Create parser (`nexus-core/parser/parser.py`)
   - Create validator (`nexus-core/parser/validator.py`)
   - Create cache (`nexus-core/parser/cache.py`)
3. 📋 Implement Phase 3 (NOG Implementation)
4. 📋 Implement Phase 4 (Sandbox Executor)
5. 📋 Implement Phase 5 (Workspace Kernel - FastAPI)
6. 📋 Implement Phase 6 (Frontend Bridge)
7. 📋 Implement Phase 7 (AI Integration)
8. 📋 Implement Phase 8 (Deployment)

See [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) for detailed implementation steps.

## Resources

- **Migration Notes**: [MIGRATION_NOTES.md](MIGRATION_NOTES.md)
- **Implementation Guide**: [docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md)
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Backend README**: [runtime/graphstudio-backend/README.md](runtime/graphstudio-backend/README.md)

## Development Workflow

### Code Quality

```bash
# Format Python code
black .

# Lint Python code
ruff check .

# Type check Python code
mypy runtime/
```

### Running Tests

```bash
# Python tests (Phase 2+)
pytest

# Frontend tests
cd apps/GraphStudio
npm test
```

## Contributing

1. Create a branch for your feature
2. Implement changes with tests
3. Run code quality checks
4. Create a pull request

## Support

- **Issues**: Check console logs in browser (Cmd/Ctrl + J) and terminal output
- **Documentation**: See docs/ directory
- **Community**: (Add community links)

---

**Status**: Phase 1 Complete ✅
**Next**: Phase 2 - NXML Parser Implementation
**Updated**: December 19, 2024
