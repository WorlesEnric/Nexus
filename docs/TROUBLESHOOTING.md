# Troubleshooting Guide

This guide covers common issues and their solutions when developing with Nexus.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Runtime Issues](#runtime-issues)
- [Database Issues](#database-issues)
- [Frontend Issues](#frontend-issues)
- [WebSocket Issues](#websocket-issues)
- [NXML Panel Issues](#nxml-panel-issues)
- [Authentication Issues](#authentication-issues)
- [Performance Issues](#performance-issues)
- [Getting More Help](#getting-more-help)

---

## Installation Issues

### "npm install" fails with EACCES error

**Problem:** Permission denied when installing packages

**Solution:**
```bash
# Option 1: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Option 2: Use sudo (not recommended)
sudo npm install --unsafe-perm
```

### "Cannot find module '@nexus/protocol'"

**Problem:** Shared packages not built or linked correctly

**Solution:**
```bash
# Rebuild all shared packages
cd packages/nexus-protocol
npm run build

cd ../nexus-reactor
npm run build

# Reinstall dependencies in dependent projects
cd ../../runtime/workspace-kernel
rm -rf node_modules package-lock.json
npm install

cd ../../apps/GraphStudio
rm -rf node_modules package-lock.json
npm install
```

### TypeScript compilation errors during build

**Problem:** Version mismatches or corrupted node_modules

**Solution:**
```bash
# Clean everything and reinstall
find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null
find . -name "package-lock.json" -delete
find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null

# Reinstall from scratch
./setup.sh
```

---

## Runtime Issues

### "Port 3000 already in use"

**Problem:** Another process is using port 3000

**Solutions:**
```bash
# Option 1: Kill the process using port 3000
lsof -ti:3000 | xargs kill -9

# Option 2: Use a different port
PORT=3001 npm run dev

# Option 3: Find what's using the port
lsof -i :3000
```

### "Port 5173 already in use" (Vite)

**Problem:** Another Vite instance is running

**Solution:**
```bash
# Kill Vite process
pkill -f vite

# Or manually find and kill
lsof -ti:5173 | xargs kill -9
```

### Backend crashes immediately after starting

**Check these:**
1. Database file exists: `runtime/workspace-kernel/prisma/dev.db`
2. Prisma client is generated: `runtime/workspace-kernel/node_modules/.prisma`
3. .env file exists with correct configuration
4. No syntax errors in TypeScript files

**Debug:**
```bash
cd runtime/workspace-kernel

# Check for TypeScript errors
npm run typecheck

# Run with verbose logging
LOG_LEVEL=debug npm run dev

# Check if Prisma is configured
npm run prisma:generate
```

### Frontend shows blank page

**Check these:**
1. Backend is running on port 3000
2. Browser console for errors (F12)
3. Network tab shows successful API calls
4. NexusProvider is configured in App.jsx

**Debug in browser console:**
```javascript
// Check if auth is working
localStorage.getItem('token')

// Check Zustand state
useStudioStore.getState()

// Check for React errors
window.__REACT_DEVTOOLS_GLOBAL_HOOK__
```

---

## Database Issues

### "Prisma Client not generated"

**Problem:** Prisma client needs to be regenerated

**Solution:**
```bash
cd runtime/workspace-kernel
npm run prisma:generate
```

### "Database migration failed"

**Problem:** Migration conflicts or corrupted database

**Solution (CAUTION: Destroys all data):**
```bash
cd runtime/workspace-kernel

# Backup current database
cp prisma/dev.db prisma/dev.db.backup

# Reset database
rm prisma/dev.db
npm run prisma:migrate
npm run prisma:seed
```

### "Table does not exist" errors

**Problem:** Migrations not applied

**Solution:**
```bash
cd runtime/workspace-kernel
npm run prisma:migrate
```

### Database is empty after migration

**Problem:** Seed script not run

**Solution:**
```bash
cd runtime/workspace-kernel
npm run prisma:seed
```

### Cannot connect to PostgreSQL (if using)

**Check these:**
1. PostgreSQL server is running
2. DATABASE_URL in .env is correct
3. Database exists: `psql -h localhost -U postgres -c "CREATE DATABASE nexus;"`
4. User has permissions

---

## Frontend Issues

### "Cannot read property of undefined" in React

**Common causes:**
1. Missing null checks in JSX
2. Async data not loaded yet
3. Prop types mismatch

**Solution:**
```javascript
// Add null checks
{panel?.title}

// Use optional chaining
panel?.state?.notes?.map(...)

// Show loading state
if (!data) return <LoadingSpinner />;
```

### Zustand state not updating

**Problem:** Not using the store correctly

**Solution:**
```javascript
// ❌ Wrong - accessing state directly
const panels = useStudioStore.panels;

// ✅ Correct - using selector
const panels = useStudioStore(state => state.panels);

// ✅ Also correct - accessing via getState()
const panels = useStudioStore.getState().panels;
```

### Styles not applying

**Check these:**
1. Tailwind classes are correct
2. CSS is imported in main file
3. Purge configuration doesn't remove classes
4. Browser cache cleared (Cmd+Shift+R)

**Debug:**
```bash
# Check Tailwind is processing
cd apps/GraphStudio
npm run dev -- --debug

# Check build output
npm run build
```

### Components not re-rendering

**Problem:** React not detecting state changes

**Solutions:**
```javascript
// ❌ Wrong - mutating state directly
state.panels.push(newPanel);

// ✅ Correct - creating new array
set({ panels: [...state.panels, newPanel] });

// ❌ Wrong - mutating object
panel.state.count++;

// ✅ Correct - creating new object
set({
  panels: panels.map(p =>
    p.id === id
      ? { ...p, state: { ...p.state, count: p.state.count + 1 }}
      : p
  )
});
```

---

## WebSocket Issues

### "WebSocket connection failed"

**Check these:**
1. workspace-kernel is running
2. Correct WebSocket URL in .env: `ws://localhost:3000`
3. CORS is configured correctly
4. No firewall blocking WebSocket

**Debug:**
```javascript
// In browser console
new WebSocket('ws://localhost:3000/panels/test/ws')
  .addEventListener('open', () => console.log('Connected'))
  .addEventListener('error', (e) => console.error('Error:', e))
```

### WebSocket connects but no messages

**Check these:**
1. Panel ID is correct
2. Panel exists in workspace-kernel
3. State updates are being triggered
4. Check workspace-kernel logs

**Debug in workspace-kernel:**
```typescript
// Add logging in panel WebSocket handler
ws.on('message', (data) => {
  console.log('Received:', data);
});

ws.send(JSON.stringify({ type: 'test' }));
```

### WebSocket disconnects frequently

**Causes:**
1. Network instability
2. Browser throttling inactive tabs
3. Server restart
4. Timeout issues

**Solution:**
```javascript
// Implement reconnection logic
const connectWithRetry = (url, maxRetries = 5) => {
  let retries = 0;

  const connect = () => {
    const ws = new WebSocket(url);

    ws.addEventListener('close', () => {
      if (retries < maxRetries) {
        retries++;
        setTimeout(connect, 1000 * retries);
      }
    });

    return ws;
  };

  return connect();
};
```

---

## NXML Panel Issues

### NXML panel not rendering

**Check these:**
1. workspace-kernel is running
2. Panel is installed in marketplace
3. Panel is added to workspace
4. NXML syntax is valid
5. Browser console for errors

**Debug:**
```javascript
// In browser console
const panels = useStudioStore.getState().panels;
console.log('Active panels:', panels);

const installed = useStudioStore.getState().installedPanels;
console.log('Installed panels:', installed);
```

### "Invalid NXML syntax" error

**Common issues:**
1. Unclosed tags: `<Button>Click` (missing `</Button>`)
2. Invalid XML characters: `&` instead of `&amp;`
3. Missing required attributes
4. Incorrect nesting

**Solution:**
```xml
<!-- ❌ Wrong -->
<Button>Click me & win</Button>

<!-- ✅ Correct -->
<Button>Click me &amp; win</Button>

<!-- ❌ Wrong -->
<State name="count" />
<Tool name="increment">

<!-- ✅ Correct -->
<Data>
  <State name="count" type="number" default="0" />
</Data>
<Logic>
  <Tool name="increment">
    <Handler>...</Handler>
  </Tool>
</Logic>
```

### Tool execution fails

**Check these:**
1. Handler code is valid JavaScript
2. Required arguments are provided
3. State references are correct: `$state.count`
4. No syntax errors in handler

**Debug:**
```xml
<Tool name="debug">
  <Handler>
    console.log('State:', $state);
    console.log('Args:', $args);
    return { success: true };
  </Handler>
</Tool>
```

### State not persisting

**Problem:** State updates not propagating to workspace-kernel

**Check:**
1. WebSocket connection is active
2. `onStateChange` callback is wired correctly
3. State updates are serializable (no functions, circular refs)

---

## Authentication Issues

### Cannot login with correct credentials

**Check these:**
1. User exists in database: `sqlite3 dev.db "SELECT * FROM users;"`
2. Password is hashed correctly
3. JWT_SECRET is set in .env
4. Token is being stored in localStorage

**Debug:**
```bash
# Check users in database
cd runtime/workspace-kernel
npx prisma studio  # Opens GUI to view database

# Or use SQLite CLI
sqlite3 prisma/dev.db "SELECT email, full_name FROM users;"
```

### Token expires immediately

**Problem:** JWT_SECRET mismatch or wrong expiry

**Check .env:**
```env
JWT_SECRET="your-secret-here"  # Must be same across restarts
```

### "Invalid token" error

**Solutions:**
```javascript
// Clear token and re-login
localStorage.removeItem('token');
localStorage.removeItem('user');
location.reload();
```

### Infinite redirect loop

**Problem:** ProtectedRoute logic issue

**Check:**
1. AuthContext is providing user correctly
2. Loading state is handled
3. Token is valid

**Debug in AuthContext:**
```javascript
useEffect(() => {
  console.log('Auth state:', { user, loading, token: localStorage.getItem('token') });
}, [user, loading]);
```

---

## Performance Issues

### Frontend slow to load

**Causes:**
1. Too many panels active
2. Large state objects
3. Unnecessary re-renders
4. Unoptimized images

**Solutions:**
```javascript
// Use React.memo for expensive components
export default React.memo(ExpensiveComponent);

// Use useMemo for expensive calculations
const filtered = useMemo(() => {
  return items.filter(i => i.matches(query));
}, [items, query]);

// Lazy load panels
const PanelComponent = React.lazy(() => import('./Panel'));
```

### Backend slow to respond

**Check:**
1. Database queries are optimized
2. No N+1 query problems
3. Proper indexes on frequently queried columns
4. Connection pooling configured

**Debug:**
```typescript
// Add timing logs
const start = Date.now();
const result = await prisma.panel.findMany();
console.log(`Query took ${Date.now() - start}ms`);
```

### High memory usage

**Causes:**
1. Memory leaks in event listeners
2. Large objects in state
3. Circular references
4. Unclosed WebSocket connections

**Solutions:**
```javascript
// Clean up event listeners
useEffect(() => {
  const handler = () => { ... };
  window.addEventListener('event', handler);

  return () => window.removeEventListener('event', handler);
}, []);

// Close WebSocket on unmount
useEffect(() => {
  const ws = new WebSocket(url);

  return () => ws.close();
}, []);
```

---

## Getting More Help

### Gathering Information

When reporting an issue, include:

1. **Environment:**
   ```bash
   node --version
   npm --version
   uname -a  # or system info
   ```

2. **Error messages:**
   - Full console output
   - Browser console errors
   - workspace-kernel logs

3. **Steps to reproduce:**
   - Exact commands run
   - Expected vs actual behavior

4. **Relevant code:**
   - NXML if applicable
   - Configuration files
   - Recent changes

### Checking Logs

**workspace-kernel logs:**
```bash
cd runtime/workspace-kernel
LOG_LEVEL=debug npm run dev > logs.txt 2>&1
```

**Browser console:**
1. Open DevTools (F12)
2. Console tab
3. Check for red errors
4. Network tab for failed requests

**Database inspection:**
```bash
cd runtime/workspace-kernel
npx prisma studio  # Opens web GUI

# Or CLI
sqlite3 prisma/dev.db
.tables  # List tables
.schema users  # Show schema
SELECT * FROM users LIMIT 5;  # Query data
```

### Additional Resources

- **Documentation:** `docs/` directory
- **Specifications:**
  - `docs/nexus_spec.md`
  - `docs/01_protocol_spec.md`
  - `docs/01_reactor_spec.md`
  - `docs/02_runtime_spec.md`
- **Examples:** `apps/GraphStudio/src/panels/nxml/`

### Community Support

- **GitHub Issues:** Report bugs and request features
- **Discussions:** Ask questions and share ideas
- **Discord:** Real-time community chat (coming soon)

---

## Common Error Messages

### "ECONNREFUSED"
- **Meaning:** Cannot connect to server
- **Fix:** Ensure workspace-kernel is running on correct port

### "403 Forbidden"
- **Meaning:** Authentication failed
- **Fix:** Check token, re-login if needed

### "404 Not Found"
- **Meaning:** API endpoint doesn't exist
- **Fix:** Check API URL, verify backend routes

### "500 Internal Server Error"
- **Meaning:** Backend error
- **Fix:** Check workspace-kernel logs for details

### "Cannot read property 'X' of undefined"
- **Meaning:** Accessing property on undefined/null
- **Fix:** Add null checks, ensure data is loaded

### "Maximum update depth exceeded"
- **Meaning:** Infinite render loop
- **Fix:** Check useEffect dependencies, avoid state updates in render

---

**Still stuck?** Open an issue on GitHub with full details!
