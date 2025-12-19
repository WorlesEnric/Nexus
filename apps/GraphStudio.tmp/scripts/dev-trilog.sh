#!/bin/bash
#
# Port-forward TriLog services from K8s for local development
#
# This script sets up port forwarding from your local machine to the
# TriLog infrastructure running in Kubernetes.
#
# Usage: ./scripts/dev-trilog.sh
#

set -e

echo "🔗 Port-forwarding TriLog services from Kubernetes..."
echo ""

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl not found. Please install kubectl first."
    exit 1
fi

# Check if trilog-system namespace exists
if ! kubectl get namespace trilog-system &> /dev/null; then
    echo "❌ Namespace 'trilog-system' not found in Kubernetes."
    echo "   Please deploy TriLog infrastructure first:"
    echo "   kubectl apply -f ../../trilog/k8s/namespace.yaml"
    echo "   kubectl apply -k ../../trilog/k8s/base"
    exit 1
fi

# Check if otel-collector service exists
if ! kubectl get svc otel-collector -n trilog-system &> /dev/null; then
    echo "❌ Service 'otel-collector' not found in trilog-system namespace."
    echo "   Please deploy TriLog infrastructure first:"
    echo "   kubectl apply -k ../../trilog/k8s/base"
    exit 1
fi

echo "✓ Kubernetes cluster and TriLog services found"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping port-forward..."
    kill $(jobs -p) 2>/dev/null || true
    exit 0
}

trap cleanup SIGINT SIGTERM

# Port-forward backend (gRPC)
echo "📡 Forwarding backend gRPC port (4317)..."
kubectl port-forward -n trilog-system svc/otel-collector 4317:4317 > /dev/null 2>&1 &
BACKEND_PID=$!

# Port-forward frontend (HTTP)
echo "📡 Forwarding frontend HTTP port (4318)..."
kubectl port-forward -n trilog-system svc/otel-collector 4318:4318 > /dev/null 2>&1 &
FRONTEND_PID=$!

# Give port-forwards time to establish
sleep 2

# Check if port-forwards are running
if ! ps -p $BACKEND_PID > /dev/null 2>&1; then
    echo "❌ Backend port-forward failed"
    cleanup
    exit 1
fi

if ! ps -p $FRONTEND_PID > /dev/null 2>&1; then
    echo "❌ Frontend port-forward failed"
    kill $BACKEND_PID 2>/dev/null || true
    cleanup
    exit 1
fi

echo ""
echo "✅ TriLog endpoints ready:"
echo "   Backend (gRPC):  localhost:4317"
echo "   Frontend (HTTP): localhost:4318"
echo ""
echo "💡 Tips:"
echo "   - Backend uses gRPC on port 4317"
echo "   - Frontend uses HTTP on port 4318"
echo "   - Logs will appear in ClickHouse in the trilog_graphstudio database"
echo ""
echo "Press Ctrl+C to stop port-forwarding"
echo ""

# Wait for Ctrl+C
wait
