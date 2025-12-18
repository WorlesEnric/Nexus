# 🚀 Nexus K8s 多租户部署 - 快速指南

## ✅ 已完成的工作

### 1. Docker 镜像配置
- ✅ GraphStudio Frontend (React + Nginx)
- ✅ Workspace Kernel (Node.js 多租户后端)
- ✅ NexusOS (AI 服务)
- ✅ 多阶段构建优化镜像大小
- ✅ 健康检查配置

### 2. Kubernetes 部署配置
- ✅ Namespace 隔离
- ✅ ConfigMaps（环境变量）
- ✅ Secrets（敏感信息）
- ✅ PostgreSQL StatefulSet（持久化）
- ✅ Redis Deployment
- ✅ 所有服务的 Deployment 和 Service
- ✅ HPA 自动扩缩容（1-10 pods）

### 3. 管理脚本
- ✅ build-images.sh - 构建所有镜像
- ✅ deploy.sh - 一键部署
- ✅ logs.sh - 查看日志
- ✅ status.sh - 查看状态
- ✅ cleanup.sh - 清理环境

### 4. 文档
- ✅ README.md - 快速开始
- ✅ TESTING.md - 测试验收清单
- ✅ DEPLOYMENT_SUMMARY.md - 完整部署文档
- ✅ k8s-deployment-plan.md - 实施计划

---

## 🎯 立即开始部署

### 前置要求
- Kubernetes 集群（Docker Desktop / Minikube / Kind）
- kubectl 已配置
- Docker 运行中

### 三步部署

```bash
cd /Users/worlesenric/wkspace/nexus-mono

# 步骤 1: 构建镜像（5-10 分钟）
./k8s/scripts/build-images.sh

# 步骤 2: 部署服务（2-3 分钟）
./k8s/scripts/deploy.sh

# 步骤 3: 验证部署
./k8s/scripts/status.sh
```

### 查看日志

```bash
# Workspace Kernel（后端核心）
./k8s/scripts/logs.sh workspace-kernel

# NexusOS（AI 服务）
./k8s/scripts/logs.sh nexus-os

# PostgreSQL（数据库）
./k8s/scripts/logs.sh postgres

# 实时跟踪
./k8s/scripts/logs.sh workspace-kernel true
```

### 访问应用

```bash
# 浏览器访问（NodePort）
open http://localhost:30080

# 或使用端口转发
kubectl port-forward -n nexus svc/graphstudio-frontend 8080:80
open http://localhost:8080
```

---

## 📊 架构特点

### 多租户配置
- **每个 Pod**: 承载 50 个 workspace
- **自动扩缩容**: 1-10 个 Pod
- **最大容量**: 500 个并发 workspace
- **空闲管理**: 30 分钟自动卸载

### 服务拓扑
```
Frontend (GraphStudio) → Backend (Workspace Kernel) ⇄ AI (NexusOS)
                              ↓
                      Database (PostgreSQL) + Cache (Redis)
```

### 资源使用
- **总资源**: ~2.3Gi Memory / ~1.2 CPU（单副本）
- **可扩展到**: ~23Gi Memory / ~12 CPU（10 副本）

---

## ✅ 验收标准

### 所有 Pod 正常运行
```bash
kubectl get pods -n nexus
```
预期：所有 Pod 都是 `Running` 状态

### 日志正常输出
```bash
./k8s/scripts/logs.sh workspace-kernel
```
预期：看到结构化 JSON 日志，无 ERROR

### 服务可访问
```bash
curl http://localhost:30080/health
```
预期：返回 `200 OK`

---

## 🔍 故障排查

### Pod 无法启动
```bash
kubectl describe pod -n nexus <pod-name>
kubectl logs -n nexus <pod-name>
```

### 查看所有事件
```bash
kubectl get events -n nexus --sort-by='.lastTimestamp'
```

### 重启服务
```bash
kubectl rollout restart deployment/workspace-kernel -n nexus
```

---

## 📚 完整文档

- **快速开始**: [k8s/README.md](k8s/README.md)
- **测试清单**: [k8s/TESTING.md](k8s/TESTING.md)
- **部署总结**: [k8s/DEPLOYMENT_SUMMARY.md](k8s/DEPLOYMENT_SUMMARY.md)
- **实施计划**: [docs/k8s-deployment-plan.md](docs/k8s-deployment-plan.md)

---

## 🎉 部署完成

现在您拥有：
- ✅ 独立的服务 Pod（便于调试）
- ✅ 完整的日志系统（kubectl logs）
- ✅ 多租户架构（50 workspace/pod）
- ✅ 自动扩缩容（HPA）
- ✅ 一键部署和管理脚本

**开始使用**: `./k8s/scripts/deploy.sh` 🚀
