# Nexus Kubernetes Deployment

完整的 Nexus 多租户 K8s 部署方案。

## 📋 先决条件

- Kubernetes 集群（本地可使用 Docker Desktop、Minikube 或 Kind）
- kubectl 命令行工具
- Docker 和 Docker Compose

## 🚀 快速开始

### 1. 构建镜像

```bash
./k8s/scripts/build-images.sh
```

这将构建并推送以下镜像到本地 registry:
- `localhost:5000/nexus/workspace-kernel:latest`
- `localhost:5000/nexus/nexus-os:latest`
- `localhost:5000/nexus/graphstudio:latest`

### 2. 部署到 K8s

```bash
./k8s/scripts/deploy.sh
```

部署包括：
- PostgreSQL (数据库)
- Redis (缓存)
- Workspace Kernel (多租户后端)
- NexusOS (AI 服务)
- GraphStudio (前端)

### 3. 查看状态

```bash
./k8s/scripts/status.sh
```

### 4. 查看日志

```bash
# 查看 workspace-kernel 日志
./k8s/scripts/logs.sh workspace-kernel

# 实时跟踪日志
./k8s/scripts/logs.sh workspace-kernel true

# 查看更多行数
./k8s/scripts/logs.sh workspace-kernel false 500
```

### 5. 访问应用

```bash
# 端口转发到本地
kubectl port-forward -n nexus svc/graphstudio-frontend 8080:80

# 然后在浏览器打开
# http://localhost:8080
```

## 📊 服务架构

```
┌─────────────────────────────────┐
│   graphstudio-frontend (80)     │  ← Frontend (React + Nginx)
└─────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────┐
│   workspace-kernel (3000)       │  ← Backend API + WebSocket
│   - Multi-tenant (50 ws/pod)    │
│   - Auto-scaling (1-10 pods)    │
└─────────────────────────────────┘
         │            │
         ↓            ↓
┌──────────────┐  ┌──────────────┐
│ nexus-os     │  │ postgres     │  ← AI Service & Database
│ (4000)       │  │ (5432)       │
└──────────────┘  └──────────────┘
         │
         ↓
    ┌──────────┐
    │  redis   │  ← Cache
    │  (6379)  │
    └──────────┘
```

## 🛠️ 常用命令

### 查看所有 Pod

```bash
kubectl get pods -n nexus
```

### 查看 Pod 详细信息

```bash
kubectl describe pod -n nexus <pod-name>
```

### 进入 Pod

```bash
kubectl exec -it -n nexus <pod-name> -- /bin/sh
```

### 查看事件

```bash
kubectl get events -n nexus --sort-by='.lastTimestamp'
```

### 重启服务

```bash
kubectl rollout restart deployment/workspace-kernel -n nexus
```

### 扩容/缩容

```bash
kubectl scale deployment/workspace-kernel -n nexus --replicas=3
```

## 🔍 故障排查

### Pod 无法启动

1. 查看 Pod 状态
```bash
kubectl describe pod -n nexus <pod-name>
```

2. 查看日志
```bash
kubectl logs -n nexus <pod-name>
```

3. 查看事件
```bash
kubectl get events -n nexus
```

### 数据库连接失败

1. 检查 PostgreSQL 是否运行
```bash
kubectl get pods -n nexus -l app=postgres
```

2. 测试数据库连接
```bash
kubectl exec -it -n nexus postgres-0 -- psql -U nexus -c "SELECT 1"
```

3. 查看数据库日志
```bash
./k8s/scripts/logs.sh postgres
```

### 镜像拉取失败

确保本地 registry 运行：
```bash
docker ps | grep registry
```

如果没有运行，启动它：
```bash
docker run -d -p 5000:5000 --name registry registry:2
```

## 🗑️ 清理

删除所有资源：
```bash
./k8s/scripts/cleanup.sh
```

## 📝 配置

### 环境变量

在 `k8s/base/configmap.yaml` 中配置：
- `MAX_WORKSPACES_PER_POD`: 每个 Pod 最大 workspace 数
- `IDLE_WORKSPACE_TIMEOUT_MS`: 空闲 workspace 超时时间
- `LOG_LEVEL`: 日志级别 (debug/info/warn/error)

### 资源限制

在各服务的 `deployment.yaml` 中调整 `resources`:
```yaml
resources:
  requests:
    memory: "1Gi"
    cpu: "500m"
  limits:
    memory: "2Gi"
    cpu: "1000m"
```

### 自动扩缩容

编辑 `k8s/services/workspace-kernel/hpa.yaml`:
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

## 🔐 安全性

### 生产环境建议

1. **更改默认密码**
   编辑 `k8s/base/secrets.yaml`:
   ```yaml
   JWT_SECRET: "<your-secure-secret>"
   DATABASE_PASSWORD: "<your-secure-password>"
   ```

2. **使用 TLS**
   配置 Ingress with cert-manager

3. **网络策略**
   添加 NetworkPolicy 限制 Pod 间通信

4. **镜像扫描**
   使用 Trivy 或 Clair 扫描镜像漏洞

## 📈 监控（可选）

### 安装 Prometheus + Grafana

```bash
# 使用 Helm 安装 kube-prometheus-stack
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

### 访问 Grafana

```bash
kubectl port-forward -n monitoring svc/monitoring-grafana 3000:80
# 默认用户名: admin
# 密码: prom-operator
```

## 📚 更多信息

- [部署实施计划](../docs/k8s-deployment-plan.md)
- [Nexus 架构文档](../docs/nexus_spec.md)
- [故障排查指南](../docs/troubleshooting.md)
