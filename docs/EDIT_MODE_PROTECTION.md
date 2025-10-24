# Edit Mode Protection

## Overview

This feature prevents users from executing resource actions (View, Exec, Logs, Edit, Delete, etc.) while the terminal is in edit mode. When commands like `kubectl edit` open an interactive editor (vim, nano, etc.), all action buttons in the sidebar are automatically disabled to prevent conflicts and accidental command execution.

## How It Works

### 1. Terminal Output Monitoring

The backend terminal manager (`src/main/terminal.ts`) monitors all terminal output for specific escape sequences and patterns that indicate when an editor has taken control:

**Enter Edit Mode Patterns:**
- `\x1b[?1049h` - Vim/Vi alternate screen buffer (most reliable)
- `\x1b[?47h` - Alternative screen mode
- `GNU nano` - Nano editor signature

**Exit Edit Mode Patterns (checked with higher priority):**
- `\x1b[?1049l` - Vim/Vi exit alternate screen
- `\x1b[?47l` - Exit alternative screen mode

**Detection Logic:**
1. Exit patterns are checked FIRST to prevent getting stuck in edit mode
2. Enter patterns are only checked if no exit pattern is found
3. This prioritization ensures reliable detection and prevents false positives

### 2. State Communication

When edit mode is detected:
1. **Backend** (`TerminalManager`) updates internal state and sends IPC event
2. **Preload** (`src/preload.ts`) exposes `onEditMode` event listener
3. **Terminal Component** (`src/components/Terminal.tsx`) receives event and notifies parent
4. **Renderer** (`src/renderer.tsx`) updates global state
5. **Sidebar** (`src/components/TerminalSidebar.tsx`) disables all action buttons

### 3. UI Changes

When in edit mode:
- **All action buttons** (View, Exec, Logs, Edit, etc.) are disabled
- **Configuration selectors** (Kubeconfig, Context, Namespace) are disabled
- Buttons show reduced opacity (40%)
- Selectors show reduced opacity (50%) with darker background
- Cursor changes to `not-allowed`
- Tooltips change to indicate edit mode restriction
- Click events are blocked via `pointerEvents: 'none'` on buttons

## Implementation Details

### Files Modified

1. **`src/main/terminal.ts`**
   - Added `editModeStatus` Map to track state per terminal
   - Added `detectEditMode()` method to analyze terminal output
   - Added `isInEditMode()` public method
   - Sends `terminal:edit-mode` IPC event on state change

2. **`src/preload.ts`**
   - Added `onEditMode` event listener to terminal API
   - Returns cleanup function for proper event handling

3. **`src/types/global.d.ts`**
   - Added `onEditMode` to Window.terminal type definition

4. **`src/components/Terminal.tsx`**
   - Added `onEditModeChange` prop
   - Listens to `terminal:edit-mode` events
   - Notifies parent component of state changes

5. **`src/renderer.tsx`**
   - Added `isInEditMode` state
   - Added `handleEditModeChange` callback
   - Prevents action execution when in edit mode
   - Passes state to TerminalSidebar

6. **`src/components/TerminalSidebar.tsx`**
   - Added `isInEditMode` prop
   - Applies disabled styling to all action buttons
   - Disables config, context, and namespace selectors
   - Shows appropriate tooltips when disabled
   - Added `disabledButton` and `disabledSelect` styles

## Usage

The feature works automatically - no user configuration needed:

1. User clicks "Edit" on any resource (Pod, Deployment, CronJob)
2. `kubectl edit` command opens vim/nano in terminal
3. System detects editor and disables:
   - All action buttons (View, Exec, Logs, etc.)
   - Kubeconfig file selector
   - Context selector
   - Namespace selector
4. User edits the resource in the terminal
5. User saves and exits editor (`:wq` in vim, Ctrl+X in nano)
6. System detects editor exit and re-enables all controls

## Testing

To test the feature:

```bash
# Start the app
npm start

# In the terminal sidebar:
1. Expand Pods section
2. Click "Edit" on any pod
3. Observe: 
   - All action buttons become disabled (grayed out, 40% opacity)
   - Config/Context/Namespace selectors become disabled (grayed out, 50% opacity)
   - Tooltips show "Cannot change/perform while in edit mode"
4. Try clicking buttons or selectors - they won't respond
5. Exit the editor (:wq in vim)
6. Observe: All controls become enabled again
```

## Edge Cases Handled

- **Multiple terminals**: Each terminal tracks its own edit mode state independently
- **Terminal cleanup**: Edit mode state is cleared when terminal is closed
- **Navigation**: Edit mode is reset when navigating between home and terminal views
- **Editor crashes**: Exit patterns detect when editor terminates
- **Different editors**: Supports vim, vi, nano, and other common editors

## Benefits

1. **Prevents conflicts**: Users can't accidentally trigger actions while editing
2. **Prevents context switches**: Config/context/namespace changes blocked during editing
3. **Clear feedback**: Visual indication that controls are temporarily unavailable
4. **Automatic**: No manual intervention required
5. **Safe**: Uses well-established terminal escape sequences for detection
6. **Robust**: Handles multiple editors and edge cases
7. **Consistent UX**: All interactive controls disabled uniformly

## Future Enhancements

Potential improvements:
- Add visual indicator in terminal header showing edit mode status
- Support for additional editors (emacs, etc.)
- Option to queue actions for execution after edit mode exits
- Keyboard shortcut to force-exit edit mode if needed
