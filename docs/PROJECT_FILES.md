# Project Files Overview

## Essential Files

### Documentation
- **`README.md`** - Main project documentation, start here
- **`AGENTS.md`** - Guide for AI coding agents
- **`docs/README.md`** - Documentation index
- **`docs/PROJECT_FILES.md`** - This file
- **`docs/troubleshooting/ERROR_REPORTING.md`** - How to report and debug errors
- **`docs/troubleshooting/BLANK_SCREEN_FIXED.md`** - Solution for blank screen issue
- **`docs/ai/use_case_001.md`** - Use case specification
- **`docs/ai/use_case_001_verification.md`** - Verification checklist

### Tools & Scripts
- **`check-errors.sh`** - Quick error check (10 seconds)
- **`diagnose.sh`** - Environment diagnostics
- **`test-implementation.js`** - Automated integration tests

### Configuration
- **`package.json`** - Dependencies and build configuration
- **`tsconfig.json`** - TypeScript configuration
- **`webpack.main.config.js`** - Main process webpack config
- **`webpack.renderer.config.js`** - Renderer process webpack config
- **`webpack.preload.config.js`** - Preload script webpack config
- **`webpack.rules.js`** - Webpack rules for main process
- **`webpack.rules.renderer.js`** - Webpack rules for renderer (no asset relocator)
- **`webpack.plugins.js`** - Webpack plugins

### Source Code
```
src/
├── main.ts                    # Electron main process
├── renderer.tsx               # React UI application
├── preload.ts                 # IPC bridge
├── index.html                 # HTML template
├── main/
│   └── kube.ts               # Kubernetes operations
├── common/
│   └── kubeTypes.ts          # Shared TypeScript types
├── types/
│   └── global.d.ts           # Global type declarations
└── components/
    └── ErrorBoundary.tsx     # React error boundary
```

## Quick Start

### First Time Setup
```bash
npm install
```

### Development
```bash
npm start
```

### Testing
```bash
# Quick check
./check-errors.sh

# Full tests
node test-implementation.js

# Environment check
./diagnose.sh
```

### Building
```bash
# Package
npm run package

# Create installers
npm run make
```

## File Purpose

### Why Two Webpack Rule Files?

- **`webpack.rules.js`** - For main process (Node.js environment)
  - Includes asset relocator loader
  - Handles native modules
  
- **`webpack.rules.renderer.js`** - For renderer/preload (browser environment)
  - NO asset relocator (causes `__dirname` errors)
  - Pure browser-compatible loaders

This separation fixes the blank screen issue caused by `__dirname` being undefined in the browser.

## Removed Files

These files were removed as they were redundant or temporary:

- `BLANK_SCREEN_FIX.md` - Superseded by `BLANK_SCREEN_FIXED.md`
- `ERROR_CAPTURE_SUMMARY.md` - Redundant with `ERROR_REPORTING.md`
- `IMPLEMENTATION_COMPLETE.md` - Temporary status document
- `QUICK_START_ERROR_DEBUGGING.md` - Consolidated into `ERROR_REPORTING.md`
- `TEST_RESULTS.md` - One-time test results
- `TROUBLESHOOTING.md` - Consolidated into `ERROR_REPORTING.md`
- `debug-renderer.js` - Advanced debugging tool (not needed for normal use)

## Getting Help

1. **Read the README** - `README.md`
2. **Check documentation index** - `docs/README.md`
3. **Check for errors** - `./check-errors.sh`
4. **Run diagnostics** - `./diagnose.sh`
5. **See error guide** - `docs/troubleshooting/ERROR_REPORTING.md`
6. **Check blank screen fix** - `docs/troubleshooting/BLANK_SCREEN_FIXED.md`
