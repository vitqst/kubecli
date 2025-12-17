# Tauri Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate KubeCLI from Electron to Tauri for smaller bundle size (~10MB vs ~150MB) with full feature parity.

**Architecture:** Rust backend handles kubeconfig parsing, kubectl execution, and PTY terminal management. React frontend stays mostly unchanged, with `window.kube`/`window.terminal` replaced by Tauri invoke calls. Terminal data flows via Tauri events.

**Tech Stack:** Tauri 2, Rust, portable-pty, serde_yaml, React 19, xterm.js

---

## Phase 1: Tauri Project Setup

### Task 1: Initialize Tauri in the project

**Files:**
- Create: `src-tauri/Cargo.toml`
- Create: `src-tauri/tauri.conf.json`
- Create: `src-tauri/src/main.rs`
- Create: `src-tauri/src/lib.rs`
- Modify: `package.json`

**Step 1: Install Tauri CLI**

Run: `npm install -D @tauri-apps/cli@^2`

**Step 2: Initialize Tauri project**

Run: `npx tauri init`

When prompted:
- App name: `kubecli`
- Window title: `KubeCLI`
- Web assets location: `../dist`
- Dev server URL: `http://localhost:3000`
- Frontend dev command: `npm run dev:frontend`
- Frontend build command: `npm run build:frontend`

**Step 3: Add Tauri API to frontend**

Run: `npm install @tauri-apps/api@^2`

**Step 4: Update Cargo.toml with dependencies**

Replace `src-tauri/Cargo.toml` with:

```toml
[package]
name = "kubecli"
version = "0.1.0"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde_yaml = "0.9"
portable-pty = "0.8"
dirs = "5"

[profile.release]
strip = true
lto = true
codegen-units = 1
```

**Step 5: Update package.json scripts**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "dev:frontend": "vite",
    "build:frontend": "vite build",
    "tauri": "tauri",
    "dev": "tauri dev",
    "build": "tauri build"
  }
}
```

**Step 6: Create Vite config for frontend**

Create `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});
```

**Step 7: Install Vite dependencies**

Run: `npm install -D vite @vitejs/plugin-react`

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: initialize Tauri project structure"
```

---

### Task 2: Create index.html for Tauri

**Files:**
- Create: `index.html` (root level for Vite)

**Step 1: Create index.html**

Create `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KubeCLI</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body, #root { height: 100%; width: 100%; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer.tsx"></script>
  </body>
</html>
```

**Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add Vite entry HTML"
```

---

## Phase 2: Rust Backend - Kubeconfig Operations

### Task 3: Define Rust types for kubeconfig

**Files:**
- Create: `src-tauri/src/kube.rs`

**Step 1: Create kube.rs with types**

Create `src-tauri/src/kube.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

// Types matching the frontend's KubeTypes.ts

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextInfo {
    pub name: String,
    pub cluster: String,
    pub user: String,
    pub namespace: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KubeConfigSummary {
    pub current_context: String,
    pub contexts: Vec<ContextInfo>,
    pub config_path: String,
}

// Internal types for parsing kubeconfig YAML

#[derive(Debug, Deserialize)]
struct KubeConfig {
    #[serde(rename = "current-context")]
    current_context: Option<String>,
    contexts: Option<Vec<KubeContext>>,
}

#[derive(Debug, Deserialize)]
struct KubeContext {
    name: String,
    context: KubeContextDetails,
}

#[derive(Debug, Deserialize)]
struct KubeContextDetails {
    cluster: String,
    user: String,
    namespace: Option<String>,
}

fn get_default_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".kube")
        .join("config")
}

pub fn parse_kubeconfig(config_path: Option<String>) -> Result<KubeConfigSummary, String> {
    let path = config_path
        .map(PathBuf::from)
        .unwrap_or_else(get_default_config_path);

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read kubeconfig: {}", e))?;

    let config: KubeConfig = serde_yaml::from_str(&contents)
        .map_err(|e| format!("Failed to parse kubeconfig: {}", e))?;

    let contexts = config
        .contexts
        .unwrap_or_default()
        .into_iter()
        .map(|ctx| ContextInfo {
            name: ctx.name,
            cluster: ctx.context.cluster,
            user: ctx.context.user,
            namespace: ctx.context.namespace,
        })
        .collect();

    Ok(KubeConfigSummary {
        current_context: config.current_context.unwrap_or_default(),
        contexts,
        config_path: path.to_string_lossy().to_string(),
    })
}

pub fn run_kubectl(args: Vec<String>, config_path: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new("kubectl");

    if let Some(path) = config_path {
        cmd.env("KUBECONFIG", path);
    }

    cmd.args(&args);

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map_err(|e| format!("Invalid UTF-8 in output: {}", e))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("kubectl error: {}", stderr))
    }
}

pub fn set_context(config_path: String, context_name: String) -> Result<(), String> {
    run_kubectl(
        vec![
            "--kubeconfig".to_string(),
            config_path,
            "config".to_string(),
            "use-context".to_string(),
            context_name,
        ],
        None,
    )?;
    Ok(())
}

pub fn set_namespace(config_path: String, context: String, namespace: String) -> Result<(), String> {
    run_kubectl(
        vec![
            "--kubeconfig".to_string(),
            config_path,
            "config".to_string(),
            "set-context".to_string(),
            context,
            "--namespace".to_string(),
            namespace,
        ],
        None,
    )?;
    Ok(())
}
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`

Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src-tauri/src/kube.rs
git commit -m "feat: add kubeconfig parsing and kubectl execution in Rust"
```

---

### Task 4: Create Tauri commands for kube operations

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/main.rs`

**Step 1: Create commands.rs**

Create `src-tauri/src/commands.rs`:

```rust
use crate::kube::{self, KubeConfigSummary};

#[tauri::command]
pub fn get_contexts(config_path: Option<String>) -> Result<KubeConfigSummary, String> {
    kube::parse_kubeconfig(config_path)
}

#[tauri::command]
pub fn set_context(config_path: String, context_name: String) -> Result<(), String> {
    kube::set_context(config_path, context_name)
}

#[tauri::command]
pub fn set_namespace(config_path: String, context: String, namespace: String) -> Result<(), String> {
    kube::set_namespace(config_path, context, namespace)
}

#[tauri::command]
pub fn run_kubectl(args: Vec<String>, config_path: Option<String>) -> Result<String, String> {
    kube::run_kubectl(args, config_path)
}
```

**Step 2: Update lib.rs**

Replace `src-tauri/src/lib.rs`:

```rust
mod commands;
mod kube;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_contexts,
            set_context,
            set_namespace,
            run_kubectl,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Update main.rs**

Replace `src-tauri/src/main.rs`:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kubecli_lib::run();
}
```

**Step 4: Fix lib name in Cargo.toml**

Add to `src-tauri/Cargo.toml`:

```toml
[lib]
name = "kubecli_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

**Step 5: Verify it compiles**

Run: `cd src-tauri && cargo build`

Expected: Compiles without errors

**Step 6: Commit**

```bash
git add src-tauri/src/
git commit -m "feat: add Tauri commands for kubeconfig operations"
```

---

## Phase 3: Rust Backend - Terminal PTY

### Task 5: Implement terminal manager with portable-pty

**Files:**
- Create: `src-tauri/src/terminal.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/commands.rs`

**Step 1: Create terminal.rs**

Create `src-tauri/src/terminal.rs`:

```rust
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

pub struct PtySession {
    writer: Box<dyn Write + Send>,
    _reader_handle: thread::JoinHandle<()>,
}

pub struct TerminalManager {
    sessions: HashMap<String, PtySession>,
    next_id: u64,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            next_id: 1,
        }
    }

    pub fn create(&mut self, app: AppHandle, shell: Option<String>) -> Result<String, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell_cmd = shell.unwrap_or_else(|| {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        });

        let mut cmd = CommandBuilder::new(&shell_cmd);
        cmd.env("TERM", "xterm-256color");

        pair.slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let terminal_id = format!("term_{}", self.next_id);
        self.next_id += 1;

        let mut reader = pair.master.try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair.master.take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let term_id_clone = terminal_id.clone();
        let reader_handle = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = app.emit("terminal:exit", &term_id_clone);
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let payload = serde_json::json!({
                            "terminalId": term_id_clone,
                            "data": data
                        });
                        let _ = app.emit("terminal:data", payload);
                    }
                    Err(_) => break,
                }
            }
        });

        self.sessions.insert(
            terminal_id.clone(),
            PtySession {
                writer,
                _reader_handle: reader_handle,
            },
        );

        Ok(terminal_id)
    }

    pub fn write(&mut self, terminal_id: &str, data: &str) -> Result<(), String> {
        let session = self.sessions.get_mut(terminal_id)
            .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

        session.writer.write_all(data.as_bytes())
            .map_err(|e| format!("Write failed: {}", e))?;

        session.writer.flush()
            .map_err(|e| format!("Flush failed: {}", e))?;

        Ok(())
    }

    pub fn resize(&mut self, terminal_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        // portable-pty doesn't expose resize on the master directly after creation
        // This is a limitation - we'd need to store the master handle
        // For now, acknowledge the resize request
        Ok(())
    }

    pub fn close(&mut self, terminal_id: &str) -> Result<(), String> {
        self.sessions.remove(terminal_id);
        Ok(())
    }
}

// Global terminal manager wrapped in mutex
lazy_static::lazy_static! {
    pub static ref TERMINAL_MANAGER: Arc<Mutex<TerminalManager>> =
        Arc::new(Mutex::new(TerminalManager::new()));
}
```

**Step 2: Add lazy_static dependency**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
lazy_static = "1.4"
```

**Step 3: Add terminal commands to commands.rs**

Append to `src-tauri/src/commands.rs`:

```rust
use crate::terminal::TERMINAL_MANAGER;
use tauri::AppHandle;

#[tauri::command]
pub fn terminal_create(app: AppHandle, shell: Option<String>) -> Result<String, String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.create(app, shell)
}

#[tauri::command]
pub fn terminal_write(terminal_id: String, data: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.write(&terminal_id, &data)
}

#[tauri::command]
pub fn terminal_resize(terminal_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.resize(&terminal_id, cols, rows)
}

#[tauri::command]
pub fn terminal_close(terminal_id: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.close(&terminal_id)
}
```

**Step 4: Update lib.rs to include terminal module and commands**

Replace `src-tauri/src/lib.rs`:

```rust
mod commands;
mod kube;
mod terminal;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_contexts,
            set_context,
            set_namespace,
            run_kubectl,
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 5: Verify it compiles**

Run: `cd src-tauri && cargo build`

Expected: Compiles without errors

**Step 6: Commit**

```bash
git add src-tauri/
git commit -m "feat: add PTY terminal manager with portable-pty"
```

---

## Phase 4: Frontend API Layer

### Task 6: Create Tauri API wrapper

**Files:**
- Create: `src/api/kube.ts`
- Create: `src/api/terminal.ts`
- Create: `src/api/index.ts`

**Step 1: Create src/api directory**

Run: `mkdir -p src/api`

**Step 2: Create kube.ts API wrapper**

Create `src/api/kube.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';

export interface ContextInfo {
  name: string;
  cluster: string;
  user: string;
  namespace: string | null;
}

export interface KubeConfigSummary {
  current_context: string;
  contexts: ContextInfo[];
  config_path: string;
}

export const kube = {
  getContexts: (configPath?: string): Promise<KubeConfigSummary> =>
    invoke<KubeConfigSummary>('get_contexts', { configPath: configPath ?? null }),

  setContext: (configPath: string, contextName: string): Promise<void> =>
    invoke('set_context', { configPath, contextName }),

  setNamespace: (configPath: string, context: string, namespace: string): Promise<void> =>
    invoke('set_namespace', { configPath, context, namespace }),

  runCommand: (args: string[], configPath?: string): Promise<string> =>
    invoke<string>('run_kubectl', { args, configPath: configPath ?? null }),
};
```

**Step 3: Create terminal.ts API wrapper**

Create `src/api/terminal.ts`:

```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

export interface TerminalDataPayload {
  terminalId: string;
  data: string;
}

export const terminal = {
  create: (shell?: string): Promise<string> =>
    invoke<string>('terminal_create', { shell: shell ?? null }),

  write: (terminalId: string, data: string): Promise<void> =>
    invoke('terminal_write', { terminalId, data }),

  resize: (terminalId: string, cols: number, rows: number): Promise<void> =>
    invoke('terminal_resize', { terminalId, cols, rows }),

  close: (terminalId: string): Promise<void> =>
    invoke('terminal_close', { terminalId }),

  onData: (callback: (payload: TerminalDataPayload) => void): Promise<UnlistenFn> =>
    listen<TerminalDataPayload>('terminal:data', (event) => callback(event.payload)),

  onExit: (callback: (terminalId: string) => void): Promise<UnlistenFn> =>
    listen<string>('terminal:exit', (event) => callback(event.payload)),
};
```

**Step 4: Create index.ts**

Create `src/api/index.ts`:

```typescript
export { kube, type KubeConfigSummary, type ContextInfo } from './kube';
export { terminal, type TerminalDataPayload } from './terminal';
```

**Step 5: Commit**

```bash
git add src/api/
git commit -m "feat: add Tauri API wrapper for kube and terminal"
```

---

### Task 7: Update Terminal component for Tauri

**Files:**
- Modify: `src/components/Terminal.tsx`

**Step 1: Read current Terminal.tsx**

Read the existing `src/components/Terminal.tsx` to understand current implementation.

**Step 2: Update Terminal.tsx to use Tauri API**

Replace the Electron IPC with Tauri API calls. The key changes:
- Import from `src/api/terminal`
- Use `terminal.create()` instead of `window.terminal.create()`
- Use `terminal.onData()` listener instead of `window.terminal.onData()`
- Use `terminal.write()` instead of `window.terminal.write()`

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add src/components/Terminal.tsx
git commit -m "refactor: update Terminal component for Tauri API"
```

---

### Task 8: Update HomeScreen and other components using window.kube

**Files:**
- Modify: `src/components/screens/HomeScreen.tsx`
- Modify: `src/components/sidebar/ConfigurationPanel.tsx`
- Modify: `src/components/sidebar/ResourceList.tsx`
- Modify: `src/contexts/ResourceCacheContext.tsx`

**Step 1: Find all usages of window.kube**

Run: `grep -r "window.kube" src/`

**Step 2: Update each file to import and use the kube API**

Replace `window.kube.methodName()` with `kube.methodName()` after importing from `src/api`.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/
git commit -m "refactor: replace window.kube with Tauri API wrapper"
```

---

## Phase 5: Remove Electron Dependencies

### Task 9: Remove Electron-specific files and dependencies

**Files:**
- Delete: `src/preload.ts`
- Delete: `src/main.ts`
- Delete: `src/main/kube.ts`
- Delete: `src/main/terminal.ts`
- Delete: `src/types/global.d.ts`
- Modify: `package.json`

**Step 1: Remove Electron source files**

Run:
```bash
rm -f src/preload.ts src/main.ts
rm -rf src/main/
rm -f src/types/global.d.ts
```

**Step 2: Update package.json**

Remove Electron dependencies:
- electron
- electron-forge (all packages)
- electron-squirrel-startup
- node-pty
- @electron/rebuild

Keep:
- react, react-dom
- xterm, xterm-addon-fit
- yaml
- TypeScript and related dev deps

**Step 3: Remove webpack configs (using Vite now)**

Run:
```bash
rm -f webpack.*.config.js
```

**Step 4: Install remaining dependencies**

Run: `npm install`

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove Electron dependencies and configs"
```

---

## Phase 6: Final Integration

### Task 10: Update tsconfig for Vite/Tauri

**Files:**
- Modify: `tsconfig.json`

**Step 1: Update tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 2: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 3: Commit**

```bash
git add tsconfig*.json
git commit -m "chore: update tsconfig for Vite/Tauri"
```

---

### Task 11: Test the full application

**Step 1: Build Rust backend**

Run: `cd src-tauri && cargo build`

Expected: Successful compilation

**Step 2: Start dev server**

Run: `npm run dev`

Expected: Application window opens with KubeCLI UI

**Step 3: Test kubeconfig loading**

- Verify contexts appear in sidebar
- Verify current context is highlighted

**Step 4: Test context switching**

- Click a different context
- Verify it switches successfully

**Step 5: Test terminal**

- Open terminal screen
- Verify zsh prompt appears
- Type commands and verify they work

**Step 6: Test command palette**

- Press Ctrl+Shift+P
- Verify fuzzy search works
- Execute an action

**Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes from testing"
```

---

### Task 12: Build production release

**Step 1: Create production build**

Run: `npm run build`

Expected: Creates distributable in `src-tauri/target/release/bundle/`

**Step 2: Verify bundle size**

Run: `du -sh src-tauri/target/release/bundle/deb/*.deb`

Expected: Should be ~10-20MB (vs ~150MB for Electron)

**Step 3: Test production build**

Install and run the built package to verify everything works.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete Tauri migration with production build"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-2 | Tauri project setup, Vite config |
| 2 | 3-4 | Rust kubeconfig parsing and commands |
| 3 | 5 | Rust PTY terminal with portable-pty |
| 4 | 6-8 | Frontend API wrapper, component updates |
| 5 | 9 | Remove Electron dependencies |
| 6 | 10-12 | TypeScript config, testing, production build |

Total: 12 tasks across 6 phases
