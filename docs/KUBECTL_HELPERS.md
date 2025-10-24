# kubectl Helper Functions

This document explains the kubectl helper functions used in resource action definitions.

## Problem

Different resources handle namespaces differently:

1. **Most resources**: Namespace passed explicitly via `-n` flag
   - Example: `kubectl get pod my-pod -n default`

2. **Some resources**: Namespace embedded in resource name
   - Example: CronJobs stored as `"namespace/cronjob-name"`
   - Command: `kubectl get cronjob namespace/cronjob-name`

## Solution: Helper Functions

We provide two helper functions in `src/resources/types.ts`:

### `kubectl(namespace, command)`

Use for resources that need explicit `-n namespace` flag.

**Usage:**
```typescript
import { kubectl } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  getCommand: (ctx) => kubectl(ctx.namespace, `get pod ${ctx.resourceName} -o yaml\n`),
};
```

**Generated command:**
```bash
kubectl -n default get pod my-pod -o yaml
```

### `kubectlWithNs(command)`

Use for resources where namespace is already in the resource name.

**Usage:**
```typescript
import { kubectlWithNs } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  getCommand: (ctx) => kubectlWithNs(`get cronjob ${ctx.resourceName} -o yaml\n`),
};
```

**Generated command:**
```bash
kubectl get cronjob namespace/cronjob-name -o yaml
```

## When to Use Which

### Use `kubectl(namespace, command)` for:
- ✅ **Pods** - `kubectl -n default get pod my-pod`
- ✅ **Deployments** - `kubectl -n default get deployment my-deployment`
- ✅ **Services** - `kubectl -n default get service my-service`
- ✅ **StatefulSets** - `kubectl -n default get statefulset my-statefulset`
- ✅ **DaemonSets** - `kubectl -n default get daemonset my-daemonset`
- ✅ **ConfigMaps** - `kubectl -n default get configmap my-configmap`
- ✅ **Secrets** - `kubectl -n default get secret my-secret`

### Use `kubectlWithNs(command)` for:
- ✅ **CronJobs** - When stored as `"namespace/name"` format
- ✅ Any resource where namespace is embedded in the identifier

## Benefits

### 1. **Consistency**
All resources use the same pattern - just pick the right helper.

### 2. **Maintainability**
If kubectl command format changes, update in one place.

### 3. **Readability**
Clear intent: `kubectl()` vs `kubectlWithNs()` tells you how namespace is handled.

### 4. **No Hardcoding**
Namespace handling is abstracted, not hardcoded in each action.

### 5. **Type Safety**
TypeScript ensures you pass the right parameters.

## Examples

### Pod Actions (Standard Namespace)

```typescript
import { kubectl } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  getCommand: (ctx) => kubectl(ctx.namespace, `get pod ${ctx.resourceName} -o yaml\n`),
};

const deleteAction: ResourceAction = {
  id: 'delete',
  getCommand: (ctx) => kubectl(ctx.namespace, `delete pod ${ctx.resourceName}\n`),
};

const logsAction: ResourceAction = {
  id: 'logs',
  getCommand: (ctx) => kubectl(ctx.namespace, `logs ${ctx.resourceName} --tail=200 -f\n`),
};
```

### CronJob Actions (Embedded Namespace)

```typescript
import { kubectlWithNs } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  getCommand: (ctx) => kubectlWithNs(`get cronjob ${ctx.resourceName} -o yaml\n`),
};

const editAction: ResourceAction = {
  id: 'edit',
  getCommand: (ctx) => kubectlWithNs(`edit cronjob ${ctx.resourceName}\n`),
};

const suspendAction: ResourceAction = {
  id: 'suspend',
  getCommand: (ctx) => kubectlWithNs(`patch cronjob ${ctx.resourceName} -p '{"spec":{"suspend":true}}'\n`),
};
```

## Migration Guide

### Before (Hardcoded)

```typescript
getCommand: (ctx) => `kubectl get pod ${ctx.resourceName} -n ${ctx.namespace} -o yaml\n`
```

### After (Using Helper)

```typescript
getCommand: (ctx) => kubectl(ctx.namespace, `get pod ${ctx.resourceName} -o yaml\n`)
```

## Implementation Details

```typescript
// src/resources/types.ts

/**
 * Helper for resources with explicit namespace flag
 */
export function kubectl(namespace: string, command: string): string {
  return `kubectl -n ${namespace} ${command}`;
}

/**
 * Helper for resources with embedded namespace
 */
export function kubectlWithNs(command: string): string {
  return `kubectl ${command}`;
}
```

## Future Enhancements

Possible future additions:

1. **Context helper**: `kubectlWithContext(context, namespace, command)`
2. **Output format helper**: `kubectlJson()`, `kubectlYaml()`
3. **Dry-run helper**: `kubectlDryRun()`
4. **Watch helper**: `kubectlWatch()`

## Best Practices

1. ✅ **Always use helpers** - Don't hardcode `kubectl` commands
2. ✅ **Import at top** - `import { kubectl, kubectlWithNs } from './types'`
3. ✅ **Document special cases** - Add comments for unusual namespace handling
4. ✅ **Test commands** - Verify generated commands work correctly
5. ✅ **Be consistent** - All actions in a resource should use the same helper

## Troubleshooting

### Command not working?

**Check namespace handling:**
```typescript
// Wrong - namespace in both places
kubectlWithNs(`get pod ${ctx.resourceName} -n ${ctx.namespace}\n`)

// Right - pick one approach
kubectl(ctx.namespace, `get pod ${ctx.resourceName}\n`)
// OR
kubectlWithNs(`get pod ${ctx.resourceName}\n`)  // if namespace is in resourceName
```

### Resource name format?

**Check how resource is stored:**
```typescript
// If stored as "my-pod" → use kubectl()
kubectl(ctx.namespace, `get pod ${ctx.resourceName}\n`)

// If stored as "namespace/my-cronjob" → use kubectlWithNs()
kubectlWithNs(`get cronjob ${ctx.resourceName}\n`)
```

## Summary

- **`kubectl(namespace, command)`** - Standard resources with `-n` flag
- **`kubectlWithNs(command)`** - Resources with embedded namespace
- **Consistent, maintainable, type-safe** approach to kubectl commands
- **Easy to extend** for future needs
