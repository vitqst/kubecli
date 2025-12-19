# Dynamic Columns for ResourcePanel

## Overview

Replace the hardcoded Name/Namespace/Actions columns in ResourcePanel with dynamic columns defined per resource type, matching standard kubectl output.

## Design Decisions

- **Column config**: Defined as const in each resource file (pod.ts, deployment.ts, etc.)
- **Data fetching**: Use kubectl JSON paths with `-o custom-columns`
- **Display**: CSS grid with `fr` units for flexible ratios
- **Actions column**: Removed (context menu still available via right-click)
- **Namespace**: Always visible

## Column Definition Structure

```typescript
interface ColumnDefinition {
  key: string;           // unique identifier
  label: string;         // header text
  path: string;          // kubectl JSON path
  flex: number;          // CSS grid fr value
  transform?: (value: any) => string;  // optional formatter
}
```

Example for pods:

```typescript
export const columns: ColumnDefinition[] = [
  { key: 'name', label: 'NAME', path: '.metadata.name', flex: 2 },
  { key: 'namespace', label: 'NAMESPACE', path: '.metadata.namespace', flex: 1 },
  { key: 'ready', label: 'READY', path: '.status.containerStatuses', flex: 0.5,
    transform: (val) => `${val?.filter(c => c.ready).length}/${val?.length}` },
  { key: 'status', label: 'STATUS', path: '.status.phase', flex: 0.5 },
  { key: 'restarts', label: 'RESTARTS', path: '.status.containerStatuses[0].restartCount', flex: 0.5 },
  { key: 'age', label: 'AGE', path: '.metadata.creationTimestamp', flex: 0.5, transform: formatAge },
];
```

## CachedResource Changes

```typescript
// New structure
export interface CachedResource {
  type: ResourceType;
  name: string;
  namespace: string;
  columns: Record<string, any>;  // raw column values
}
```

## Files to Modify

1. `src/resources/types.ts` - Add ColumnDefinition interface
2. `src/resources/pod.ts` - Define pod columns
3. `src/resources/deployment.ts` - Define deployment columns
4. `src/resources/cronjob.ts` - Define cronjob columns
5. `src/resources/service.ts` - Define service columns
6. `src/resources/configmap.ts` - Define configmap columns
7. `src/resources/secret.ts` - Define secret columns
8. `src/contexts/ResourceCacheContext.tsx` - Update interface and fetch logic
9. `src/components/resource-panel/ResourcePanel.tsx` - Dynamic column rendering
