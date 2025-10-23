#!/bin/bash

# Diagnostic script for blank screen issues

echo "=========================================="
echo "Kubernetes CLI Manager - Diagnostics"
echo "=========================================="
echo ""

# Check 1: Kubeconfig
echo "1. Checking kubeconfig..."
if [ -f "$HOME/.kube/config" ]; then
    echo "   ✓ Kubeconfig exists at ~/.kube/config"
elif [ -n "$KUBECONFIG" ]; then
    echo "   ✓ KUBECONFIG env var set to: $KUBECONFIG"
else
    echo "   ✗ No kubeconfig found!"
    echo "     Create one or set KUBECONFIG environment variable"
fi
echo ""

# Check 2: kubectl
echo "2. Checking kubectl..."
if command -v kubectl &> /dev/null; then
    echo "   ✓ kubectl is installed"
    kubectl version --client 2>&1 | head -n 1
else
    echo "   ✗ kubectl not found in PATH"
fi
echo ""

# Check 3: Node.js
echo "3. Checking Node.js..."
if command -v node &> /dev/null; then
    echo "   ✓ Node.js is installed"
    node --version
else
    echo "   ✗ Node.js not found"
fi
echo ""

# Check 4: npm dependencies
echo "4. Checking dependencies..."
if [ -d "node_modules" ]; then
    echo "   ✓ node_modules exists"
    if [ -d "node_modules/react" ]; then
        echo "   ✓ React is installed"
    else
        echo "   ✗ React not found - run 'npm install'"
    fi
else
    echo "   ✗ node_modules missing - run 'npm install'"
fi
echo ""

# Check 5: Build artifacts
echo "5. Checking build artifacts..."
if [ -d ".webpack" ]; then
    echo "   ✓ .webpack directory exists"
else
    echo "   ℹ .webpack directory not found (will be created on first run)"
fi
echo ""

# Check 6: Port availability
echo "6. Checking port 9000..."
if lsof -Pi :9000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "   ⚠ Port 9000 is in use"
    echo "     Process: $(lsof -Pi :9000 -sTCP:LISTEN | tail -n 1)"
    echo "     Run: lsof -ti:9000 | xargs kill -9"
else
    echo "   ✓ Port 9000 is available"
fi
echo ""

# Check 7: Contexts
echo "7. Checking Kubernetes contexts..."
if command -v kubectl &> /dev/null; then
    CONTEXTS=$(kubectl config get-contexts --no-headers 2>/dev/null | wc -l)
    if [ "$CONTEXTS" -gt 0 ]; then
        echo "   ✓ Found $CONTEXTS context(s)"
        echo "   Current context:"
        kubectl config current-context 2>/dev/null || echo "     (none set)"
    else
        echo "   ⚠ No contexts found"
        echo "     The app will show an error (not blank screen)"
    fi
else
    echo "   ⊘ Skipped (kubectl not available)"
fi
echo ""

# Summary
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "If the app shows a blank screen:"
echo "  1. Open DevTools (opens automatically)"
echo "  2. Check Console tab for red errors"
echo "  3. Check Network tab for failed requests"
echo "  4. See TROUBLESHOOTING.md for detailed steps"
echo ""
echo "To start the app:"
echo "  npm start"
echo ""
echo "To run tests:"
echo "  node test-implementation.js"
echo ""
