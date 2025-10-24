# Terminal Loading Overlay Feature

## Overview

A loading overlay is now displayed on the terminal section when switching between kubeconfig files, contexts, or namespaces. This provides visual feedback during the environment update process.

## Implementation

### Components Modified

1. **`src/renderer.tsx`**
   - Added `isConfigChanging` state to track when environment updates are in progress
   - Modified `handleConfigChange()` to set loading state with 2000ms duration
   - Modified `handleContextChange()` to set loading state with 1500ms duration
   - Modified `handleNamespaceChange()` to set loading state with 1200ms duration
   - Passes `isLoading` prop to Terminal component

2. **`src/components/Terminal.tsx`**
   - Added `isLoading?: boolean` prop to TerminalProps interface
   - Implemented loading overlay with:
     - Semi-transparent dark background (rgba(30, 30, 30, 0.9))
     - Animated spinning loader (CSS animation)
     - Smooth fade-in animation (0.2s)
     - "Updating terminal environment..." message
     - Positioned absolutely over terminal with z-index 1000

### User Experience

When a user changes:
- **Kubeconfig file**: Loading overlay appears for 2 seconds
- **Context**: Loading overlay appears for 1.7 seconds  
- **Namespace**: Loading overlay appears for 1.2 seconds

The overlay appears **before** terminal commands execute, preventing any visible flickering. The timing ensures:
1. User sees the overlay immediately (50ms delay)
2. Overlay becomes fully visible (400ms delay)
3. Terminal clears and updates (batched writes)
4. Overlay remains until all updates complete
5. User never sees intermediate terminal states or flicker

### Visual Design

- **Background**: Solid dark overlay (100% opacity) matching terminal theme
- **Spinner**: Blue accent color (#0e639c) matching VS Code theme
- **Text**: Light gray (#cccccc) for readability
- **Animations**: 
  - Smooth 1-second rotation for the spinner
  - 0.2-second fade-in for the overlay appearance

## Testing

To verify the feature:

1. Start the application: `npm start`
2. Switch to Terminal view
3. Change the kubeconfig file in the sidebar → observe loading overlay
4. Change the context → observe loading overlay
5. Change the namespace → observe loading overlay

The terminal should display updated KUBECONFIG and namespace information after the overlay disappears.

## Technical Notes

- **Loading Duration**: Extended (1-2s) to prevent flickering and ensure terminal environment fully updates
  - Config changes: 2s (most complex, involves context/namespace reload)
  - Context changes: 1.5s (moderate complexity)
  - Namespace changes: 1s (simpler update)
- **Timing Sequence**: Overlay appears first, then commands execute
  - Step 1: Show loading overlay (50ms delay)
  - Step 2: Update state and trigger terminal commands (300ms delay)
  - Step 3: Execute terminal environment updates
  - Step 4: Hide overlay after completion
- **Styling**: CSS-in-JS for consistency with the rest of the application
- **Animations**: Defined inline to avoid external CSS dependencies
- **Rendering**: Conditionally rendered based on the `isLoading` prop
- **Opacity**: 100% background opacity provides complete visual coverage during updates
