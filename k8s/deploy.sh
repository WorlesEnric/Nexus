#!/bin/bash

# Nexus Python Deployment Script
# Deploys all Kubernetes resources for Nexus Python backend

set -e

NAMESPACE="nexus-python"

echo "🚀 Deploying Nexus Python to Kubernetes..."

# Create namespace
echo "📦 Creating namespace..."
kubectl apply -f namespace.yaml

# Deploy PostgreSQL
echo "🐘 Deploying PostgreSQL..."
kubectl apply -f postgres.yaml

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n $NAMESPACE --timeout=300s

# Deploy workspace-kernel
echo "🔧 Deploying workspace-kernel..."
kubectl apply -f workspace-kernel.yaml

# Wait for workspace-kernel to be ready
echo "⏳ Waiting for workspace-kernel to be ready..."
kubectl wait --for=condition=ready pod -l app=workspace-kernel -n $NAMESPACE --timeout=300s

# Deploy ingress
echo "🌐 Deploying ingress..."
kubectl apply -f ingress.yaml

# Show deployment status
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Deployment status:"
kubectl get all -n $NAMESPACE

echo ""
echo "🔍 To check logs:"
echo "  kubectl logs -f deployment/workspace-kernel -n $NAMESPACE"

echo ""
echo "🌐 Service endpoints:"
kubectl get ingress -n $NAMESPACE
