# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

KubeCLI is a desktop Tauri application for managing Kubernetes contexts and running kubectl commands with an intuitive UI. It features kubeconfig file switching, context management, namespace selection, a command palette (Ctrl+Shift+P), and an embedded terminal with xterm.js.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Type checking
npx tsc --noEmit

# Build for production
npm run build
```

## Architecture

### Process Model (Tauri)

- **Rust Backend** (`src-tauri/`): Handles PTY terminal, kubeconfig operations via Tauri commands
- **Frontend** (`src/`): React UI with Vite bundler
- **IPC**: Frontend communicates with backend via `@tauri-apps/api` invoke calls

### Key Tauri Commands

Kubernetes operations (`src/api/kube.ts`):
- `get_contexts` - Load kubeconfig summary
- `set_context` - Switch active context
- `set_config` - Switch kubeconfig file
- `get_namespaces` - List namespaces for context

Terminal operations (`src/api/terminal.ts`):
- `terminal_create` - Create PTY session
- `terminal_write` - Send input to PTY
- `terminal_resize` - Resize PTY dimensions
- `terminal_close` - Close PTY session

### Source Structure

```
src/
├── renderer.tsx         # Root React component with screen routing
├── api/                 # Tauri API wrappers
│   ├── index.ts         # API exports
│   ├── kube.ts          # Kubernetes operations
│   └── terminal.ts      # Terminal operations
├── common/
│   └── kubeTypes.ts     # Shared TypeScript interfaces
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
│   ├── sidebar/         # ResourceList, ConfigurationPanel, GlobalSearch, SlimSidebar
│   ├── tabs/            # TabBar, DuplicateTabDialog
│   ├── resource-panel/  # ResourcePanel
│   ├── Terminal.tsx     # xterm.js terminal component
│   └── CommandPalette.tsx  # Ctrl+Shift+P command palette
│
├── hooks/
│   ├── useResourceCache.ts
│   ├── useTabs.ts       # Tab state management
│   └── useBottomPanel.ts  # Bottom panel state management
└── ...

src-tauri/
├── src/
│   ├── main.rs          # Tauri app entry point
│   ├── lib.rs           # Tauri command registration
│   ├── commands.rs      # Tauri command handlers
│   ├── kube.rs          # Kubeconfig parsing, kubectl execution
│   └── terminal.rs      # PTY terminal manager (portable-pty)
├── Cargo.toml           # Rust dependencies
└── tauri.conf.json      # Tauri configuration
```

### Resource System

To add a new Kubernetes resource type:
1. Create `src/resources/<resourcename>.ts` implementing `ResourceDefinition`
2. Import and register in `src/resources/index.ts`

Each resource defines:
- Actions with `getCommand(context, promptValues)` returning kubectl commands
- Optional `prompts` for user input dialogs
- `isFavorite` flag for quick-access buttons vs context menu

## Tech Stack

- Tauri 2.x with Rust backend
- React 19 with TypeScript
- Vite for frontend bundling
- xterm.js + portable-pty for terminal
- YAML library for kubeconfig parsing
