#!/bin/bash

# Quick error checker - runs the app briefly and captures any errors
#
# Usage:
#   ./check-errors.sh           # Default: 20 seconds
#   ./check-errors.sh 30        # Custom: 30 seconds
#   ./check-errors.sh 60        # Custom: 60 seconds

# Exit immediately on error
set -e

# Get timeout from argument or use default
TIMEOUT=${1:-20}
WAIT_TIME=$((TIMEOUT - 12))

echo "🔍 Quick Error Check (Crash on Error Mode)"
echo "==========================================="
echo ""
echo "Starting app for ${TIMEOUT} seconds to check for errors..."
echo "⚠️  Will crash immediately if errors are detected!"
echo ""

# Create temp file for output
TEMP_LOG=$(mktemp)

# Start app in background and capture output
timeout $TIMEOUT npm start > "$TEMP_LOG" 2>&1 &
PID=$!

# Function to check for errors and crash if found
check_for_errors() {
    local log_file=$1
    
    # Check for common error patterns (excluding known Electron internal errors)
    if grep -i "error" "$log_file" | grep -v "No typescript errors" | grep -v "error TS" | grep -v "__dirname is not defined" | grep -v "Security Warning" | grep -v "devtools://devtools" | grep -v "Failed to fetch" > /dev/null; then
        echo ""
        echo "❌ FATAL: ERRORS DETECTED!"
        echo "=========================="
        echo ""
        grep -i "error" "$log_file" | grep -v "No typescript errors" | grep -v "error TS" | grep -v "__dirname is not defined" | grep -v "Security Warning" | grep -v "devtools://devtools" | grep -v "Failed to fetch" | head -20
        echo ""
        echo "Full log: $log_file"
        kill $PID 2>/dev/null || true
        exit 1
    fi
    
    # Check for renderer console errors (excluding known warnings)
    if grep -i "\[Renderer Console\].*❌" "$log_file" | grep -v "Security Warning" | grep -v "__dirname" > /dev/null; then
        echo ""
        echo "❌ FATAL: RENDERER ERRORS DETECTED!"
        echo "===================================="
        echo ""
        grep -i "\[Renderer Console\].*❌" "$log_file" | grep -v "Security Warning" | grep -v "__dirname" | head -20
        echo ""
        echo "Full log: $log_file"
        kill $PID 2>/dev/null || true
        exit 1
    fi
}

# Monitor for errors in real-time
echo "🔍 Monitoring for errors (checking every 2 seconds)..."
echo ""

ELAPSED=0
CHECK_INTERVAL=2

while [ $ELAPSED -lt $WAIT_TIME ]; do
    sleep $CHECK_INTERVAL
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
    
    # Check if process is still running
    if ! kill -0 $PID 2>/dev/null; then
        echo "⚠️  App process terminated unexpectedly!"
        check_for_errors "$TEMP_LOG"
        echo ""
        echo "Full log: $TEMP_LOG"
        exit 1
    fi
    
    # Check for errors in real-time
    check_for_errors "$TEMP_LOG"
    
    echo -ne "\r⏱️  Elapsed: ${ELAPSED}s / ${WAIT_TIME}s - No errors detected yet..."
done

echo ""
echo ""
echo "📊 Final check for errors..."
echo ""

HAS_ERRORS=0

# Check for common error patterns (excluding known Electron internal errors)
if grep -i "error" "$TEMP_LOG" | grep -v "No typescript errors" | grep -v "error TS" | grep -v "__dirname is not defined" | grep -v "Security Warning" | grep -v "devtools://devtools" | grep -v "Failed to fetch" > /dev/null; then
    echo "❌ ERRORS FOUND:"
    echo ""
    grep -i "error" "$TEMP_LOG" | grep -v "No typescript errors" | grep -v "error TS" | grep -v "__dirname is not defined" | grep -v "Security Warning" | grep -v "devtools://devtools" | grep -v "Failed to fetch" | head -20
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
