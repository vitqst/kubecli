# Brainstorm: Multi-Window Architecture for KubeCLI

**Date:** 2025-12-25
**Status:** Agreed
**Priority:** Maximum Isolation

---

## Problem Statement

Current KubeCLI limitation: one window = one kubeconfig at a time. Users want to work with multiple kubeconfigs simultaneously (e.g., prod + staging clusters).

**Options Evaluated:**
1. Spaces/Tabs - single window, multiple workspaces
2. New Windows - separate Tauri windows per config

---

## Decision: New Windows

**Rationale:** User prioritized maximum isolation over simplicity.

### Isolation Benefits

| Aspect | New Windows Advantage |
|--------|----------------------|
| Process crash | Only affects one window |
| Memory leak | Contained to window |
| Kubeconfig env | Each window = own env |
| Terminal sessions | Window owns its terminals |
| State pollution | Impossible by design |
| React context | Fully isolated per window |

### Trade-offs Accepted

- Higher memory (~50-100MB per window)
- No shared state between windows
- Can't compare resources in same view (use OS window tiling)

---

## Agreed Design

### Window Title Format
```
KubeCLI - {context-name} ({config-path})
```
Examples:
- `KubeCLI - prod-cluster (~/.kube/prod.yaml)`
- `KubeCLI` (initial, no config selected)

### New Window Triggers
- Header button: `[+ New Window]` icon
- Menu: File → New Window (Ctrl+Shift+N)

### New Window Behavior
- Opens to **HomeScreen**
- User selects config from home
- Title updates after config selection

---

## Implementation Plan

### 1. Rust Backend (`src-tauri/`)

Add command to spawn new window:

```rust
#[tauri::command]
async fn open_new_window(app: tauri::AppHandle) -> Result<(), String> {
    let label = format!("kubecli-{}", uuid::Uuid::new_v4());

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::default())
        .title("KubeCLI")
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}
```

Register in `lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // existing commands...
    open_new_window,
])
```

### 2. Frontend API (`src/api/`)

Add window API wrapper:

```typescript
// src/api/window.ts
import { invoke } from '@tauri-apps/api/core';

export async function openNewWindow(): Promise<void> {
  await invoke('open_new_window');
}
```

### 3. Dynamic Window Title

Update title when config/context changes:

```typescript
// In renderer.tsx or useEffect hook
import { getCurrentWindow } from '@tauri-apps/api/window';

useEffect(() => {
  const updateTitle = async () => {
    const win = getCurrentWindow();
    if (selectedContext && kubeconfigPath) {
      await win.setTitle(`KubeCLI - ${selectedContext} (${kubeconfigPath})`);
    } else {
      await win.setTitle('KubeCLI');
    }
  };
  updateTitle();
}, [selectedContext, kubeconfigPath]);
```

### 4. Header Button

Add to header/toolbar component:

```tsx
<button onClick={() => openNewWindow()} title="Open New Window">
  <WindowIcon /> {/* or "+ 🪟" */}
</button>
```

### 5. Menu Integration (Optional)

Tauri menu config in `tauri.conf.json` or Rust:

```rust
Menu::with_items(&app, &[
    &Submenu::with_items(&app, "File", true, &[
        &MenuItem::with_id(&app, "new-window", "New Window", true, Some("CmdOrCtrl+Shift+N"))?,
    ])?,
])?;
```

Handle menu event:
```rust
app.on_menu_event(|app, event| {
    if event.id() == "new-window" {
        let _ = open_new_window(app.clone());
    }
});
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src-tauri/src/lib.rs` | Add `open_new_window` command |
| `src-tauri/src/commands.rs` | Implement window spawn logic |
| `src/api/window.ts` | New file - window API wrapper |
| `src/api/index.ts` | Export window API |
| `src/renderer.tsx` | Add dynamic title effect |
| `src/components/Header.tsx` or similar | Add New Window button |
| `src-tauri/Cargo.toml` | Add `uuid` crate if needed |

---

## Success Criteria

- [ ] New window opens via header button
- [ ] New window starts at HomeScreen
- [ ] Each window maintains independent config/context state
- [ ] Window title reflects current context and config path
- [ ] Terminal sessions isolated per window
- [ ] No state leakage between windows

---

## Unresolved Questions

None - all design decisions confirmed.
