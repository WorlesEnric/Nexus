# GraphStudio Backend

Authentication and subscription management service for GraphStudio.

## Overview

This service provides:
- User authentication (signup, login, JWT tokens)
- Subscription management (plans, upgrades)
- User profile management

**Originally located**: `apps/GraphStudio/backend/`
**Migrated**: December 19, 2024
**Port**: 3000

## Architecture

This is a FastAPI application that handles:
1. User authentication with JWT tokens
2. Subscription tier management (free, pro, enterprise)
3. OpenTelemetry/TriLog integration for observability

**Related Services**:
- **workspace-kernel** (Port 8000): Panel operations, NXML parsing, WebSocket state sync
- **nexus-ai** (Future): AI-assisted editing
- **nexus-core** (Future): Core parsing and NOG services

## API Endpoints

### Authentication

#### POST /auth/signup
Create a new user account.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "secure-password",
  "full_name": "John Doe"
}
```

**Response**:
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "created_at": "2024-12-19T12:00:00",
  "subscription": {
    "id": 1,
    "plan_name": "free",
    "is_active": true,
    "start_date": "2024-12-19T12:00:00",
    "end_date": null
  }
}
```

#### POST /auth/token
Login with email and password.

**Request (Form Data)**:
```
username=user@example.com
password=secure-password
```

**Response**:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

#### GET /auth/me
Get current authenticated user profile.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "id": 1,
  "email": "user@example.com",
  "full_name": "John Doe",
  "is_active": true,
  "created_at": "2024-12-19T12:00:00"
}
```

### Subscriptions

#### GET /subscription/
Get current user's subscription details.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response**:
```json
{
  "id": 1,
  "user_id": 1,
  "plan_name": "free",
  "is_active": true,
  "start_date": "2024-12-19T12:00:00",
  "end_date": null
}
```

#### POST /subscription/upgrade
Upgrade to a higher subscription plan.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Request**:
```json
{
  "plan": "pro"
}
```

**Response**:
```json
{
  "message": "Subscription upgraded successfully",
  "subscription": {
    "id": 1,
    "plan_name": "pro",
    "is_active": true,
    "start_date": "2024-12-19T12:00:00",
    "end_date": "2025-12-19T12:00:00"
  }
}
```

**Available Plans**:
- `free`: Default plan for new users
- `pro`: Professional features
- `enterprise`: Enterprise features

## Running the Service

### Prerequisites

- Python 3.11+
- pip

### Installation

```bash
cd runtime/graphstudio-backend
pip install -r requirements.txt
```

### Configuration

Create a `.env` file:

```bash
# JWT Secret for token signing
JWT_SECRET=your-secret-key-here-change-in-production

# Database URL (SQLite for development)
DATABASE_URL=sqlite:///./dev.db

# OpenTelemetry endpoint for TriLog
OTEL_ENDPOINT=localhost:4317
```

### Development

```bash
uvicorn main:app --host 0.0.0.0 --port 3000 --reload
```

Service runs on: http://localhost:3000

### Production

```bash
uvicorn main:app --host 0.0.0.0 --port 3000 --workers 4
```

## Database

### Models

**User**:
- `id`: Integer primary key
- `email`: Unique email address
- `hashed_password`: Bcrypt hashed password
- `full_name`: User's full name
- `is_active`: Account status
- `created_at`: Account creation timestamp

**Subscription**:
- `id`: Integer primary key
- `user_id`: Foreign key to User
- `plan_name`: Plan tier (free, pro, enterprise)
- `is_active`: Subscription status
- `start_date`: Subscription start
- `end_date`: Subscription end (null for active)

### Migrations

The database is automatically created on first run using SQLAlchemy's `create_all()`.

**Database file**: `./dev.db` (SQLite)

To reset the database:
```bash
rm dev.db
# Restart the service to recreate
```

## Observability

### TriLog Integration

The service integrates with TriLog for observability:

**Tracked Events**:
- User signup
- Login attempts (success/failure)
- Subscription changes
- API errors

**Configuration**:
Set `OTEL_ENDPOINT` environment variable to your OpenTelemetry Collector endpoint.

**Kubernetes Detection**:
The service automatically detects Kubernetes environment and adjusts endpoint configuration.

### Logging

Logs are output to stdout in JSON format:

```json
{
  "timestamp": "2024-12-19T12:00:00",
  "level": "INFO",
  "message": "User logged in",
  "user_id": 1,
  "email": "user@example.com"
}
```

## Security

### Authentication

- Passwords hashed with bcrypt (12 rounds)
- JWT tokens with HS256 algorithm
- Token expiration: 24 hours (configurable)

### CORS

Configured to allow:
- `http://localhost:5173` (Vite dev server)
- `http://127.0.0.1:5173`

Update `main.py` to add additional origins for production.

### Database

- SQLite for development
- PostgreSQL recommended for production
- Connection string via `DATABASE_URL` environment variable

## Testing

### Manual Testing with curl

**Signup**:
```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "full_name": "Test User"
  }'
```

**Login**:
```bash
curl -X POST http://localhost:3000/auth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@example.com&password=test123"
```

**Get User**:
```bash
TOKEN="<your-token-here>"
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

## Integration with Frontend

The GraphStudio frontend (`apps/GraphStudio`) connects to this service via `src/api/client.js`:

```javascript
const client = axios.create({
    baseURL: 'http://localhost:3000',
});

client.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
```

**Token Storage**: JWT token stored in browser localStorage as `'token'`

## Deployment

### Docker

Create `Dockerfile`:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
```

Build and run:
```bash
docker build -t graphstudio-backend .
docker run -p 3000:3000 -e JWT_SECRET=secret graphstudio-backend
```

### Kubernetes

See `k8s/services/graphstudio-backend/` for manifests (future).

## Future Improvements

1. **Email Verification**: Add email confirmation on signup
2. **Password Reset**: Implement forgot password flow
3. **Refresh Tokens**: Add refresh token rotation
4. **Rate Limiting**: Add rate limiting per user/IP
5. **PostgreSQL Migration**: Move from SQLite to PostgreSQL
6. **Tests**: Add unit and integration tests
7. **Merge with workspace-kernel**: Consolidate into single backend service

## Related Documentation

- [MIGRATION_NOTES.md](../../MIGRATION_NOTES.md) - Migration from apps/GraphStudio/backend
- [ARCHITECTURE.md](../../docs/ARCHITECTURE.md) - Overall system architecture
- [IMPLEMENTATION_GUIDE.md](../../docs/IMPLEMENTATION_GUIDE.md) - Implementation phases

## Support

**Logs**: Check uvicorn console output
**Database**: Located at `./dev.db` (SQLite)
**Port conflicts**: If port 3000 is in use, change `--port` flag

---

**Status**: ✅ Active
**Maintainer**: Nexus Platform Team
