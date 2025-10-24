# Refactoring Phase 3 - Terminal.tsx Analysis

## Current Structure (519 lines)

### Responsibilities Identified

1. **Terminal Initialization** (~100 lines)
   - Create XTerm instance
   - Setup FitAddon
   - Configure terminal options
   - Handle data/exit events
   - Initial resize

2. **Environment Management** (~80 lines)
   - Handle env prop changes
   - Update KUBECONFIG
   - Update KUBECTL_NAMESPACE
   - Write environment updates to terminal

3. **Resize Handling** (~150 lines)
   - Window resize observer
   - Fit terminal to container
   - Debounced resize
   - Backend terminal resize sync
   - Multiple resize effects

4. **Loading Overlay** (~50 lines)
   - Show/hide loading state
   - Spinner animation
   - Overlay styling

5. **Cleanup** (~50 lines)
   - Unmount handling
   - Dispose terminal
   - Remove event listeners
   - Close backend terminal

6. **Render** (~80 lines)
   - Terminal container
   - Loading overlay
   - Styles

## Refactoring Plan

### Components to Extract

1. **useTerminalCore.ts** (Custom Hook)
   - Terminal initialization
   - XTerm and FitAddon setup
   - Data/exit event handling
   - Returns: { terminalRef, xtermRef, fitAddonRef, isReady }

2. **useTerminalResize.ts** (Custom Hook)
   - Window resize observer
   - Fit terminal logic
   - Backend sync
   - Takes: xtermRef, fitAddonRef, id, isReady

3. **useTerminalEnvironment.ts** (Custom Hook)
   - Environment change handling
   - KUBECONFIG updates
   - Namespace updates
   - Takes: xtermRef, env, isReady, isLoading

4. **LoadingOverlay.tsx** (Component)
   - Loading state display
   - Spinner
   - Styling

### Result

**Terminal.tsx** (~150 lines)
- Orchestrates hooks
- Handles cleanup
- Renders container + overlay

**useTerminalCore.ts** (~80 lines)
**useTerminalResize.ts** (~100 lines)
**useTerminalEnvironment.ts** (~60 lines)
**LoadingOverlay.tsx** (~30 lines)

**Total**: ~420 lines (vs 519 original)
**Benefit**: Clear separation, reusable hooks, easier testing

## Benefits

1. **Testability**: Each hook can be tested independently
2. **Reusability**: Hooks can be used in other terminal components
3. **Maintainability**: Clear, focused responsibilities
4. **Debugging**: Easier to isolate issues
5. **Performance**: Can optimize individual hooks

## Next Steps

1. Extract LoadingOverlay component
2. Extract useTerminalCore hook
3. Extract useTerminalResize hook
4. Extract useTerminalEnvironment hook
5. Refactor Terminal.tsx to use hooks
6. Test all functionality
