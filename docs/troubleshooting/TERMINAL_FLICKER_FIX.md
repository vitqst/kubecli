# Terminal Flicker Fix

## Problem

When switching kubeconfig files, contexts, or namespaces, the terminal would blink twice:
1. First blink: Terminal clears
2. Second blink: Messages appear
3. User sees flickering even with loading overlay

This created a jarring user experience where the overlay would hide and reveal an unstable terminal state.

## Root Cause

The flickering was caused by:
1. **Separate operations**: Clear and write were done in separate setTimeout calls
2. **Shell command clear**: Using `clear\n` command caused a visible delay
3. **Multiple redraws**: Each `writeln()` triggered a terminal redraw
4. **Timing mismatch**: Overlay was hiding before terminal fully settled

## Solution

### 1. Atomic Terminal Updates

**Before (caused double blink):**
```typescript
// Clear terminal
window.terminal.write(id, 'clear\n');

// Wait 100ms
setTimeout(() => {
  // Write messages (separate operation)
  xtermRef.current.writeln('✓ Namespace: default');
}, 100);
```

**After (single operation):**
```typescript
// Wait for overlay to be fully visible (500ms)
setTimeout(() => {
  // Clear using xterm API (instant)
  xtermRef.current.clear();
  
  // Write all messages immediately (batched)
  messages.forEach(msg => xtermRef.current.writeln(msg));
  
  // Send shell commands after visual update
  window.terminal.write(id, batchCommand);
}, 500);
```

### 2. Extended Overlay Duration

Increased overlay durations to ensure they stay visible until terminal is completely settled:

- **Namespace changes**: 1.2s → **1.4s**
- **Context changes**: 1.7s → **1.9s**
- **Config changes**: 2.0s → **2.2s**

### 3. Optimized Timing Sequence

```
User Action (e.g., change namespace)
    ↓
[0ms] Show loading overlay
    ↓
[50ms] Update React state
    ↓
[500ms] Clear terminal + Write all messages (atomic)
    ↓
[1400ms] Hide overlay (terminal fully settled)
```

### 4. Key Optimizations

**Use xterm.clear() instead of shell command:**
```typescript
// Before: Shell command (slow, visible)
window.terminal.write(id, 'clear\n');

// After: xterm API (instant, no flicker)
xtermRef.current.clear();
```

**Batch all messages:**
```typescript
// Collect all messages first
const messages: string[] = [];
messages.push(`✓ KUBECONFIG: ${env.KUBECONFIG}`);
messages.push(`✓ Namespace: ${namespace}`);

// Write all at once (single redraw)
messages.forEach(msg => xtermRef.current.writeln(msg));
```

**Visual updates before shell commands:**
```typescript
// 1. Clear terminal (visual)
xtermRef.current.clear();

// 2. Write messages (visual)
messages.forEach(msg => xtermRef.current.writeln(msg));

// 3. Update shell environment (background)
window.terminal.write(id, batchCommand);
```

## Results

### Before
- ❌ Terminal blinks twice
- ❌ Visible clear operation
- ❌ Messages appear one by one
- ❌ Overlay hides too early
- ❌ Jarring user experience

### After
- ✅ Single atomic update
- ✅ Instant clear (no visible operation)
- ✅ All messages appear together
- ✅ Overlay stays until fully settled
- ✅ Smooth, professional experience

## Testing

To verify the fix:

1. Start the application: `make dev`
2. Switch to Terminal view
3. Change namespace multiple times rapidly
4. Observe: No flickering, smooth overlay transitions
5. Change context: Same smooth experience
6. Change config file: Same smooth experience

**Expected behavior:**
- Overlay appears instantly
- Overlay stays visible throughout update
- Terminal updates happen while overlay is shown
- Overlay disappears revealing stable terminal state
- No blinking or flickering at any point

## Technical Details

### Why 500ms Initial Delay?

The 500ms delay ensures:
1. React state updates propagate (50ms)
2. Overlay renders and becomes visible (200ms)
3. Fade-in animation completes (200ms)
4. Buffer time for slower systems (50ms)

### Why Extended Overlay Duration?

The extended durations (1.4s-2.2s) ensure:
1. Terminal clear completes (instant but needs render)
2. All messages write (batched but needs render)
3. Shell commands execute (background)
4. Terminal fully settles and stabilizes
5. No premature overlay hiding

### xterm.clear() vs Shell Clear

**xterm.clear():**
- Instant operation
- No shell interaction
- No visible delay
- Synchronous

**Shell clear command:**
- Requires shell execution
- Visible delay
- Asynchronous
- Can cause flicker

## Related Files

- `src/components/Terminal.tsx`: Terminal update logic
- `src/renderer.tsx`: Overlay timing control
- `docs/TERMINAL_LOADING_OVERLAY.md`: Complete overlay documentation

## Future Improvements

Potential optimizations:
1. Use `requestAnimationFrame` for even smoother updates
2. Implement fade transitions between terminal states
3. Add configurable overlay duration in settings
4. Detect slow systems and adjust timing automatically
