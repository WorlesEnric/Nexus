# Nexus K8s 部署测试验收清单

## ✅ 验收标准

### 1. 所有 Pod 正常运行

```bash
kubectl get pods -n nexus
```

**预期结果：**
```
NAME                                  READY   STATUS    RESTARTS   AGE
graphstudio-frontend-xxx              1/1     Running   0          2m
workspace-kernel-xxx                  1/1     Running   0          2m
nexus-os-xxx                          1/1     Running   0          2m
postgres-0                            1/1     Running   0          2m
redis-xxx                             1/1     Running   0          2m
```

所有 Pod 应该：
- ✅ STATUS = Running
- ✅ READY = 1/1
- ✅ RESTARTS = 0 或很少

### 2. 所有 Service 正常

```bash
kubectl get svc -n nexus
```

**预期结果：**
```
NAME                   TYPE        CLUSTER-IP      PORT(S)
graphstudio-frontend   NodePort    10.x.x.x        80:30080/TCP
workspace-kernel       ClusterIP   10.x.x.x        3000/TCP
nexus-os               ClusterIP   10.x.x.x        4000/TCP
postgres               ClusterIP   10.x.x.x        5432/TCP
redis                  ClusterIP   10.x.x.x        6379/TCP
```

所有 Service 应该：
- ✅ 有 CLUSTER-IP 分配
- ✅ ENDPOINTS 不为空（通过 `kubectl get endpoints -n nexus` 检查）

---

## 🔍 详细测试步骤

### 步骤 1: 查看 PostgreSQL 日志

```bash
./k8s/scripts/logs.sh postgres
```

**检查项：**
- ✅ 看到 "database system is ready to accept connections"
- ✅ 没有连接错误
- ✅ 没有权限错误

**示例输出：**
```
2025-01-20 10:00:00.000 UTC [1] LOG:  database system is ready to accept connections
2025-01-20 10:00:01.000 UTC [45] LOG:  connection received: host=10.1.0.5 port=54321
```

### 步骤 2: 查看 Redis 日志

```bash
./k8s/scripts/logs.sh redis
```

**检查项：**
- ✅ 看到 "Ready to accept connections"
- ✅ 没有内存错误

**示例输出：**
```
1:M 20 Jan 2025 10:00:00.000 * Ready to accept connections
1:M 20 Jan 2025 10:00:01.000 * DB loaded from append only file: 0.000 seconds
```

### 步骤 3: 查看 workspace-kernel 日志

```bash
./k8s/scripts/logs.sh workspace-kernel
```

**检查项：**
- ✅ 看到 "Workspace Kernel started"
- ✅ 数据库连接成功
- ✅ Prisma migrations 完成
- ✅ HTTP 服务监听在 3000 端口
- ✅ 看到 "Multi-tenant mode: enabled"

**示例输出（结构化 JSON 日志）：**
```json
{"level":"info","time":"2025-01-20T10:00:00.000Z","msg":"Workspace Kernel starting","env":"development"}
{"level":"info","time":"2025-01-20T10:00:01.000Z","msg":"Database connected","host":"postgres","port":5432}
{"level":"info","time":"2025-01-20T10:00:02.000Z","msg":"Prisma migrations completed"}
{"level":"info","time":"2025-01-20T10:00:03.000Z","msg":"Multi-tenant mode enabled","maxWorkspaces":50}
{"level":"info","time":"2025-01-20T10:00:04.000Z","msg":"HTTP server listening","port":3000}
```

### 步骤 4: 查看 nexus-os 日志

```bash
./k8s/scripts/logs.sh nexus-os
```

**检查项：**
- ✅ 看到 "NexusOS server started"
- ✅ 端口 4000 监听
- ✅ 显示可用 endpoints

**示例输出：**
```
[10:00:00.000] INFO: NexusOS server started {"port":4000,"host":"localhost"}
[10:00:00.001] INFO: Available endpoints:
[10:00:00.001] INFO:   GET  /health
[10:00:00.001] INFO:   POST /context/build
[10:00:00.001] INFO:   POST /patch/generate
[10:00:00.001] INFO:   POST /ai/complete
```

### 步骤 5: 查看 graphstudio-frontend 日志

```bash
./k8s/scripts/logs.sh graphstudio-frontend
```

**检查项：**
- ✅ Nginx 启动日志
- ✅ 没有 404 或 500 错误

---

## 🧪 功能测试

### 测试 1: Health Checks

```bash
# 测试 workspace-kernel
kubectl port-forward -n nexus svc/workspace-kernel 3000:3000 &
curl http://localhost:3000/health
# 预期: {"status":"healthy",...}

# 测试 nexus-os
kubectl port-forward -n nexus svc/nexus-os 4000:4000 &
curl http://localhost:4000/health
# 预期: {"status":"ok","service":"NexusOS",...}
```

### 测试 2: 数据库连接

```bash
kubectl exec -it -n nexus postgres-0 -- psql -U nexus -c "SELECT 1"
```

**预期输出：**
```
 ?column?
----------
        1
(1 row)
```

### 测试 3: Redis 连接

```bash
kubectl exec -it -n nexus deployment/redis -- redis-cli ping
```

**预期输出：**
```
PONG
```

### 测试 4: 服务间通信

在 workspace-kernel pod 中测试连接：

```bash
POD=$(kubectl get pod -n nexus -l app=workspace-kernel -o jsonpath="{.items[0].metadata.name}")
kubectl exec -it -n nexus $POD -- /bin/sh

# 在 pod 内执行
wget -O- http://postgres:5432  # 应该返回 postgres 响应
wget -O- http://redis:6379     # 应该返回 redis 响应
wget -O- http://nexus-os:4000/health  # 应该返回 {"status":"ok"}
```

### 测试 5: 前端访问

```bash
# 端口转发
kubectl port-forward -n nexus svc/graphstudio-frontend 8080:80

# 在浏览器打开
open http://localhost:8080

# 或使用 curl
curl -I http://localhost:8080
# 预期: HTTP/1.1 200 OK
```

---

## 📊 资源使用检查

### CPU 和内存使用

```bash
kubectl top pods -n nexus
```

**预期范围：**
- graphstudio-frontend: < 100Mi memory, < 0.1 CPU
- workspace-kernel: < 1Gi memory, < 0.5 CPU
- nexus-os: < 500Mi memory, < 0.3 CPU
- postgres: < 500Mi memory, < 0.3 CPU
- redis: < 200Mi memory, < 0.1 CPU

---

## 🚨 常见问题排查

### 问题 1: Pod 一直 Pending

**检查：**
```bash
kubectl describe pod -n nexus <pod-name>
```

**可能原因：**
- 资源不足（CPU/Memory）
- PVC 无法绑定
- 镜像拉取失败

### 问题 2: Pod CrashLoopBackOff

**检查：**
```bash
kubectl logs -n nexus <pod-name> --previous
```

**可能原因：**
- 应用启动失败
- 数据库连接失败
- 环境变量配置错误

### 问题 3: 数据库连接超时

**检查：**
```bash
# 查看 postgres 是否 ready
kubectl get pods -n nexus -l app=postgres

# 测试连接
kubectl exec -it -n nexus postgres-0 -- pg_isready -U nexus
```

### 问题 4: 镜像拉取失败

**检查：**
```bash
# 确认本地 registry 运行
docker ps | grep registry

# 重新推送镜像
./k8s/scripts/build-images.sh
```

---

## ✅ 最终验收检查清单

完成所有测试后，检查以下项目：

- [ ] 所有 5 个 Pod 都是 Running 状态
- [ ] 所有 Pod 的 health checks 通过
- [ ] PostgreSQL 日志正常，能接受连接
- [ ] Redis 日志正常，PONG 响应
- [ ] workspace-kernel 日志显示多租户模式启用
- [ ] nexus-os 日志显示所有 endpoints
- [ ] graphstudio-frontend 可以通过浏览器访问
- [ ] 数据库连接测试通过（SELECT 1）
- [ ] Redis 连接测试通过（PING）
- [ ] 服务间通信正常（Pod 内部可以访问其他服务）
- [ ] 资源使用在预期范围内
- [ ] 没有频繁的 Pod 重启
- [ ] 没有 ERROR 级别的日志

---

## 📝 测试记录模板

```
测试日期: ____________________
测试人员: ____________________
K8s 版本: ____________________

Pod 状态:
  ✅/❌ graphstudio-frontend: _______
  ✅/❌ workspace-kernel: _______
  ✅/❌ nexus-os: _______
  ✅/❌ postgres: _______
  ✅/❌ redis: _______

日志检查:
  ✅/❌ 所有日志正常，无错误
  ✅/❌ 结构化日志格式正确

功能测试:
  ✅/❌ Health checks 通过
  ✅/❌ 数据库连接正常
  ✅/❌ Redis 连接正常
  ✅/❌ 前端可访问

资源使用:
  ✅/❌ CPU 使用在范围内
  ✅/❌ Memory 使用在范围内

备注:
_________________________________
_________________________________
```
