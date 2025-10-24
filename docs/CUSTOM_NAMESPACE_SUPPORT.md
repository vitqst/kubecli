# Custom Namespace Support for Resource Actions

## Overview

The Kubernetes CLI Manager now supports custom namespace specification for resource actions. This is particularly important for resources like CronJobs that are displayed across all namespaces.

## Problem

CronJobs are fetched using `kubectl get cronjobs -A` (all namespaces) and displayed as `namespace/name`. When a user clicked an action button (View, Edit, Trigger, etc.), the system was using the **selected namespace** from the dropdown instead of the **cronjob's actual namespace**, causing commands to fail.

## Solution

Added an optional `customNamespace` parameter throughout the action execution chain, allowing resources to specify which namespace to use for their actions.

### Architecture

```
User clicks action
    ↓
TerminalSidebar extracts namespace from "namespace/name"
    ↓
Passes customNamespace to onResourceAction()
    ↓
Renderer uses customNamespace || selectedNamespace
    ↓
Action executes with correct namespace
```

### Implementation Details

#### 1. TerminalSidebar Component

**Extracts namespace from cronjob name:**
```typescript
const [ns, name] = cj.name.split('/');
```

**Passes to action handler:**
```typescript
onClick={() => onResourceAction(action.id, 'cronjob', name, ns)}
```

**Context menu also receives custom namespace:**
```typescript
showContextMenu(e.clientX, e.clientY, 'cronjob', name, ns)
```

#### 2. Renderer Component

**Handler signature updated:**
```typescript
const handleResourceAction = useCallback(
  (actionId: string, resourceType: ResourceType, resourceName: string, customNamespace?: string) => {
    // Use custom namespace if provided, otherwise use selected namespace
    const namespace = customNamespace || selectedNamespace;
    
    const context: ResourceActionContext = {
      resourceName,
      namespace,
      resourceType,
    };
    // ... rest of handler
  },
  [selectedNamespace, isInEditMode]
);
```

#### 3. Context Menu State

**State includes custom namespace:**
```typescript
const [contextMenu, setContextMenu] = useState<{
  x: number;
  y: number;
  resourceType: ResourceType;
  resourceName: string;
  customNamespace?: string;
} | null>(null);
```

**Used in action execution:**
```typescript
onClick={() => {
  onResourceAction(
    action.id, 
    contextMenu.resourceType, 
    contextMenu.resourceName, 
    contextMenu.customNamespace
  );
}}
```

## Usage Examples

### CronJobs (Custom Namespace)

```typescript
// CronJob stored as "default/my-cronjob"
const [ns, name] = cj.name.split('/');  // ns = "default", name = "my-cronjob"

// Action uses cronjob's actual namespace
onResourceAction('view', 'cronjob', name, ns);
// Executes: kubectl get cronjobs my-cronjob -n default -o yaml
```

### Pods/Deployments (Selected Namespace)

```typescript
// No custom namespace provided
onResourceAction('view', 'pod', 'my-pod');
// Uses selected namespace from dropdown
// Executes: kubectl get pod my-pod -n <selected-namespace> -o yaml
```

## Benefits

1. **Correct Execution**: CronJob actions now work correctly regardless of selected namespace
2. **Flexible System**: Any resource can specify custom namespace if needed
3. **Backward Compatible**: Optional parameter doesn't break existing resources
4. **Cross-Namespace Support**: Enables actions on resources from any namespace
5. **Future-Proof**: Easy to extend to other cross-namespace resources

## Files Modified

- **src/renderer.tsx**
  - Added `customNamespace` parameter to `handleResourceAction`
  - Uses `customNamespace || selectedNamespace` for context

- **src/components/TerminalSidebar.tsx**
  - Updated `onResourceAction` prop signature
  - Extracts namespace from cronjob name
  - Passes custom namespace to all cronjob actions
  - Stores custom namespace in context menu state
  - Uses custom namespace in context menu actions

## Testing

To verify custom namespace support:

1. Have cronjobs in multiple namespaces
2. Select a different namespace in the dropdown
3. Click any action on a cronjob from a different namespace
4. Verify the command uses the cronjob's namespace, not the selected one

Example:
- Selected namespace: `default`
- CronJob: `kube-system/cleanup-job`
- Click "View" → Should execute: `kubectl get cronjobs cleanup-job -n kube-system -o yaml`
- ✅ Uses `kube-system` (cronjob's namespace)
- ❌ NOT `default` (selected namespace)

## Future Enhancements

This pattern can be extended to other resources that span namespaces:
- Services (with cross-namespace endpoints)
- ConfigMaps/Secrets (referenced across namespaces)
- NetworkPolicies (with cross-namespace rules)
- Any custom resources with cross-namespace references
