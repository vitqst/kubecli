# Error Reporting Guide

This guide explains how to quickly capture and report errors for faster AI investigation.

## Quick Error Check

Run this to quickly check for errors:

```bash
chmod +x check-errors.sh
./check-errors.sh
```

This will:
- Start the app for 10 seconds
- Capture all output
- Show any errors found
- Indicate if the app started successfully

## Detailed Error Capture

For comprehensive error capture:

```bash
chmod +x debug-renderer.js
node debug-renderer.js
```

This will:
- Start the app
- Capture all console output to files
- Capture all errors to separate files
- Create a summary JSON file
- Save everything to `debug-output/` directory

**Output files:**
- `console-TIMESTAMP.log` - All console output
- `errors-TIMESTAMP.log` - All error messages
- `summary-TIMESTAMP.json` - Summary of the capture

Press `Ctrl+C` when done to save the capture.

## What Gets Captured

### 1. Main Process Output
- Electron startup messages
- IPC handler logs
- Kubernetes operation logs

### 2. Renderer Console Output
All console messages from the browser are forwarded to the terminal with prefixes:
- `[Renderer Console]` - Normal logs
- `[Renderer Console] ⚠️` - Warnings
- `[Renderer Console] ❌` - Errors
- `[Renderer Console] 🐛` - Debug messages

### 3. React Errors
The app includes an ErrorBoundary that catches React errors and displays:
- Error message
- Stack trace
- Component stack
- Copy to clipboard button

### 4. Global Errors
- Uncaught JavaScript errors
- Unhandled promise rejections
- Page load failures
- Renderer crashes

## Error Reporting in the UI

If the app encounters an error, you'll see a red error screen with:

### Error Details Shown:
- **Error Message** - What went wrong
- **Stack Trace** - Where it happened
- **Component Stack** - Which React components were involved

### Actions Available:
- **Reload Application** - Try to recover
- **Copy Error Details** - Copy full error to clipboard

### Console Output:
All errors are also logged to the browser console with detailed information.

## How to Report Errors to AI

### Method 1: Quick Report (Terminal Output)

1. Run the app:
   ```bash
   npm start
   ```

2. Copy the terminal output, especially lines with:
   - `[Renderer Console] ❌` - Renderer errors
   - `Error:` - Any error messages
   - Stack traces

3. Share with AI

### Method 2: Detailed Report (Debug Files)

1. Run debug capture:
   ```bash
   node debug-renderer.js
   ```

2. Let the app run until the error occurs

3. Press `Ctrl+C` to stop

4. Share the files from `debug-output/`:
   - `console-*.log`
   - `errors-*.log`
   - `summary-*.json`

### Method 3: Error Screen (UI Errors)

If you see the red error screen:

1. Click "Copy Error Details"
2. Paste into a file or directly share with AI
3. Include any console output from the terminal

### Method 4: DevTools Console

1. Open DevTools (opens automatically)
2. Go to Console tab
3. Right-click in console
4. Select "Save as..."
5. Share the saved log file

## Common Error Patterns

### Pattern 1: Blank Screen with No Errors
```
✔ Launched Electron app
No typescript errors found
[Renderer] Initializing app...
[Renderer] Root container found, creating React root...
[Renderer] Rendering App component...
[App] Component rendering...
```

**Diagnosis:** App is loading but not displaying
**Next Step:** Check DevTools Console for warnings

### Pattern 2: React Error
```
[Renderer Console] ❌ Error: Cannot read property 'map' of undefined
    at App (renderer.tsx:123)
```

**Diagnosis:** JavaScript error in React component
**Next Step:** Error screen will show full details

### Pattern 3: Preload Bridge Missing
```
[Renderer Console] ❌ TypeError: Cannot read property 'getContexts' of undefined
```

**Diagnosis:** `window.kube` is not available
**Next Step:** Check preload.ts compilation

### Pattern 4: Kubeconfig Error
```
[Main Process] Error: ENOENT: no such file or directory, open '/home/user/.kube/config'
```

**Diagnosis:** Kubeconfig file not found
**Next Step:** Create kubeconfig or set KUBECONFIG env var

### Pattern 5: kubectl Not Found
```
[Main Process] Error: kubectl executable not found
```

**Diagnosis:** kubectl not in PATH
**Next Step:** Install kubectl or add to PATH

## Automated Error Detection

The app now automatically:

1. **Catches React errors** with ErrorBoundary
2. **Forwards console output** from renderer to terminal
3. **Logs all errors** with detailed context
4. **Captures crashes** and reports them
5. **Tracks initialization** with step-by-step logs

## Terminal Output Format

### Normal Startup:
```
✔ Launched Electron app
[Renderer Console] [Renderer] Initializing app...
[Renderer Console] [Renderer] Root container found, creating React root...
[Renderer Console] [Renderer] Rendering App component...
[Renderer Console] [App] Component rendering...
[Renderer Console] [Renderer] App component rendered successfully
No typescript errors found
```

### With Errors:
```
✔ Launched Electron app
[Renderer Console] [Renderer] Initializing app...
[Renderer Console] ❌ [ErrorBoundary] Caught error: TypeError: Cannot read property 'map' of undefined
[Renderer Console] ❌ [ErrorBoundary] Error info: {componentStack: "..."}
```

## Quick Commands Reference

```bash
# Quick error check (10 seconds)
./check-errors.sh

# Detailed capture (manual stop with Ctrl+C)
node debug-renderer.js

# Normal start with console forwarding
npm start

# View latest error log
ls -t debug-output/errors-*.log | head -1 | xargs cat

# View latest console log
ls -t debug-output/console-*.log | head -1 | xargs cat

# Clean up debug output
rm -rf debug-output/
```

## What to Share with AI

For fastest investigation, share:

1. **Terminal output** - Copy/paste from `npm start`
2. **Error logs** - From `debug-output/errors-*.log`
3. **Console logs** - From `debug-output/console-*.log`
4. **Error screen** - Screenshot or copied text
5. **Environment info** - From `./diagnose.sh`

## Example Error Report

```
Environment:
- OS: Linux
- Node: v22.14.0
- kubectl: v1.32.3
- Contexts: 1

Terminal Output:
✔ Launched Electron app
[Renderer Console] ❌ Error: Cannot read property 'map' of undefined
    at App (renderer.tsx:123)
    at ErrorBoundary (ErrorBoundary.tsx:45)

Error Screen:
Error Message: Cannot read property 'map' of undefined
Stack Trace: [full stack trace here]
Component Stack: [component stack here]
```

This format gives AI all the context needed to diagnose the issue quickly.

## Troubleshooting the Error Reporting

If error reporting itself isn't working:

1. **No console output in terminal?**
   - Check that DevTools is opening
   - Verify `src/main.ts` has console-message handler

2. **Error screen not showing?**
   - Check that ErrorBoundary is imported
   - Verify it's wrapping the App component

3. **Debug files not created?**
   - Check `debug-output/` directory exists
   - Verify write permissions

4. **No errors captured but app is blank?**
   - The error might be silent
   - Check DevTools Console manually
   - Look for warnings (⚠️) not just errors (❌)
