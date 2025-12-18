# Nexus K8s 多租户部署实施计划

## 📋 目标

1. 将 Nexus 各个模块拆分为独立的 K8s Pod
2. 实现多租户 workspace-kernel 架构
3. 每个服务独立日志，可通过 kubectl logs 查看
4. 使用 dev/staging 环境配置

## 🏗️ 架构设计

### 服务拆分

```
┌─────────────────────────────────────────────────┐
│                  K8s Cluster                    │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐            │
│  │  GraphStudio │  │  Ingress     │            │
│  │  (Frontend)  │◄─┤  (Nginx)     │            │
│  └──────────────┘  └──────────────┘            │
│         │                                        │
│         ▼                                        │
│  ┌──────────────────────────────────┐           │
│  │   Workspace Kernel (Multi-Tenant)│           │
│  │   - 50 workspaces/pod            │           │
│  │   - Auto-scaling (1-10 pods)     │           │
│  └──────────────────────────────────┘           │
│         │          │                             │
│         ▼          ▼                             │
│  ┌──────────┐  ┌──────────┐                     │
│  │ NexusOS  │  │PostgreSQL│                     │
│  │ (AI)     │  │ (Data)   │                     │
│  └──────────┘  └──────────┘                     │
│         │                                        │
│         ▼                                        │
│  ┌──────────┐                                   │
│  │  Redis   │                                   │
│  │ (Cache)  │                                   │
│  └──────────┘                                   │
└─────────────────────────────────────────────────┘
```

### 服务列表

| 服务名 | 副本数 | 资源配置 | 端口 | 日志级别 |
|--------|--------|----------|------|----------|
| **graphstudio-frontend** | 1 | 256Mi/0.2c | 80 | info |
| **workspace-kernel** | 1-10 | 2Gi/1c | 3000 | debug |
| **nexus-os** | 1-3 | 1Gi/0.5c | 4000 | info |
| **postgres** | 1 | 1Gi/0.5c | 5432 | info |
| **redis** | 1 | 256Mi/0.1c | 6379 | info |

## 📁 目录结构

```
nexus-mono/
├── k8s/
│   ├── base/                    # 基础配置
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml
│   │   ├── secrets.yaml
│   │   └── storage.yaml
│   ├── services/                # 各服务部署
│   │   ├── graphstudio/
│   │   │   ├── deployment.yaml
│   │   │   └── service.yaml
│   │   ├── workspace-kernel/
│   │   │   ├── deployment.yaml
│   │   │   ├── service.yaml
│   │   │   └── hpa.yaml        # 自动扩缩容
│   │   ├── nexus-os/
│   │   │   ├── deployment.yaml
│   │   │   └── service.yaml
│   │   ├── postgres/
│   │   │   ├── statefulset.yaml
│   │   │   ├── service.yaml
│   │   │   └── pvc.yaml
│   │   └── redis/
│   │       ├── deployment.yaml
│   │       └── service.yaml
│   ├── ingress/
│   │   └── ingress.yaml
│   └── scripts/
│       ├── deploy.sh            # 部署脚本
│       ├── logs.sh              # 查看日志
│       ├── status.sh            # 查看状态
│       └── cleanup.sh           # 清理环境
├── docker/
│   ├── graphstudio.Dockerfile
│   ├── workspace-kernel.Dockerfile
│   └── nexus-os.Dockerfile
└── .env.k8s                     # K8s 环境变量
```

## 🔧 实施步骤

### Phase 1: 基础设施准备
- [ ] 创建 K8s 目录结构
- [ ] 编写 namespace 和 configmap
- [ ] 创建 secrets 配置
- [ ] 配置持久化存储

### Phase 2: 服务容器化
- [ ] 编写 GraphStudio Dockerfile
- [ ] 编写 workspace-kernel Dockerfile（多租户模式）
- [ ] 编写 nexus-os Dockerfile
- [ ] 构建和推送镜像到本地 registry

### Phase 3: 数据库部署
- [ ] 部署 PostgreSQL StatefulSet
- [ ] 部署 Redis
- [ ] 初始化数据库 schema
- [ ] 验证数据库连接

### Phase 4: 应用服务部署
- [ ] 部署 workspace-kernel（多租户配置）
- [ ] 部署 nexus-os
- [ ] 部署 GraphStudio frontend
- [ ] 配置 Service 和 Ingress

### Phase 5: 日志和监控
- [ ] 配置结构化日志输出
- [ ] 添加日志查看脚本
- [ ] 配置健康检查
- [ ] 添加 Prometheus metrics（可选）

### Phase 6: 测试验证
- [ ] 验证所有 Pod 启动正常
- [ ] 测试日志查看功能
- [ ] 测试服务间通信
- [ ] 测试多租户功能
- [ ] 压力测试（可选）

## 🎯 验收标准

### 1. 服务启动检查
```bash
# 所有 Pod 应为 Running 状态
kubectl get pods -n nexus

# 预期输出：
# NAME                                  READY   STATUS    RESTARTS   AGE
# graphstudio-frontend-xxx              1/1     Running   0          2m
# workspace-kernel-xxx                  1/1     Running   0          2m
# nexus-os-xxx                          1/1     Running   0          2m
# postgres-0                            1/1     Running   0          2m
# redis-xxx                             1/1     Running   0          2m
```

### 2. 日志查看测试
```bash
# 查看各服务日志
kubectl logs -n nexus deployment/workspace-kernel --tail=50
kubectl logs -n nexus deployment/nexus-os --tail=50
kubectl logs -n nexus deployment/graphstudio-frontend --tail=50
kubectl logs -n nexus statefulset/postgres --tail=50
kubectl logs -n nexus deployment/redis --tail=50

# 日志应包含：
# - 服务启动信息
# - 数据库连接成功
# - HTTP 服务监听端口
# - 无 ERROR 级别日志
```

### 3. 健康检查
```bash
# 检查服务健康状态
kubectl get endpoints -n nexus

# 所有 endpoint 应有 IP 地址
```

### 4. 功能测试
```bash
# 测试前端访问
curl http://localhost/health

# 测试 workspace-kernel API
kubectl port-forward -n nexus svc/workspace-kernel 3000:3000
curl http://localhost:3000/health

# 测试数据库连接
kubectl exec -n nexus postgres-0 -- psql -U nexus -c "SELECT 1"
```

## 📝 配置说明

### 多租户配置
```yaml
env:
  - name: MULTI_TENANT_MODE
    value: "true"
  - name: MAX_WORKSPACES_PER_POD
    value: "50"
  - name: IDLE_WORKSPACE_TIMEOUT_MS
    value: "1800000"  # 30 分钟
  - name: LOG_LEVEL
    value: "debug"
```

### 日志配置
所有服务使用 JSON 格式日志：
```json
{
  "timestamp": "2025-01-01T00:00:00.000Z",
  "level": "info",
  "service": "workspace-kernel",
  "message": "Workspace created",
  "workspaceId": "ws-123",
  "userId": "user-456"
}
```

## 🚀 快速开始

```bash
# 1. 构建镜像
cd nexus-mono
./k8s/scripts/build-images.sh

# 2. 部署所有服务
./k8s/scripts/deploy.sh

# 3. 查看状态
./k8s/scripts/status.sh

# 4. 查看日志
./k8s/scripts/logs.sh workspace-kernel
./k8s/scripts/logs.sh nexus-os

# 5. 端口转发（本地访问）
kubectl port-forward -n nexus svc/graphstudio-frontend 8080:80
# 访问 http://localhost:8080
```

## 🔍 故障排查

### Pod 无法启动
```bash
# 查看 Pod 详细信息
kubectl describe pod -n nexus <pod-name>

# 查看事件
kubectl get events -n nexus --sort-by='.lastTimestamp'
```

### 服务无法连接
```bash
# 检查 Service
kubectl get svc -n nexus

# 检查 endpoints
kubectl get endpoints -n nexus <service-name>

# 测试服务连通性
kubectl run -n nexus --rm -it debug --image=busybox --restart=Never -- wget -O- http://<service-name>:port/health
```

### 数据库问题
```bash
# 查看数据库日志
kubectl logs -n nexus postgres-0

# 进入数据库
kubectl exec -it -n nexus postgres-0 -- psql -U nexus

# 检查表
\dt
```

## 📊 监控指标

### 关键指标
- Pod CPU/Memory 使用率
- workspace-kernel 活跃 workspace 数量
- 请求延迟 (p50, p95, p99)
- 错误率
- Pod 重启次数

### 查看指标
```bash
# CPU/Memory 使用
kubectl top pods -n nexus

# 详细资源使用
kubectl describe node

# HPA 状态
kubectl get hpa -n nexus
```

## 🎓 下一步优化

1. **Helm Chart**: 使用 Helm 简化部署
2. **GitOps**: 集成 ArgoCD 实现 GitOps
3. **监控**: 部署 Prometheus + Grafana
4. **日志聚合**: 部署 EFK/ELK stack
5. **服务网格**: 集成 Istio（可选）
6. **备份恢复**: 自动化数据库备份
