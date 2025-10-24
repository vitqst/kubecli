# Tauri Migration Plan

## Why Tauri?

### Size Comparison
- **Electron**: 77MB .deb, ~200MB installed
- **Tauri**: 3-5MB .deb, ~10-15MB installed
- **Savings**: 95% smaller!

### Benefits
- ✅ Much smaller app size
- ✅ Faster startup
- ✅ Lower memory usage
- ✅ Better security (Rust backend)
- ✅ Native system webview
- ✅ Easier .deb packaging

## Architecture

### Frontend (Keep as-is)
- React + TypeScript
- xterm.js for terminal
- Same UI components
- Same styling

### Backend (Migrate to Rust)
- Tauri commands instead of IPC
- Rust for terminal (portable-pty crate)
- Rust for kubectl execution
- Rust for file operations

## Migration Steps

### 1. Project Structure
```
kubecli/
├── src/              # React frontend (existing)
├── src-tauri/        # Rust backend (new)
│   ├── src/
│   │   ├── main.rs
│   │   ├── terminal.rs
│   │   └── kubectl.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
├── package.json
└── vite.config.ts    # Replace webpack
```

### 2. Frontend Changes
- Replace Electron IPC with Tauri invoke
- Remove electron-specific code
- Keep React components
- Use Vite instead of Webpack

### 3. Backend (Rust)
- Terminal: Use `portable-pty` crate
- Kubectl: Use `std::process::Command`
- File ops: Use `std::fs`
- Config: Use `tauri::api::path`

### 4. Build System
- Remove Electron Forge
- Use Tauri CLI
- Native .deb generation
- Cross-platform builds

## Code Mapping

### Electron → Tauri

**IPC Communication:**
```typescript
// Electron (Before)
window.electron.invoke('terminal:create', id, options)

// Tauri (After)
import { invoke } from '@tauri-apps/api/tauri'
invoke('create_terminal', { id, options })
```

**Terminal Backend:**
```rust
// src-tauri/src/terminal.rs
use portable_pty::{native_pty_system, CommandBuilder, PtySize};

#[tauri::command]
async fn create_terminal(id: String, cwd: Option<String>) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    }).map_err(|e| e.to_string())?;
    
    let cmd = CommandBuilder::new("bash");
    let mut child = pair.slave.spawn_command(cmd)
        .map_err(|e| e.to_string())?;
    
    Ok(id)
}
```

**Kubectl Execution:**
```rust
// src-tauri/src/kubectl.rs
use std::process::Command;

#[tauri::command]
async fn run_kubectl(args: Vec<String>, context: String) -> Result<String, String> {
    let output = Command::new("kubectl")
        .args(&args)
        .arg("--context")
        .arg(&context)
        .output()
        .map_err(|e| e.to_string())?;
    
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}
```

## Dependencies

### Remove (Electron)
```json
{
  "electron": "^28.3.3",
  "electron-forge": "*",
  "electron-builder": "*",
  "node-pty": "*"
}
```

### Add (Tauri)
```json
{
  "@tauri-apps/api": "^1.5.0",
  "@tauri-apps/cli": "^1.5.0",
  "vite": "^5.0.0",
  "@vitejs/plugin-react": "^4.2.0"
}
```

### Rust Dependencies (Cargo.toml)
```toml
[dependencies]
tauri = { version = "1.5", features = ["shell-open"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
portable-pty = "0.8"
tokio = { version = "1", features = ["full"] }
```

## Build Commands

### Development
```bash
npm run tauri dev
```

### Production Build
```bash
npm run tauri build
```

### Create .deb
```bash
npm run tauri build -- --target x86_64-unknown-linux-gnu
# Output: src-tauri/target/release/bundle/deb/kubecli_1.0.0_amd64.deb
```

## Timeline

1. **Day 1**: Setup Tauri project structure
2. **Day 2**: Port terminal functionality to Rust
3. **Day 3**: Port kubectl commands to Rust
4. **Day 4**: Migrate React frontend
5. **Day 5**: Testing and debugging
6. **Day 6**: Build and package

## Expected Results

- **App size**: 77MB → 5MB (93% reduction)
- **Startup time**: 2s → 0.5s (75% faster)
- **Memory usage**: 200MB → 50MB (75% less)
- **Build time**: 30s → 10s (66% faster)

## Next Steps

1. Install Tauri CLI: `cargo install tauri-cli`
2. Initialize Tauri: `cargo tauri init`
3. Configure tauri.conf.json
4. Start migration!
