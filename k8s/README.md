# Nexus Python - Kubernetes Deployment

Complete Kubernetes deployment for Nexus Python platform.

## Prerequisites

- Kubernetes cluster (local: Docker Desktop, Minikube, or Kind)
- kubectl command-line tool
- Docker

## Quick Start

### 1. Build Images

```bash
./k8s/scripts/build-images.sh
```

This will build the following images:
- `nexus/workspace-kernel:latest`
- `nexus/graphstudio-backend:latest`
- `nexus/graphstudio-frontend:latest`

### 2. Deploy to Kubernetes

```bash
./k8s/scripts/deploy.sh
```

Deploys:
- PostgreSQL (database)
- Redis (cache)
- Workspace Kernel (main backend API)
- GraphStudio Backend (authentication & subscriptions)
- GraphStudio Frontend (React UI)

### 3. Check Status

```bash
./k8s/scripts/status.sh
```

### 4. View Logs

```bash
# View workspace-kernel logs
./k8s/scripts/logs.sh workspace-kernel

# Follow logs in real-time
./k8s/scripts/logs.sh workspace-kernel true

# View more lines
./k8s/scripts/logs.sh workspace-kernel false 500
```

### 5. Access the Application

```bash
# Port forward to local machine
kubectl port-forward -n nexus-python svc/graphstudio-frontend 8080:80

# Then open in browser
# http://localhost:8080
```

Or via NodePort (if available):
```
http://localhost:30080
```

## Service Architecture

```
┌─────────────────────────────────┐
│ graphstudio-frontend (80)       │  ← Frontend (React + Nginx)
└─────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────┐
│ graphstudio-backend (3000)      │  ← Auth & Subscriptions API
└─────────────────────────────────┘
              │
┌─────────────────────────────────┐
│ workspace-kernel (8000)         │  ← Main Backend API + WebSocket
│ - Multi-tenant (50 ws/pod)      │
│ - Auto-scaling (1-10 pods)      │
└─────────────────────────────────┘
         │            │
         ↓            ↓
┌──────────────┐  ┌──────────────┐
│ postgres     │  │ redis        │  ← Database & Cache
│ (5432)       │  │ (6379)       │
└──────────────┘  └──────────────┘
```

## Common Commands

### View All Pods

```bash
kubectl get pods -n nexus-python
```

### View Pod Details

```bash
kubectl describe pod -n nexus-python <pod-name>
```

### Enter a Pod

```bash
kubectl exec -it -n nexus-python <pod-name> -- /bin/sh
```

### View Events

```bash
kubectl get events -n nexus-python --sort-by='.lastTimestamp'
```

### Restart a Service

```bash
kubectl rollout restart deployment/workspace-kernel -n nexus-python
```

### Scale Services

```bash
kubectl scale deployment/workspace-kernel -n nexus-python --replicas=3
```

## Troubleshooting

### Pod Won't Start

1. Check pod status:
```bash
kubectl describe pod -n nexus-python <pod-name>
```

2. Check logs:
```bash
kubectl logs -n nexus-python <pod-name>
```

3. Check events:
```bash
kubectl get events -n nexus-python
```

### Database Connection Failure

1. Check if PostgreSQL is running:
```bash
kubectl get pods -n nexus-python -l app=postgres
```

2. Test database connection:
```bash
kubectl exec -it -n nexus-python postgres-0 -- psql -U nexus -c "SELECT 1"
```

3. Check database logs:
```bash
./k8s/scripts/logs.sh postgres
```

### Image Pull Issues

For kind clusters, make sure images are loaded:
```bash
kind load docker-image nexus/workspace-kernel:latest --name <cluster-name>
kind load docker-image nexus/graphstudio-backend:latest --name <cluster-name>
kind load docker-image nexus/graphstudio-frontend:latest --name <cluster-name>
```

## Cleanup

Delete all resources:
```bash
./k8s/scripts/cleanup.sh
```

## Configuration

### Environment Variables

Edit `k8s/base/configmap.yaml`:
- `MAX_WORKSPACES_PER_POD`: Maximum workspaces per pod (default: 50)
- `IDLE_WORKSPACE_TIMEOUT_MS`: Idle workspace timeout (default: 30 minutes)
- `LOG_LEVEL`: Logging level (debug/info/warn/error)

### Resource Limits

Edit resource requests/limits in each service's `deployment.yaml`:
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "2000m"
```

### Auto-scaling

Edit `k8s/services/workspace-kernel/hpa.yaml`:
```yaml
minReplicas: 1
maxReplicas: 10
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

## Security

### Production Recommendations

1. **Change Default Passwords**
   Edit `k8s/base/secrets.yaml`:
   ```yaml
   JWT_SECRET_KEY: "<your-secure-secret>"
   DATABASE_PASSWORD: "<your-secure-password>"
   ```

2. **Use TLS**
   Configure Ingress with cert-manager

3. **Network Policies**
   Add NetworkPolicy to restrict pod-to-pod communication

4. **Image Scanning**
   Use Trivy or Clair to scan images for vulnerabilities

## Monitoring (Optional)

### Install Prometheus + Grafana

```bash
# Using Helm
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

### Access Grafana

```bash
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
# Default username: admin
# Password: prom-operator
```

## Architecture Notes

### Differences from Original Nexus

- **AI Service Integration**: nexus-ai is a library integrated into workspace-kernel, not a separate service
- **Python Stack**: Uses FastAPI instead of Node.js/TypeScript for backend services
- **Simplified Architecture**: Combines some services for easier deployment

### Multi-Tenant Configuration

- Each workspace-kernel pod supports up to 50 concurrent workspaces
- HPA scales from 1-10 pods based on CPU (70%) and memory (80%) usage
- Maximum capacity: 500 concurrent workspaces

## More Information

- [Deployment Summary](./DEPLOYMENT_SUMMARY.md) - Detailed deployment architecture
- [Quick Start Guide](./QUICKSTART.md) - Step-by-step deployment guide
- [Architecture Documentation](../docs/ARCHITECTURE.md) - System architecture overview
