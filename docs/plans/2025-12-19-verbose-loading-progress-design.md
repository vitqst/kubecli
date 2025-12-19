# Verbose Loading Progress for ResourcePanel

## Problem

The first load of ResourcePanel is slow because it fetches 6 resource types via parallel kubectl commands. The current UI shows only "Loading..." with no visibility into what's happening behind the scenes.

## Solution

Replace the static "Loading..." text with a progress list showing per-resource-type status, counts, and timing.

## Visual Design

```
┌─────────────────────────────────────────┐
│  Fetching resources...                  │
│                                         │
│  ✓ Pods: 342 items (1.2s)              │
│  ✓ Deployments: 28 items (0.8s)        │
│  ⟳ CronJobs...                         │
│  ⟳ Services...                         │
│  ○ ConfigMaps                          │
│  ○ Secrets                             │
└─────────────────────────────────────────┘
```

**Status icons:**
- `○` (gray circle) - pending (waiting to start)
- `⟳` (spinning) - loading (in progress, CSS animation)
- `✓` (green checkmark) - success
- `✗` (red X) - error with inline message

## Data Model

New type for per-resource loading state:

```typescript
interface ResourceLoadingState {
  status: 'pending' | 'loading' | 'success' | 'error';
  count?: number;       // Number of items fetched
  duration?: number;    // Time in milliseconds
  error?: string;       // Error message if failed
}
```

Add to ResourceCacheContext:

```typescript
const [loadingStates, setLoadingStates] = useState<Record<ResourceType, ResourceLoadingState>>({
  pod: { status: 'pending' },
  deployment: { status: 'pending' },
  cronjob: { status: 'pending' },
  service: { status: 'pending' },
  configmap: { status: 'pending' },
  secret: { status: 'pending' },
});
```

## Fetch Logic Changes

Modify `fetchResources` to track individual completions:

```typescript
const fetchResources = useCallback(async () => {
  // Reset all to loading
  setLoadingStates({
    pod: { status: 'loading' },
    deployment: { status: 'loading' },
    cronjob: { status: 'loading' },
    service: { status: 'loading' },
    configmap: { status: 'loading' },
    secret: { status: 'loading' },
  });

  const fetchOne = async (type: ResourceType, command: string) => {
    const start = Date.now();
    try {
      const result = await kube.runCommand(selectedContext, command);
      const duration = Date.now() - start;
      const resources = processJsonOutput(result.stdout, type);

      // Update this type's state immediately
      setLoadingStates(prev => ({
        ...prev,
        [type]: { status: 'success', count: resources.length, duration }
      }));

      return resources;
    } catch (err) {
      setLoadingStates(prev => ({
        ...prev,
        [type]: { status: 'error', error: err.message }
      }));
      return [];
    }
  };

  // Run all in parallel, each updates its own state on completion
  const results = await Promise.all([
    fetchOne('pod', 'get pods -A -o json'),
    fetchOne('deployment', 'get deployments -A -o json'),
    fetchOne('cronjob', 'get cronjobs -A -o json'),
    fetchOne('service', 'get services -A -o json'),
    fetchOne('configmap', 'get configmaps -A -o json'),
    fetchOne('secret', 'get secrets -A -o json'),
  ]);

  // Merge all results into resources state
  setResources(results.flat());
}, [selectedContext]);
```

## New Component: LoadingProgress

Create `src/components/resource-panel/LoadingProgress.tsx`:

```typescript
interface LoadingProgressProps {
  loadingStates: Record<ResourceType, ResourceLoadingState>;
}

export function LoadingProgress({ loadingStates }: LoadingProgressProps) {
  // Render progress list with status icons, counts, and timing
}
```

## ResourcePanel Integration

Replace the loading state render:

```tsx
// Before
{isLoading ? (
  <div style={styles.loading}>Loading...</div>
) : ...}

// After
{isLoading ? (
  <LoadingProgress loadingStates={loadingStates} />
) : ...}
```

Derive `isLoading` from `loadingStates`:

```typescript
const isLoading = useMemo(() =>
  Object.values(loadingStates).some(s => s.status === 'loading'),
  [loadingStates]
);
```

## File Changes

| File | Change |
|------|--------|
| `src/contexts/ResourceCacheContext.tsx` | Add `ResourceLoadingState` type, `loadingStates` state, update `fetchResources` |
| `src/components/resource-panel/LoadingProgress.tsx` | New component (~80 lines) |
| `src/components/resource-panel/ResourcePanel.tsx` | Import and use `<LoadingProgress />` |

## User Experience

1. Open ResourcePanel → See progress list with all types as "loading" (spinner)
2. As each kubectl completes → That row updates to ✓ with count and timing
3. If any fails → That row shows ✗ with error message
4. All complete → Progress list disappears, resources table appears

## Non-Breaking

- Existing `isLoading` boolean remains (derived from `loadingStates`)
- Existing filter/search/sort behavior unchanged
- Cached resources behavior unchanged
