# Kubectl Command Palette Design

## Overview

A dedicated command palette for kubectl suggestions, triggered by a hotkey (Ctrl+K), separate from the existing resource Command Palette (Ctrl+Shift+P).

## Problem

Users need to discover and run common kubectl commands without memorizing syntax. The current Command Palette focuses on resource actions (logs, exec, describe for specific pods/deployments), but doesn't help with general kubectl operations like listing secrets, viewing cluster info, or checking events.

## Solution

Add a dedicated **Kubectl Command Palette** that:
- Shows common kubectl commands in a searchable overlay
- Prioritizes recent/frequently-used commands
- Provides a preview dialog before execution
- Supports namespace selection

## Design

### Trigger

- **Hotkey:** Ctrl+K (separate from Ctrl+Shift+P)
- Opens a command palette overlay in the center of the screen

### Behavior

1. **On open:** Shows recent/commonly-used commands at the top, followed by all available commands
2. **Search:** Type to filter commands by name or keyword
3. **Navigation:** Arrow keys to move, Enter to select, Esc to close
4. **Categories:** Commands grouped by type (Resources, Cluster, Debugging)

### Preview Dialog

When a command is selected:
1. A preview dialog appears showing:
   - The full kubectl command
   - Namespace dropdown (pre-filled with current namespace, editable)
   - "Run" and "Cancel" buttons
2. User can modify namespace before executing
3. Clicking "Run" executes the command in the terminal

### Initial Commands

#### Resources
| Icon | Label | Command |
|------|-------|---------|
| List Pods | `kubectl get pods -n {namespace}` |
| List Deployments | `kubectl get deployments -n {namespace}` |
| List Services | `kubectl get services -n {namespace}` |
| List Secrets | `kubectl get secrets -n {namespace}` |
| List ConfigMaps | `kubectl get configmaps -n {namespace}` |
| List Ingresses | `kubectl get ingresses -n {namespace}` |

#### Cluster
| Icon | Label | Command |
|------|-------|---------|
| Get Nodes | `kubectl get nodes` |
| Cluster Info | `kubectl cluster-info` |
| Get Namespaces | `kubectl get namespaces` |

#### Debugging
| Icon | Label | Command |
|------|-------|---------|
| View Events | `kubectl get events -n {namespace} --sort-by='.lastTimestamp'` |
| Top Pods | `kubectl top pods -n {namespace}` |
| Top Nodes | `kubectl top nodes` |

### Namespace Handling

- **Namespace-scoped commands:** Use the currently selected namespace, editable in preview dialog
- **Cluster-scoped commands:** No namespace field shown (e.g., Get Nodes, Cluster Info)

## Future Enhancements

- **Output processing toggles:** Checkboxes in preview dialog for:
  - Decode base64 (for secrets)
  - Pretty-print JSON
  - Format as table
- **Custom commands:** Let users add their own frequently-used commands
- **Command history:** Track and prioritize recently-used commands

## Technical Considerations

- Reuse styling from existing CommandPalette component
- Store recent commands in localStorage
- Command definitions in a separate module for maintainability
