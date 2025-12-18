# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KubeCLI is a desktop Electron application for managing Kubernetes contexts and running kubectl commands with an intuitive UI. It features kubeconfig file switching, context management, namespace selection, a command palette (Ctrl+Shift+P), and an embedded terminal with xterm.js.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server with hot reload
make dev    # or: npm start

# Type checking
make typecheck    # or: npx tsc --noEmit

# Package for distribution
npm run package

# Create installers
npm run make

# Clean build artifacts
make clean
```

## Architecture

### Process Model (Electron)

- **Main Process** (`src/main.ts`): Manages window lifecycle and registers IPC handlers for kubernetes and terminal operations
- **Preload Bridge** (`src/preload.ts`): Exposes `window.kube` and `window.terminal` APIs to renderer via contextBridge
- **Renderer Process** (`src/renderer.tsx`): React UI with hooks for state management

### Key IPC Channels

Kubernetes operations (`window.kube`):
- `kube:get-contexts` - Load kubeconfig summary
- `kube:set-context` - Switch active context
- `kube:set-config` - Switch kubeconfig file
- `kube:run-command` - Execute kubectl commands

Terminal operations (`window.terminal`):
- `terminal:create/write/resize/close` - PTY management via node-pty
- `terminal:data/exit/edit-mode` - Events from main to renderer

### Source Structure

```
src/
├── main.ts              # Electron main process, IPC handlers
├── preload.ts           # Secure IPC bridge (window.kube, window.terminal)
├── renderer.tsx         # Root React component with screen routing
├── main/
│   ├── kube.ts          # Kubeconfig parsing, kubectl execution
│   └── terminal.ts      # PTY terminal manager (node-pty)
├── common/
│   ├── kubeTypes.ts     # Shared TypeScript interfaces
│   └── resourceActions.ts
├── resources/           # Resource action definitions
│   ├── types.ts         # ResourceDefinition, ResourceAction interfaces
│   ├── index.ts         # Resource registry
│   ├── pod.ts           # Pod-specific actions
│   ├── deployment.ts    # Deployment actions
│   ├── cronjob.ts       # CronJob actions
│   └── service.ts       # Service actions
├── contexts/
│   ├── ResourceCacheContext.tsx  # Kubernetes resource caching
│   └── ErrorContext.tsx          # Global error handling
├── components/
│   ├── screens/         # HomeScreen, TerminalScreen
│   ├── sidebar/         # ResourceList, ConfigurationPanel, GlobalSearch
│   ├── Terminal.tsx     # xterm.js terminal component
│   └── CommandPalette.tsx  # Ctrl+Shift+P command palette
└── hooks/
    └── useResourceCache.ts
```

### Resource System

To add a new Kubernetes resource type:
1. Create `src/resources/<resourcename>.ts` implementing `ResourceDefinition`
2. Import and register in `src/resources/index.ts`

Each resource defines:
- Actions with `getCommand(context, promptValues)` returning kubectl commands
- Optional `prompts` for user input dialogs
- `isFavorite` flag for quick-access buttons vs context menu

### Caching Strategy

`ResourceCacheContext` implements per-resource-type caching:
- Pods/Jobs: 1 hour TTL (frequently changing)
- Deployments/Services/CronJobs: Never expire (stable)
- Cache key: `${kubeconfigPath}::${context}::${resourceType}`

## Tech Stack

- Electron 28 with Webpack
- React 19 with TypeScript (strict mode)
- xterm.js + node-pty for terminal
- YAML library for kubeconfig parsing
