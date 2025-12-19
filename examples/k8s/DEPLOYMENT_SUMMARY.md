# Nexus K8s 多租户部署 - 实施总结

## 📦 已创建的文件

### Docker 镜像配置
```
docker/
├── graphstudio.Dockerfile       # 前端镜像（Nginx + React）
├── workspace-kernel.Dockerfile  # 后端镜像（Node.js 多租户）
├── nexus-os.Dockerfile          # AI 服务镜像（Node.js）
└── nginx.conf                   # Nginx 配置（代理规则）
```

### Kubernetes 配置
```
k8s/
├── base/
│   ├── namespace.yaml           # Nexus 命名空间
│   ├── configmap.yaml           # 环境变量配置
│   └── secrets.yaml             # 敏感信息（JWT, 密码）
│
├── services/
│   ├── graphstudio/
│   │   ├── deployment.yaml      # 前端部署
│   │   └── service.yaml         # 前端服务（NodePort 30080）
│   │
│   ├── workspace-kernel/
│   │   ├── deployment.yaml      # 后端部署（多租户配置）
│   │   ├── service.yaml         # 后端服务
│   │   └── hpa.yaml             # 自动扩缩容（1-10 pods）
│   │
│   ├── nexus-os/
│   │   ├── deployment.yaml      # AI 服务部署
│   │   └── service.yaml         # AI 服务
│   │
│   ├── postgres/
│   │   ├── statefulset.yaml     # 数据库 StatefulSet
│   │   └── service.yaml         # 数据库服务
│   │
│   └── redis/
│       ├── deployment.yaml      # Redis 部署
│       └── service.yaml         # Redis 服务
│
└── scripts/
    ├── build-images.sh          # 构建所有镜像
    ├── deploy.sh                # 部署所有服务
    ├── logs.sh                  # 查看服务日志
    ├── status.sh                # 查看集群状态
    └── cleanup.sh               # 清理所有资源
```

### 文档
```
k8s/
├── README.md                    # 快速开始指南
├── TESTING.md                   # 测试验收清单
└── DEPLOYMENT_SUMMARY.md        # 本文档
```

---

## 🎯 部署架构

### 服务拓扑

```
                    ┌───────────────────────┐
                    │  Kubernetes Cluster   │
                    └───────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐  ┌─────────▼────────┐  ┌────────▼────────┐
│ graphstudio    │  │ workspace-kernel │  │   nexus-os      │
│ (Frontend)     │  │ (Multi-Tenant)   │  │  (AI Service)   │
│ NodePort:30080 │  │ ClusterIP:3000   │  │ ClusterIP:4000  │
│ Replicas: 1    │  │ Replicas: 1-10   │  │ Replicas: 1     │
└────────────────┘  └──────────┬────────┘  └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
            ┌───────▼────────┐   ┌────────▼────────┐
            │   postgres     │   │     redis       │
            │ StatefulSet    │   │  Deployment     │
            │ Port: 5432     │   │  Port: 6379     │
            └────────────────┘   └─────────────────┘
```

### 多租户配置

**workspace-kernel** 配置为多租户模式：
- 每个 Pod 最多承载 **50 个 workspace**
- 自动扩缩容：**1-10 个 Pod**
- 最大容量：**500 个并发 workspace**
- 空闲 workspace 30 分钟后自动卸载

---

## 🚀 快速部署流程

### 1. 构建镜像（约 5-10 分钟）
```bash
cd /Users/worlesenric/wkspace/nexus-mono
./k8s/scripts/build-images.sh
```

### 2. 部署到 K8s（约 2-3 分钟）
```bash
./k8s/scripts/deploy.sh
```

### 3. 验证部署
```bash
./k8s/scripts/status.sh
```

### 4. 查看日志
```bash
# 查看 workspace-kernel 日志
./k8s/scripts/logs.sh workspace-kernel

# 查看其他服务
./k8s/scripts/logs.sh nexus-os
./k8s/scripts/logs.sh postgres
./k8s/scripts/logs.sh redis
```

### 5. 访问应用
```bash
# 方法 1: 通过 NodePort（推荐本地开发）
# 浏览器打开: http://localhost:30080

# 方法 2: 通过端口转发
kubectl port-forward -n nexus svc/graphstudio-frontend 8080:80
# 浏览器打开: http://localhost:8080
```

---

## 📊 资源配置

### 计算资源

| 服务 | Requests | Limits | 说明 |
|------|----------|---------|------|
| graphstudio | 128Mi / 0.1c | 256Mi / 0.2c | 静态文件服务 |
| workspace-kernel | 1Gi / 0.5c | 2Gi / 1c | 多租户后端 |
| nexus-os | 512Mi / 0.25c | 1Gi / 0.5c | AI 服务 |
| postgres | 512Mi / 0.25c | 1Gi / 0.5c | 数据库 |
| redis | 128Mi / 0.1c | 256Mi / 0.2c | 缓存 |
| **总计** | **~2.3Gi / ~1.2c** | **~4.5Gi / ~2.4c** | 单副本 |

### 存储

- **PostgreSQL**: 5Gi PersistentVolume（数据持久化）
- **Redis**: EmptyDir（临时存储）
- **Workspaces**: EmptyDir（临时存储，可改为 PV）

---

## 🔧 配置说明

### 环境变量（ConfigMap）

```yaml
# 多租户配置
MULTI_TENANT_MODE: "true"
MAX_WORKSPACES_PER_POD: "50"
IDLE_WORKSPACE_TIMEOUT_MS: "1800000"  # 30 分钟

# 日志配置
LOG_LEVEL: "debug"  # 开发环境
# LOG_LEVEL: "info"  # 生产环境

# 鉴权
AUTH_ENABLED: "true"
```

### 密钥（Secrets）

⚠️ **重要：生产环境必须更改！**

```yaml
JWT_SECRET: "dev-secret-key-change-in-production-please"
DATABASE_PASSWORD: "nexus-dev-password"
```

修改方法：
```bash
# 编辑 secrets.yaml
vim k8s/base/secrets.yaml

# 重新应用
kubectl apply -f k8s/base/secrets.yaml

# 重启服务
kubectl rollout restart deployment/workspace-kernel -n nexus
```

---

## 📝 日志格式

### workspace-kernel（结构化 JSON 日志）

```json
{
  "level": "info",
  "time": "2025-01-20T10:00:00.000Z",
  "msg": "Workspace created",
  "workspaceId": "ws-123",
  "userId": "user-456",
  "panelCount": 3
}
```

### nexus-os（Pino Pretty 日志）

```
[10:00:00.000] INFO: NexusOS server started {"port":4000}
[10:00:01.123] INFO: AI pipeline started {"panelId":"panel-123"}
```

### 日志查看技巧

```bash
# 实时跟踪
./k8s/scripts/logs.sh workspace-kernel true

# 查看更多行
./k8s/scripts/logs.sh workspace-kernel false 500

# 过滤特定级别
./k8s/scripts/logs.sh workspace-kernel | grep '"level":"error"'

# 查看特定 workspace
./k8s/scripts/logs.sh workspace-kernel | grep 'ws-123'
```

---

## 🔍 监控指标

### 关键指标

1. **Pod 健康状态**
   ```bash
   kubectl get pods -n nexus
   ```

2. **资源使用**
   ```bash
   kubectl top pods -n nexus
   ```

3. **HPA 状态**
   ```bash
   kubectl get hpa -n nexus
   ```

4. **事件日志**
   ```bash
   kubectl get events -n nexus --sort-by='.lastTimestamp'
   ```

### 警告阈值

- CPU 使用率 > 70% → 触发扩容
- Memory 使用率 > 80% → 触发扩容
- Pod 重启次数 > 3 → 需要调查
- workspace-kernel 延迟 > 500ms → 性能问题

---

## 🚨 故障排查流程

### 1. Pod 无法启动

```bash
# 查看 Pod 详情
kubectl describe pod -n nexus <pod-name>

# 查看日志
kubectl logs -n nexus <pod-name>

# 查看上一次运行日志（CrashLoopBackOff）
kubectl logs -n nexus <pod-name> --previous
```

### 2. 数据库连接失败

```bash
# 检查 PostgreSQL
kubectl exec -it -n nexus postgres-0 -- pg_isready -U nexus

# 测试连接
kubectl exec -it -n nexus postgres-0 -- psql -U nexus -c "SELECT 1"

# 查看连接数
kubectl exec -it -n nexus postgres-0 -- psql -U nexus -c "SELECT count(*) FROM pg_stat_activity"
```

### 3. 服务无法访问

```bash
# 检查 Service Endpoints
kubectl get endpoints -n nexus

# 测试服务连通性
kubectl run -n nexus --rm -it debug --image=busybox --restart=Never -- wget -O- http://workspace-kernel:3000/health
```

---

## 🔐 安全建议

### 生产环境 Checklist

- [ ] 更改所有默认密码和 JWT Secret
- [ ] 启用 TLS/HTTPS（使用 Ingress + cert-manager）
- [ ] 配置 NetworkPolicy 限制 Pod 间通信
- [ ] 使用 Kubernetes Secrets 加密（启用 encryption at rest）
- [ ] 配置 RBAC 限制访问权限
- [ ] 启用 Pod Security Standards
- [ ] 定期扫描镜像漏洞（Trivy/Clair）
- [ ] 配置资源配额（ResourceQuota）
- [ ] 启用审计日志（Audit Logs）
- [ ] 配置备份策略（Velero）

---

## 📈 扩容策略

### 水平扩容（HPA）

当前配置自动扩容：
- **触发条件**: CPU > 70% 或 Memory > 80%
- **扩容速度**: 每 60 秒增加 50%
- **缩容速度**: 每 60 秒减少 25%
- **范围**: 1-10 个 Pod

手动扩容：
```bash
kubectl scale deployment/workspace-kernel -n nexus --replicas=5
```

### 垂直扩容（增加资源）

编辑 `k8s/services/workspace-kernel/deployment.yaml`:
```yaml
resources:
  requests:
    memory: "2Gi"   # 从 1Gi 增加
    cpu: "1000m"    # 从 500m 增加
  limits:
    memory: "4Gi"   # 从 2Gi 增加
    cpu: "2000m"    # 从 1000m 增加
```

应用更改：
```bash
kubectl apply -f k8s/services/workspace-kernel/deployment.yaml
```

---

## 🎓 下一步

### 短期优化（1-2 周）
- [ ] 实现 workspace 状态持久化（Redis/S3）
- [ ] 添加 Prometheus + Grafana 监控
- [ ] 配置 ELK/EFK 日志聚合
- [ ] 实现优雅的 workspace 迁移

### 中期优化（1-2 月）
- [ ] 实现智能的 workspace 调度算法
- [ ] 添加多区域部署支持
- [ ] 实现 workspace 快照和恢复
- [ ] 集成 Istio 服务网格

### 长期优化（3-6 月）
- [ ] 实现混合架构（Hot/Warm/Cold Pool）
- [ ] 集成 Knative 实现 serverless
- [ ] 支持多云部署
- [ ] 实现 GitOps 流程（ArgoCD）

---

## 📞 支持

如有问题，请：
1. 查看 [k8s/TESTING.md](./TESTING.md) 测试清单
2. 查看 [k8s/README.md](./README.md) 常见问题
3. 查看日志: `./k8s/scripts/logs.sh <service-name>`
4. 提交 Issue 到项目仓库

---

**部署完成！** 🎉

现在您可以：
- ✅ 通过 `kubectl logs` 查看各服务日志
- ✅ 每个模块独立 Pod 运行
- ✅ 支持多租户 workspace（50/pod）
- ✅ 自动扩缩容（1-10 pods）
- ✅ 完整的监控和故障排查工具
