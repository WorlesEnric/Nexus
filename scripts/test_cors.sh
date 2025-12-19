#!/bin/bash

# Test CORS configuration for GraphStudio backend

echo "Testing CORS configuration..."
echo ""

BACKEND_URL="http://localhost:30090"
ORIGIN="http://localhost:8080"

echo "1. Testing OPTIONS preflight request:"
echo "--------------------------------------"
curl -v -X OPTIONS "${BACKEND_URL}/auth/token" \
  -H "Origin: ${ORIGIN}" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type" \
  2>&1 | grep -i "access-control\|origin\|HTTP"

echo ""
echo "2. Testing POST request with Origin header:"
echo "--------------------------------------------"
curl -v -X POST "${BACKEND_URL}/auth/token" \
  -H "Origin: ${ORIGIN}" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@example.com&password=test" \
  2>&1 | grep -i "access-control\|origin\|HTTP" | head -10

echo ""
echo "3. Testing CORS test endpoint:"
echo "------------------------------"
curl -v -X GET "${BACKEND_URL}/cors-test" \
  -H "Origin: ${ORIGIN}" \
  2>&1 | grep -i "access-control\|origin\|HTTP" | head -10

echo ""
echo "Done. Check above for 'Access-Control-Allow-Origin' headers."

