# Nexus K8s 快速部署指南

## 一键部署步骤

### 前置条件

- Docker 已安装并运行
- kubectl 已安装
- Kind 集群已创建（如果使用 kind）

### 完整部署流程

```bash
# 1. 进入项目目录
cd /Users/worlesenric/wkspace/nexus-mono

# 2. 构建所有 Docker 镜像（约 5-10 分钟）
./k8s/scripts/build-images.sh

# 3. 部署到 Kubernetes（约 2-3 分钟）
./k8s/scripts/deploy.sh
```

就是这么简单！🎉

### deploy.sh 脚本功能

更新后的 `deploy.sh` 脚本现在会自动：

1. ✅ **检测 Kind 集群**：自动识别是否使用 kind
2. ✅ **检查镜像**：验证所有必需的 Docker 镜像是否已构建
3. ✅ **加载镜像**：如果使用 kind，自动将镜像加载到集群
4. ✅ **部署服务**：按正确顺序部署所有服务
   - Namespace & ConfigMaps & Secrets
   - PostgreSQL & Redis（等待就绪）
   - Workspace Kernel（等待就绪）
   - GraphStudio Frontend（等待就绪）
5. ✅ **健康检查**：等待所有服务启动完成
6. ✅ **显示状态**：展示部署结果和访问方式

### 部署后验证

```bash
# 查看所有 Pod 状态
kubectl get pods -n nexus

# 查看服务状态
kubectl get svc -n nexus

# 使用状态脚本
./k8s/scripts/status.sh
```

### 访问应用

```bash
# 访问 GraphStudio 前端
kubectl port-forward -n nexus svc/graphstudio-frontend 8080:80

# 然后在浏览器中打开
open http://localhost:8080
```

### 查看日志

```bash
# Workspace Kernel 日志
./k8s/scripts/logs.sh workspace-kernel

# PostgreSQL 日志
./k8s/scripts/logs.sh postgres

# GraphStudio 日志
./k8s/scripts/logs.sh graphstudio-frontend

# 实时跟踪日志
./k8s/scripts/logs.sh workspace-kernel true
```

## 首次部署（从零开始）

### 1. 创建 Kind 集群（如果还没有）

```bash
kind create cluster --name nexus
```

### 2. 构建镜像

```bash
./k8s/scripts/build-images.sh
```

这个脚本会：
- 启动本地 Docker registry（端口 5001）
- 构建 workspace-kernel 镜像
- 构建 graphstudio-frontend 镜像
- 将镜像推送到本地 registry

### 3. 部署服务

```bash
./k8s/scripts/deploy.sh
```

脚本会自动检测 kind 集群并加载镜像！

### 4. 验证部署

```bash
# 等待所有 Pod 运行
kubectl get pods -n nexus

# 应该看到：
# NAME                                    READY   STATUS    RESTARTS   AGE
# graphstudio-frontend-xxx                1/1     Running   0          2m
# postgres-0                              1/1     Running   0          3m
# redis-xxx                               1/1     Running   0          3m
# workspace-kernel-xxx                    1/1     Running   0          2m
```

## 重新部署

如果代码有更新，只需重新构建并部署：

```bash
# 重新构建镜像
./k8s/scripts/build-images.sh

# 重新部署（会自动加载新镜像）
./k8s/scripts/deploy.sh
```

## 清理部署

```bash
# 删除所有服务
./k8s/scripts/cleanup.sh

# 删除 Kind 集群
kind delete cluster --name nexus
```

## 常见问题

### Q: 部署失败怎么办？

```bash
# 1. 查看失败的 Pod
kubectl get pods -n nexus

# 2. 查看 Pod 详情
kubectl describe pod <pod-name> -n nexus

# 3. 查看日志
kubectl logs <pod-name> -n nexus
```

### Q: 如何更新单个服务？

```bash
# 1. 重新构建镜像
docker build -f docker/workspace-kernel.Dockerfile -t localhost:5001/nexus/workspace-kernel:latest .

# 2. 加载到 kind（如果使用 kind）
kind load docker-image localhost:5001/nexus/workspace-kernel:latest --name nexus

# 3. 重启 Pod
kubectl rollout restart deployment/workspace-kernel -n nexus
```

### Q: 镜像已存在，deploy.sh 会重新加载吗？

会的！`deploy.sh` 每次都会将本地镜像加载到 kind 集群，确保使用最新版本。

## 架构说明

### 多租户配置
- 每个 Pod 最多承载 **50 个 workspace**
- 自动扩缩容：**1-10 个 Pod**
- 最大容量：**500 个并发 workspace**

### 资源配置
- **PostgreSQL**: 5Gi 持久化存储
- **Workspace Kernel**: 1Gi-2Gi 内存，0.5-1 CPU
- **GraphStudio**: 128Mi-256Mi 内存，0.1-0.2 CPU
- **Redis**: 128Mi-256Mi 内存，0.1-0.2 CPU

### 服务拓扑
```
Frontend (GraphStudio) → Backend (Workspace Kernel) → Database (PostgreSQL + Redis)
```

## 技术细节

### Kind 集群镜像加载

由于 Kind 集群运行在 Docker 容器中，它无法直接访问本地 Docker 守护进程的镜像。`deploy.sh` 脚本会：

1. 检测当前 kubectl context 是否为 `kind-*`
2. 如果是 kind，使用 `kind load docker-image` 将镜像复制到集群节点
3. 这确保 Pod 可以使用 `imagePullPolicy: Never` 拉取本地镜像

### 自动镜像检查

脚本会在部署前检查所有必需的镜像：
- `localhost:5001/nexus/workspace-kernel:latest`
- `localhost:5001/nexus/graphstudio:latest`

如果缺少镜像，会提示运行 `build-images.sh`。

## 下一步

- 查看 [DEPLOYMENT_SUMMARY.md](./DEPLOYMENT_SUMMARY.md) 了解完整架构
- 查看 [TESTING.md](./TESTING.md) 了解测试清单
- 查看 [README.md](./README.md) 了解更多管理命令
