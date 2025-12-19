# KubeCLI

A desktop application for managing Kubernetes contexts and running kubectl commands with an intuitive UI.

## Features

- **Kubeconfig File Switching**: Switch between multiple kubeconfig files
- **Context Management**: View and switch between kubeconfig contexts
- **Namespace Selection**: Quick namespace switching
- **Command Palette**: Ctrl+Shift+P for quick actions
- **Embedded Terminal**: Full PTY terminal with xterm.js
- **Resource Actions**: Quick actions for pods, deployments, services, cronjobs
- **Multi-Resource Tabs**: Open multiple terminals per resource with duplicate tab handling and shortcuts (Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+T, Ctrl+W)
- **Slim Sidebar + Bottom Panel**: Context selector plus resource filter that opens a resizable, searchable panel with inline and context menu actions

## Prerequisites

- **Node.js**: LTS version (18 or 20)
- **Rust**: Latest stable (for Tauri)
- **kubectl**: Installed and accessible in PATH
- **Kubeconfig**: Valid configuration at `~/.kube/config` or `$KUBECONFIG`

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Tech Stack

- Tauri 2.x (Rust backend)
- React 19 + TypeScript
- Vite
- xterm.js + portable-pty

## License

MIT
