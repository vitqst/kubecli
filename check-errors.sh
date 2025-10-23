#!/bin/bash

# Quick error checker - runs the app briefly and captures any errors

echo "🔍 Quick Error Check"
echo "===================="
echo ""
echo "Starting app for 10 seconds to check for errors..."
echo ""

# Create temp file for output
TEMP_LOG=$(mktemp)

# Start app in background and capture output
timeout 10 npm start > "$TEMP_LOG" 2>&1 &
PID=$!

# Wait for app to start
sleep 8

# Check for errors
echo "📊 Checking for errors..."
echo ""

HAS_ERRORS=0

# Check for common error patterns (excluding known Electron internal errors)
if grep -i "error" "$TEMP_LOG" | grep -v "No typescript errors" | grep -v "error TS" | grep -v "__dirname is not defined" | grep -v "Security Warning" > /dev/null; then
    echo "❌ ERRORS FOUND:"
    echo ""
    grep -i "error" "$TEMP_LOG" | grep -v "No typescript errors" | grep -v "error TS" | grep -v "__dirname is not defined" | grep -v "Security Warning" | head -20
    echo ""
    HAS_ERRORS=1
fi

# Check for renderer console errors (excluding known warnings)
if grep -i "\[Renderer Console\].*❌" "$TEMP_LOG" | grep -v "Security Warning" | grep -v "__dirname" > /dev/null; then
    echo "❌ RENDERER ERRORS:"
    echo ""
    grep -i "\[Renderer Console\].*❌" "$TEMP_LOG" | grep -v "Security Warning" | grep -v "__dirname" | head -20
    echo ""
    HAS_ERRORS=1
fi

# Check for warnings
if grep -i "warning" "$TEMP_LOG" | grep -v "Type-checking" > /dev/null; then
    echo "⚠️  WARNINGS:"
    echo ""
    grep -i "warning" "$TEMP_LOG" | grep -v "Type-checking" | head -10
    echo ""
fi

# Check for successful startup
if grep -i "Launched Electron app" "$TEMP_LOG" > /dev/null; then
    echo "✅ App launched successfully"
fi

if grep -i "No typescript errors found" "$TEMP_LOG" > /dev/null; then
    echo "✅ TypeScript compiled successfully"
fi

if grep -i "\[Renderer\] App component rendered successfully" "$TEMP_LOG" > /dev/null; then
    echo "✅ React app rendered successfully"
fi

if grep -i "\[App\] Component rendering" "$TEMP_LOG" > /dev/null; then
    echo "✅ App component is rendering"
fi

echo ""
echo "===================="

# Kill the app
kill $PID 2>/dev/null
wait $PID 2>/dev/null

# Show full log location
echo ""
echo "Full output saved to: $TEMP_LOG"
echo ""

if [ $HAS_ERRORS -eq 0 ]; then
    echo "✅ No errors detected!"
    echo ""
    echo "If you still see a blank screen:"
    echo "  1. Run: npm start"
    echo "  2. Open DevTools (opens automatically)"
    echo "  3. Check Console tab for errors"
    echo "  4. Run: ./debug-renderer.js for detailed capture"
else
    echo "❌ Errors detected! See above for details."
    echo ""
    echo "To see full output:"
    echo "  cat $TEMP_LOG"
    echo ""
    echo "To capture more details:"
    echo "  ./debug-renderer.js"
fi

echo ""

exit $HAS_ERRORS
