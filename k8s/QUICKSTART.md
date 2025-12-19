# Nexus Python - Kubernetes Quick Start

## One-Click Deployment

### Prerequisites

- Docker installed and running
- kubectl installed
- Kind cluster created (if using kind)

### Complete Deployment Flow

```bash
# 1. Navigate to project root
cd /path/to/nexus-python

# 2. Build all Docker images (5-10 minutes)
./k8s/scripts/build-images.sh

# 3. Deploy to Kubernetes (2-3 minutes)
./k8s/scripts/deploy.sh
```

That's it! 🎉

### deploy.sh Script Features

The updated `deploy.sh` script automatically:

1. ✅ **Detects Kind Cluster**: Automatically recognizes if you're using kind
2. ✅ **Checks Images**: Verifies all required Docker images are built
3. ✅ **Loads Images**: If using kind, automatically loads images into cluster
4. ✅ **Deploys Services**: Deploys all services in correct order:
   - Namespace, ConfigMaps & Secrets
   - PostgreSQL & Redis (waits for ready)
   - Workspace Kernel (waits for ready)
   - GraphStudio Backend (waits for ready)
   - GraphStudio Frontend (waits for ready)
5. ✅ **Health Checks**: Waits for all services to start
6. ✅ **Shows Status**: Displays deployment results and access instructions

### Post-Deployment Verification

```bash
# Check all pod status
kubectl get pods -n nexus-python

# Check service status
kubectl get svc -n nexus-python

# Use status script
./k8s/scripts/status.sh
```

### Access the Application

```bash
# Access GraphStudio frontend
kubectl port-forward -n nexus-python svc/graphstudio-frontend 8080:80

# Then open in browser
open http://localhost:8080
```

Or via NodePort:
```
http://localhost:30080
```

### View Logs

```bash
# Workspace Kernel logs
./k8s/scripts/logs.sh workspace-kernel

# GraphStudio Backend logs
./k8s/scripts/logs.sh graphstudio-backend

# PostgreSQL logs
./k8s/scripts/logs.sh postgres

# Follow logs in real-time
./k8s/scripts/logs.sh workspace-kernel true
```

## First-Time Setup (From Scratch)

### 1. Create Kind Cluster (if needed)

```bash
kind create cluster --name nexus-python
```

### 2. Build Images

```bash
./k8s/scripts/build-images.sh
```

This script will:
- Build workspace-kernel image
- Build graphstudio-backend image
- Build graphstudio-frontend image

### 3. Deploy Services

```bash
./k8s/scripts/deploy.sh
```

The script automatically detects kind clusters and loads images!

### 4. Verify Deployment

```bash
# Wait for all pods to be running
kubectl get pods -n nexus-python

# Should see:
# NAME                                    READY   STATUS    RESTARTS   AGE
# graphstudio-backend-xxx                 1/1     Running   0          2m
# graphstudio-frontend-xxx                1/1     Running   0          2m
# postgres-0                              1/1     Running   0          3m
# redis-xxx                               1/1     Running   0          3m
# workspace-kernel-xxx                    1/1     Running   0          2m
```

## Redeployment

If code has been updated, rebuild and redeploy:

```bash
# Rebuild images
./k8s/scripts/build-images.sh

# Redeploy (will automatically load new images)
./k8s/scripts/deploy.sh
```

## Cleanup

```bash
# Delete all services
./k8s/scripts/cleanup.sh

# Delete Kind cluster
kind delete cluster --name nexus-python
```

## Common Issues

### Q: Deployment failed, what do I do?

```bash
# 1. Check failing pods
kubectl get pods -n nexus-python

# 2. View pod details
kubectl describe pod <pod-name> -n nexus-python

# 3. Check logs
kubectl logs <pod-name> -n nexus-python
```

### Q: How do I update a single service?

```bash
# 1. Rebuild image
docker build -f docker/workspace-kernel.Dockerfile -t nexus/workspace-kernel:latest .

# 2. Load to kind (if using kind)
kind load docker-image nexus/workspace-kernel:latest --name nexus-python

# 3. Restart pod
kubectl rollout restart deployment/workspace-kernel -n nexus-python
```

### Q: Images already exist, will deploy.sh reload them?

Yes! `deploy.sh` reloads images to kind cluster every time, ensuring you're using the latest version.

## Architecture

### Multi-Tenant Configuration
- Each pod supports up to **50 workspaces**
- Auto-scaling: **1-10 pods**
- Maximum capacity: **500 concurrent workspaces**

### Resource Configuration
- **PostgreSQL**: 10Gi persistent storage
- **Workspace Kernel**: 512Mi-2Gi memory, 500m-2000m CPU
- **GraphStudio Backend**: 256Mi-512Mi memory, 200m-500m CPU
- **GraphStudio Frontend**: 128Mi-256Mi memory, 100m-200m CPU
- **Redis**: 128Mi-256Mi memory, 100m-200m CPU

### Service Topology
```
Frontend (GraphStudio) → Backend APIs → Database (PostgreSQL + Redis)
                         ├─ GraphStudio Backend (Auth)
                         └─ Workspace Kernel (Main API)
```

## Technical Details

### Kind Cluster Image Loading

Since Kind clusters run in Docker containers, they can't directly access local Docker daemon images. The `deploy.sh` script:

1. Detects if current kubectl context is `kind-*`
2. If so, uses `kind load docker-image` to copy images to cluster nodes
3. This ensures pods can use `imagePullPolicy: Always` with local images

### Automatic Image Checks

The script checks for required images before deployment:
- `nexus/workspace-kernel:latest`
- `nexus/graphstudio-backend:latest`
- `nexus/graphstudio-frontend:latest`

If any are missing, it prompts you to run `build-images.sh`.

## Next Steps

- Check [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md) for complete architecture
- Check [README.md](./README.md) for more management commands
- Check [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for system architecture
