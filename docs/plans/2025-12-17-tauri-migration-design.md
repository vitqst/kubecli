# Tauri Migration Design

## Goals

- **Smaller bundle size**: Reduce from ~150MB (Electron) to ~10MB (Tauri)
- **Learn Rust**: Use migration as opportunity to learn Rust through guided implementation

## Approach

- Fresh start with new Tauri project, using Electron code as reference
- Keep React frontend (reuse existing components)
- Rust backend handles all system operations (kubeconfig, kubectl, terminal)

## Project Structure

```
kubecli-tauri/
├── src-tauri/                 # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs            # Tauri entry point
│       ├── lib.rs             # Module exports
│       ├── kube.rs            # Kubeconfig parsing, kubectl execution
│       ├── terminal.rs        # PTY management with portable-pty
│       └── commands.rs        # Tauri command handlers
│
├── src/                       # React frontend (mostly reused)
│   ├── components/            # Existing components
│   ├── contexts/              # Existing contexts
│   ├── hooks/                 # Existing hooks
│   ├── resources/             # Resource definitions
│   └── renderer.tsx           # Entry point
│
├── package.json               # React deps only (no Electron)
└── index.html                 # Tauri entry HTML
```

## Rust Backend - Tauri Commands

### Kubeconfig Operations

```rust
#[tauri::command]
fn get_contexts(config_path: Option<String>) -> Result<KubeConfigSummary, String>

#[tauri::command]
fn set_context(config_path: String, context_name: String) -> Result<(), String>

#[tauri::command]
fn set_namespace(config_path: String, context: String, namespace: String) -> Result<(), String>

#[tauri::command]
fn run_kubectl(args: Vec<String>, config_path: Option<String>) -> Result<String, String>
```

### Terminal Operations

```rust
#[tauri::command]
fn terminal_create(app: AppHandle, shell: Option<String>) -> Result<String, String>

#[tauri::command]
fn terminal_write(terminal_id: String, data: String) -> Result<(), String>

#[tauri::command]
fn terminal_resize(terminal_id: String, cols: u16, rows: u16) -> Result<(), String>

#[tauri::command]
fn terminal_close(terminal_id: String) -> Result<(), String>
```

## Terminal Implementation

Uses `portable-pty` crate for native PTY support (zsh, colors, job control).

**Data flow:**
1. Frontend calls `terminal_create` → Rust spawns PTY with zsh
2. Rust spawns background thread reading PTY output
3. Output sent to frontend via Tauri events: `app.emit("terminal:data", payload)`
4. Frontend writes keystrokes via `terminal_write` command
5. xterm.js renders everything

**Frontend event listener:**
```typescript
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  const unlisten = listen('terminal:data', (event) => {
    const { terminalId, data } = event.payload;
    terminal.write(data);
  });
  return () => { unlisten.then(fn => fn()); };
}, []);
```

## Kubeconfig & kubectl

**Kubeconfig parsing:**
- Use `serde_yaml` to parse kubeconfig files
- Return `KubeConfigSummary` struct matching existing TypeScript interface

**kubectl execution:**
- Use `std::process::Command` to spawn kubectl
- Set `KUBECONFIG` environment variable when custom path provided
- Return stdout as string

**Caching:**
- Stays in React (`ResourceCacheContext.tsx`)
- Rust backend is stateless for kubectl operations

## Frontend Changes

1. **Remove Electron deps**: Delete `preload.ts`, `global.d.ts`, Electron-specific code
2. **Create Tauri API wrapper**: Replace `window.kube` / `window.terminal` with invoke calls
3. **Update Terminal.tsx**: Switch from IPC to Tauri events
4. **Keep everything else**: Components, contexts, hooks, resources unchanged

**API wrapper example:**
```typescript
import { invoke } from '@tauri-apps/api/core';

export const kube = {
  getContexts: (configPath?: string) =>
    invoke<KubeConfigSummary>('get_contexts', { configPath }),
  setContext: (configPath: string, contextName: string) =>
    invoke('set_context', { configPath, contextName }),
};
```

## Dependencies

**Rust (Cargo.toml):**
```toml
[dependencies]
tauri = { version = "2", features = ["shell-open"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde_yaml = "0.9"
portable-pty = "0.8"
```

**Frontend (package.json):**
- Keep: react, react-dom, xterm, xterm-addon-fit, yaml
- Remove: electron, electron-forge, node-pty, all Electron-related deps
- Add: @tauri-apps/api, @tauri-apps/cli

## Dev Workflow

```bash
npm run tauri dev    # Hot-reload frontend + rebuilds Rust on changes
npm run tauri build  # Production build (~10MB)
```

## Features for v1

All existing features:
- Kubeconfig management (parse, switch contexts, namespaces)
- Resource browsing (pods, deployments, services, cronjobs with caching)
- Command execution (kubectl commands with output)
- Embedded terminal (full PTY with zsh support)
- Command palette (Ctrl+Shift+P fuzzy search)
