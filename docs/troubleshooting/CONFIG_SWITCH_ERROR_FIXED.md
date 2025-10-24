# Config Switch Error - Fixed

## Problem

When switching between kubeconfig files using the dropdown selector, the application would throw an error in the context section. This happened because of a race condition between state updates.

## Root Cause

The bug occurred due to the following sequence:

1. User selects a new config file from the dropdown
2. `handleConfigChange()` is called with the new config path
3. The backend switches to the new config and loads its contexts
4. **Problem**: The `selectedContext` state still holds a context name from the OLD config
5. The `useEffect` hook (line 117-122) triggers `loadNamespaces()` with the old context name
6. `loadNamespaces()` tries to run `kubectl get namespaces` with a context that doesn't exist in the new config
7. This causes an error: "context not found" or similar kubectl error

### Example Scenario

```
Old Config (~/.kube/config):
  - contexts: [dev-cluster, staging-cluster]
  - selectedContext: "dev-cluster"

User switches to new config (~/.kube/config-prod):
  - contexts: [prod-cluster-1, prod-cluster-2]
  - selectedContext: still "dev-cluster" (from old config!)
  - loadNamespaces("dev-cluster") → ERROR: context not found
```

## Solution

Applied three defensive fixes to prevent race conditions:

### Fix 1: Clear Selected Context on Config Switch

**File**: `src/renderer.tsx` (line 179-187)

```typescript
const handleConfigChange = useCallback(
  async (configPath: string) => {
    setLoadState('loading');
    setLoadError(null);
    setRunError(null);
    // Clear selected context and namespaces to prevent race conditions
    setSelectedContext('');
    setNamespaces([]);
    setSelectedNamespace('default');
    // ... rest of function
  },
  [applySummary]
);
```

**Why**: Immediately clearing `selectedContext` prevents the old context name from being used with the new config.

### Fix 2: Validate Context Before Loading Namespaces

**File**: `src/renderer.tsx` (line 44-51)

```typescript
const loadNamespaces = useCallback(async (contextName: string) => {
  if (!contextName || !kubeAPI) return;
  
  // Verify context exists in current context list
  if (!contexts.some(ctx => ctx.name === contextName)) {
    console.log(`Context ${contextName} not found in current config, skipping namespace load`);
    return;
  }
  
  // ... rest of function
}, [contexts]);
```

**Why**: Adds a guard to prevent namespace loading if the context doesn't exist in the current config's context list.

### Fix 3: Clear Namespaces on Config Switch

**File**: `src/renderer.tsx` (line 186-187)

```typescript
setNamespaces([]);
setSelectedNamespace('default');
```

**Why**: Prevents stale namespace data from the old config from being displayed or used.

## How It Works Now

### Correct Flow After Fix

1. User selects new config file
2. `handleConfigChange()` is called
3. **Immediately clear**: `selectedContext = ''`, `namespaces = []`, `selectedNamespace = 'default'`
4. Backend switches to new config
5. Backend returns new context list
6. `applySummary()` sets the new contexts and selects appropriate context
7. `useEffect` triggers `loadNamespaces()` with the NEW context
8. **Guard check**: Validates context exists in new config before proceeding
9. Namespaces load successfully for the new context

### State Update Sequence

```
Before:
  kubeconfigPath: ~/.kube/config
  contexts: [dev-cluster, staging-cluster]
  selectedContext: "dev-cluster"
  namespaces: [default, kube-system, ...]

During Switch (CRITICAL MOMENT):
  kubeconfigPath: ~/.kube/config-prod (updating...)
  contexts: [] (clearing...)
  selectedContext: "" (CLEARED - prevents race condition)
  namespaces: [] (CLEARED)

After:
  kubeconfigPath: ~/.kube/config-prod
  contexts: [prod-cluster-1, prod-cluster-2]
  selectedContext: "prod-cluster-1" (from new config)
  namespaces: [default, production, ...] (loaded for new context)
```

## Testing

### Manual Test Steps

1. **Setup**: Ensure you have multiple kubeconfig files
   ```bash
   ls ~/.kube/config*
   # Should show: config, config-staging, config-prod, etc.
   ```

2. **Test**: Switch between configs
   - Start the app
   - Note the current context
   - Switch to a different config file using the dropdown
   - Verify: No errors in console
   - Verify: Context dropdown updates with new contexts
   - Verify: A context is automatically selected
   - Verify: Namespaces load for the new context

3. **Test Edge Cases**:
   - Switch to a config with no contexts (should show "No contexts found")
   - Switch rapidly between configs (should not cause errors)
   - Switch to a config with same context name (should work seamlessly)

### Expected Behavior

✅ **Success Indicators**:
- No errors in console when switching configs
- Context dropdown updates immediately
- New context is automatically selected
- Namespaces load for the new context
- UI remains responsive during switch

❌ **Previous Error Indicators** (now fixed):
- Console error: "context not found"
- Console error: "Failed to load namespaces"
- Empty context dropdown
- Frozen UI during switch

## Technical Details

### Race Condition Prevention

The fix uses React's state management to ensure proper ordering:

1. **Synchronous Clear**: State is cleared synchronously before async operations
2. **Dependency Array**: `loadNamespaces` depends on `contexts` array
3. **Guard Validation**: Double-checks context exists before API calls
4. **Fallback Logic**: `applySummary` has fallback logic for context selection

### Why Three Fixes?

Each fix addresses a different failure mode:

- **Fix 1** (Clear on switch): Prevents old context from being used
- **Fix 2** (Validate before load): Catches any remaining race conditions
- **Fix 3** (Clear namespaces): Prevents UI from showing stale data

This defense-in-depth approach ensures robustness even if one safeguard fails.

## Related Files

- `src/renderer.tsx`: Main UI component with state management
- `src/main/kube.ts`: Backend kubeconfig operations
- `src/main.ts`: IPC handler for `kube:set-config`
- `docs/KUBECONFIG_SWITCHING.md`: Feature documentation

## See Also

- [KUBECONFIG_SWITCHING.md](../KUBECONFIG_SWITCHING.md) - Feature documentation
- [ERROR_REPORTING.md](ERROR_REPORTING.md) - General error patterns
- [Use Case 001](../ai/use_case_001.md) - Context switching requirements
