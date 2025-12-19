# Verbose Loading Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace static "Loading..." in ResourcePanel with a progress list showing per-resource-type status, item counts, and timing.

**Architecture:** Add `loadingStates` to ResourceCacheContext tracking each resource type's fetch status. Each parallel kubectl fetch updates its own state on completion. New LoadingProgress component renders the progress list inline in ResourcePanel.

**Tech Stack:** React, TypeScript, CSS-in-JS (inline styles)

---

### Task 1: Add ResourceLoadingState Type

**Files:**
- Modify: `src/contexts/ResourceCacheContext.tsx:6-30`

**Step 1: Add the new type after CachedResource interface**

Add after line 16 (after the CachedResource interface closing brace):

```typescript
export interface ResourceLoadingState {
  status: 'pending' | 'loading' | 'success' | 'error';
  count?: number;       // Number of items fetched
  duration?: number;    // Time in milliseconds
  error?: string;       // Error message if failed
}
```

**Step 2: Add loadingStates to context type**

Modify `ResourceCacheContextType` interface (around line 18-30) to add:

```typescript
loadingStates: Record<ResourceType, ResourceLoadingState>;
```

Add this after the `error: string | null;` line.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Errors about missing `loadingStates` in provider (we'll fix in next task)

**Step 4: Commit type changes**

```bash
git add src/contexts/ResourceCacheContext.tsx
git commit -m "feat: add ResourceLoadingState type to context"
```

---

### Task 2: Add loadingStates State and Derived isLoading

**Files:**
- Modify: `src/contexts/ResourceCacheContext.tsx`

**Step 1: Add initial loading states constant**

Add after `CACHE_TTL` constant (around line 62):

```typescript
const INITIAL_LOADING_STATES: Record<ResourceType, ResourceLoadingState> = {
  pod: { status: 'pending' },
  deployment: { status: 'pending' },
  cronjob: { status: 'pending' },
  service: { status: 'pending' },
  configmap: { status: 'pending' },
  secret: { status: 'pending' },
  job: { status: 'pending' },
  statefulset: { status: 'pending' },
  daemonset: { status: 'pending' },
  ingress: { status: 'pending' },
};
```

**Step 2: Add loadingStates state in provider**

In `ResourceCacheProvider` function, after the existing useState calls (around line 74), add:

```typescript
const [loadingStates, setLoadingStates] = useState<Record<ResourceType, ResourceLoadingState>>(
  INITIAL_LOADING_STATES
);
```

**Step 3: Add useMemo import and derive isLoading**

Update the import to include `useMemo`:

```typescript
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
```

Replace the `isLoading` useState with a derived value. Remove:
```typescript
const [isLoading, setIsLoading] = useState(false);
```

Add after loadingStates state:
```typescript
const isLoading = useMemo(
  () => Object.values(loadingStates).some(s => s.status === 'loading'),
  [loadingStates]
);
```

**Step 4: Add loadingStates to context value**

In the `value` object (around line 391), add `loadingStates`:

```typescript
const value: ResourceCacheContextType = {
  resources,
  isLoading,
  loadingStates,  // Add this line
  lastUpdated,
  // ... rest unchanged
};
```

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compilation (0 errors)

**Step 6: Commit state changes**

```bash
git add src/contexts/ResourceCacheContext.tsx
git commit -m "feat: add loadingStates state with derived isLoading"
```

---

### Task 3: Modify fetchResources for Per-Type Progress Tracking

**Files:**
- Modify: `src/contexts/ResourceCacheContext.tsx`

**Step 1: Create fetchOne helper inside fetchResources**

Replace the `fetchResources` callback (starting around line 90). The new version:

```typescript
const fetchResources = useCallback(async () => {
  if (!selectedContext) return;

  console.log(`[ResourceCache] ${new Date().toISOString()} Starting parallel fetch for ${cacheKey}`);

  // Reset all to loading
  setLoadingStates({
    pod: { status: 'loading' },
    deployment: { status: 'loading' },
    cronjob: { status: 'loading' },
    service: { status: 'loading' },
    configmap: { status: 'loading' },
    secret: { status: 'loading' },
    job: { status: 'loading' },
    statefulset: { status: 'loading' },
    daemonset: { status: 'loading' },
    ingress: { status: 'loading' },
  });

  /**
   * Helper to extract a value from an object using a JSON path like '.metadata.name'
   */
  const getValueByPath = (obj: any, path: string): any => {
    if (!path || !obj) return undefined;
    const cleanPath = path.startsWith('.') ? path.slice(1) : path;
    const parts = cleanPath.split('.');
    let value = obj;
    for (const part of parts) {
      if (value === undefined || value === null) return undefined;
      value = value[part];
    }
    return value;
  };

  /**
   * Process JSON output and extract column values for a resource type
   */
  const processJsonOutput = (
    jsonStr: string,
    resourceType: ResourceType
  ): CachedResource[] => {
    const results: CachedResource[] = [];
    try {
      const parsed = JSON.parse(jsonStr);
      const items = parsed.items || [];
      const resourceDef = getResourceDefinition(resourceType);
      const columns = resourceDef?.columns || [];

      for (const item of items) {
        const columnValues: Record<string, any> = {};

        for (const col of columns) {
          columnValues[col.key] = getValueByPath(item, col.path);
        }

        // Generate legacy status and info fields for backward compatibility
        let status = 'Unknown';
        let info = String(resourceType);

        if (resourceType === 'pod') {
          status = item.status?.phase || 'Unknown';
          const statuses = item.status?.containerStatuses || [];
          const ready = statuses.filter((s: any) => s?.ready).length;
          info = `Pod | ${status} | ${ready}/${statuses.length}`;
        } else if (resourceType === 'deployment') {
          status = 'Active';
          const ready = item.status?.readyReplicas || 0;
          const desired = item.status?.replicas || 0;
          info = `Deployment | ${ready}/${desired}`;
        } else if (resourceType === 'cronjob') {
          status = item.spec?.suspend ? 'Suspended' : 'Active';
          const schedule = item.spec?.schedule || '';
          info = `CronJob | ${schedule}`;
        } else if (resourceType === 'service') {
          const svcType = item.spec?.type || 'ClusterIP';
          status = svcType;
          const clusterIP = item.spec?.clusterIP || 'N/A';
          info = `Service | ${svcType} | ${clusterIP}`;
        } else if (resourceType === 'configmap') {
          status = 'Available';
          info = 'ConfigMap';
        } else if (resourceType === 'secret') {
          const secretType = item.type || 'Opaque';
          status = secretType;
          info = `Secret | ${secretType}`;
        }

        results.push({
          type: resourceType,
          name: item.metadata?.name || '',
          namespace: item.metadata?.namespace || '',
          status,
          info,
          columns: columnValues,
        });
      }
    } catch (e) {
      console.error(`[ResourceCache] Failed to parse ${resourceType} JSON:`, e);
    }
    return results;
  };

  /**
   * Fetch a single resource type and update its loading state
   */
  const fetchOne = async (type: ResourceType, command: string): Promise<CachedResource[]> => {
    const start = Date.now();
    try {
      const result = await kube.runCommand(selectedContext, command);
      const duration = Date.now() - start;

      if (result.code === 0 && result.stdout) {
        const resources = processJsonOutput(result.stdout, type);
        setLoadingStates(prev => ({
          ...prev,
          [type]: { status: 'success', count: resources.length, duration }
        }));
        console.log(`[ResourceCache] ✓ ${type}: ${resources.length} items (${duration}ms)`);
        return resources;
      } else {
        const errorMsg = result.stderr || 'Unknown error';
        setLoadingStates(prev => ({
          ...prev,
          [type]: { status: 'error', error: errorMsg, duration }
        }));
        console.error(`[ResourceCache] ✗ ${type}: ${errorMsg}`);
        return [];
      }
    } catch (err) {
      const duration = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setLoadingStates(prev => ({
        ...prev,
        [type]: { status: 'error', error: errorMsg, duration }
      }));
      console.error(`[ResourceCache] ✗ ${type}: ${errorMsg}`);
      return [];
    }
  };

  try {
    // Run ALL kubectl commands in PARALLEL, each updates its own state
    const results = await Promise.all([
      fetchOne('pod', 'get pods -A -o json'),
      fetchOne('deployment', 'get deployments -A -o json'),
      fetchOne('cronjob', 'get cronjobs -A -o json'),
      fetchOne('service', 'get services -A -o json'),
      fetchOne('configmap', 'get configmaps -A -o json'),
      fetchOne('secret', 'get secrets -A -o json'),
    ]);

    console.log(`[ResourceCache] ${new Date().toISOString()} All parallel fetches completed`);

    const allResources = results.flat();
    const now = new Date();

    // Cache each resource type with its TTL
    const resourcesByType = new Map<ResourceType, CachedResource[]>();
    allResources.forEach(resource => {
      if (!resourcesByType.has(resource.type)) {
        resourcesByType.set(resource.type, []);
      }
      resourcesByType.get(resource.type)!.push(resource);
    });

    resourcesByType.forEach((resources, type) => {
      const ttl = CACHE_TTL[type];
      const expiresAt = ttl === Infinity ? null as any : new Date(now.getTime() + ttl);
      const typedCacheKey = `${cacheKey}::${type}`;

      cacheStorage.set(typedCacheKey, {
        resources,
        lastUpdated: now,
        expiresAt,
      });
    });

    setResources(allResources);
    setLastUpdated(now);
    console.log(`[ResourceCache] Cached ${allResources.length} total resources for ${cacheKey}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch resources';
    console.error('[ResourceCache] Failed to fetch resources:', err);
    setError(errorMessage);

    if (addError) {
      addError({
        message: 'Failed to load Kubernetes resources',
        details: errorMessage.includes('auth') || errorMessage.includes('permission')
          ? 'Authentication may have expired. Try switching contexts or reconfiguring kubectl.'
          : errorMessage.includes('connection') || errorMessage.includes('timeout')
          ? 'Cannot connect to cluster. Check your network and cluster status.'
          : errorMessage,
        severity: 'error',
        dismissible: true,
        action: {
          label: 'Retry',
          callback: () => fetchResources(),
        },
      });
    }
  }
}, [selectedContext, cacheKey, addError]);
```

**Step 2: Remove setIsLoading calls**

The old code had `setIsLoading(true)` at start and `setIsLoading(false)` in finally block. Since isLoading is now derived, remove both calls. (They should already be gone if you replaced the whole function above.)

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compilation

**Step 4: Commit fetch changes**

```bash
git add src/contexts/ResourceCacheContext.tsx
git commit -m "feat: track per-resource-type loading progress"
```

---

### Task 4: Create LoadingProgress Component

**Files:**
- Create: `src/components/resource-panel/LoadingProgress.tsx`

**Step 1: Create the component file**

```typescript
// src/components/resource-panel/LoadingProgress.tsx
import React from 'react';
import { ResourceType } from '../../resources';
import { ResourceLoadingState } from '../../contexts/ResourceCacheContext';

interface LoadingProgressProps {
  loadingStates: Record<ResourceType, ResourceLoadingState>;
}

// Resource types to display (in order)
const DISPLAY_TYPES: { type: ResourceType; label: string }[] = [
  { type: 'pod', label: 'Pods' },
  { type: 'deployment', label: 'Deployments' },
  { type: 'cronjob', label: 'CronJobs' },
  { type: 'service', label: 'Services' },
  { type: 'configmap', label: 'ConfigMaps' },
  { type: 'secret', label: 'Secrets' },
];

export function LoadingProgress({ loadingStates }: LoadingProgressProps) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>Fetching resources...</div>
      <div style={styles.list}>
        {DISPLAY_TYPES.map(({ type, label }) => {
          const state = loadingStates[type];
          return (
            <div key={type} style={styles.row}>
              <span style={styles.icon}>
                {state.status === 'pending' && <span style={styles.pending}>○</span>}
                {state.status === 'loading' && <span style={styles.spinner}>⟳</span>}
                {state.status === 'success' && <span style={styles.success}>✓</span>}
                {state.status === 'error' && <span style={styles.error}>✗</span>}
              </span>
              <span style={styles.label}>{label}</span>
              <span style={styles.info}>
                {state.status === 'success' && (
                  <>
                    {state.count} items
                    {state.duration !== undefined && (
                      <span style={styles.timing}> ({(state.duration / 1000).toFixed(1)}s)</span>
                    )}
                  </>
                )}
                {state.status === 'error' && (
                  <span style={styles.errorText}>{state.error}</span>
                )}
                {state.status === 'loading' && '...'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    fontFamily: 'monospace',
  },
  header: {
    fontSize: '12px',
    color: '#cccccc',
    marginBottom: '12px',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
  },
  icon: {
    width: '16px',
    textAlign: 'center',
  },
  pending: {
    color: '#6e6e6e',
  },
  spinner: {
    color: '#cccccc',
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
  },
  success: {
    color: '#4ec9b0',
  },
  error: {
    color: '#f14c4c',
  },
  label: {
    color: '#cccccc',
    minWidth: '100px',
  },
  info: {
    color: '#858585',
  },
  timing: {
    color: '#6e6e6e',
  },
  errorText: {
    color: '#f14c4c',
  },
};
```

**Step 2: Add CSS keyframes for spinner animation**

Create a style tag in the component or add to index.css. For simplicity, add useEffect to inject keyframes:

Update the component to add this at the top (after imports):

```typescript
// Inject spinner animation keyframes
if (typeof document !== 'undefined') {
  const styleId = 'loading-progress-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compilation

**Step 4: Commit new component**

```bash
git add src/components/resource-panel/LoadingProgress.tsx
git commit -m "feat: add LoadingProgress component"
```

---

### Task 5: Integrate LoadingProgress into ResourcePanel

**Files:**
- Modify: `src/components/resource-panel/ResourcePanel.tsx`

**Step 1: Add import for LoadingProgress**

Add after existing imports (around line 4):

```typescript
import { LoadingProgress } from './LoadingProgress';
```

**Step 2: Extract loadingStates from context**

Update the useResourceCache destructuring (around line 52):

```typescript
const { filterByNamespaces, filterByType, isLoading, loadingStates, refresh, refreshType } = useResourceCache();
```

**Step 3: Replace Loading... with LoadingProgress**

Find the loading render (around line 256-257):

```tsx
{isLoading ? (
  <div style={styles.loading}>Loading...</div>
) : sortedResources.length === 0 ? (
```

Replace with:

```tsx
{isLoading ? (
  <LoadingProgress loadingStates={loadingStates} />
) : sortedResources.length === 0 ? (
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: Clean compilation

**Step 5: Test the application**

Run: `npm run dev`
- Open the app
- Select a resource type to open ResourcePanel
- Should see progress list during initial load

**Step 6: Commit integration**

```bash
git add src/components/resource-panel/ResourcePanel.tsx
git commit -m "feat: integrate LoadingProgress into ResourcePanel"
```

---

### Task 6: Final Verification and Cleanup

**Step 1: Run full type check**

Run: `npx tsc --noEmit`
Expected: Clean compilation

**Step 2: Test complete flow**

Run: `npm run dev`
- Clear browser cache/localStorage
- Open app fresh
- Open ResourcePanel for any resource type
- Verify:
  - Progress list appears with spinner icons
  - Items update to checkmarks with counts as they complete
  - Timing shows in seconds (e.g., "1.2s")
  - After all complete, resource table appears

**Step 3: Test error handling**

- Disconnect network or use invalid context
- Verify error states show ✗ with error message

**Step 4: Create final commit (if any cleanup needed)**

```bash
git status
# If clean, skip this step
# If changes needed:
git add -A
git commit -m "chore: cleanup verbose loading implementation"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add ResourceLoadingState type | ResourceCacheContext.tsx |
| 2 | Add loadingStates state + derived isLoading | ResourceCacheContext.tsx |
| 3 | Modify fetchResources for per-type tracking | ResourceCacheContext.tsx |
| 4 | Create LoadingProgress component | LoadingProgress.tsx (new) |
| 5 | Integrate LoadingProgress into ResourcePanel | ResourcePanel.tsx |
| 6 | Final verification | - |
