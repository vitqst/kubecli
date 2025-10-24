# Resource Action System

This directory contains the **extensible, SOLID-compliant resource action system** for the Kubernetes CLI Manager.

## Architecture Overview

The system follows **SOLID principles** with complete separation of concerns:

```
src/resources/
├── types.ts           # Base types and interfaces (no implementations)
├── index.ts           # Resource registry (auto-discovery)
├── pod.ts             # Pod resource definition (independent)
├── deployment.ts      # Deployment resource definition (independent)
├── cronjob.ts         # CronJob resource definition (independent)
├── service.ts         # Service resource definition (independent)
└── README.md          # This file
```

## SOLID Principles Applied

### ✅ Single Responsibility Principle (SRP)
- Each resource file has **one responsibility**: define actions for that resource type
- `pod.ts` only knows about pods, `deployment.ts` only knows about deployments
- No cross-resource dependencies

### ✅ Open/Closed Principle (OCP)
- **Open for extension**: Add new resources by creating a new file
- **Closed for modification**: Existing resources don't need changes
- Registry automatically discovers new resources

### ✅ Liskov Substitution Principle (LSP)
- All resources implement the same `ResourceDefinition` interface
- Any resource can be used interchangeably through the registry
- Actions follow the same `ResourceAction` interface

### ✅ Interface Segregation Principle (ISP)
- Resources only implement what they need
- Actions are defined independently
- No forced dependencies on unused functionality

### ✅ Dependency Inversion Principle (DIP)
- Components depend on abstractions (`ResourceDefinition`, `ResourceAction`)
- Not on concrete implementations
- Registry provides the abstraction layer

## How to Add a New Resource

Adding a new resource type is **simple and independent**:

### Step 1: Create Resource File

Create `src/resources/statefulset.ts`:

```typescript
import { ResourceDefinition, ResourceAction } from './types';

const viewAction: ResourceAction = {
  id: 'view',
  label: 'View',
  icon: '👁️',
  description: 'View statefulset YAML',
  getCommand: (ctx) => `kubectl get statefulset ${ctx.resourceName} -n ${ctx.namespace} -o yaml\n`,
};

const scaleAction: ResourceAction = {
  id: 'scale',
  label: 'Scale',
  icon: '📊',
  description: 'Scale replicas',
  getCommand: (ctx) => `kubectl scale statefulset ${ctx.resourceName} -n ${ctx.namespace} --replicas=\n`,
};

// Add more actions as needed...

export const statefulsetResource: ResourceDefinition = {
  type: 'statefulset',
  displayName: 'StatefulSet',
  pluralName: 'StatefulSets',
  getActions: () => [
    viewAction,
    scaleAction,
    // ... more actions
  ],
};
```

### Step 2: Register in Index

Update `src/resources/index.ts`:

```typescript
import { statefulsetResource } from './statefulset';

const RESOURCES: ResourceDefinition[] = [
  podResource,
  deploymentResource,
  cronjobResource,
  serviceResource,
  statefulsetResource,  // ← Add here
];
```

### Step 3: Add Type (Optional)

If it's a completely new resource type, add to `src/resources/types.ts`:

```typescript
export type ResourceType = 
  | 'pod' 
  | 'deployment' 
  | 'service' 
  | 'job' 
  | 'cronjob' 
  | 'statefulset'  // ← Add here
  | 'daemonset';
```

**That's it!** The system automatically picks up the new resource.

## How to Add Actions to Existing Resources

Simply edit the resource file (e.g., `pod.ts`):

```typescript
const debugAction: ResourceAction = {
  id: 'debug',
  label: 'Debug',
  icon: '🐛',
  description: 'Debug pod with ephemeral container',
  getCommand: (ctx) => `kubectl debug ${ctx.resourceName} -n ${ctx.namespace} -it --image=busybox\n`,
};

export const podResource: ResourceDefinition = {
  type: 'pod',
  displayName: 'Pod',
  pluralName: 'Pods',
  getActions: () => [
    viewAction,
    describeAction,
    // ... existing actions
    debugAction,  // ← Add new action
  ],
};
```

## Usage in Components

### Get Available Actions

```typescript
import { getAvailableActions } from '../resources';

const actions = getAvailableActions('pod', {
  resourceName: 'my-pod',
  namespace: 'default',
  resourceType: 'pod',
});

// Render buttons
actions.map(action => (
  <button onClick={() => handleAction(action.id)}>
    {action.icon} {action.label}
  </button>
));
```

### Execute Action

```typescript
import { executeResourceAction } from '../resources';

const command = executeResourceAction('logs', {
  resourceName: 'my-pod',
  namespace: 'default',
  resourceType: 'pod',
});

if (command) {
  terminal.write(command);
}
```

## Benefits of This Architecture

### 🎯 Maintainability
- Each resource is in its own file
- Easy to find and modify
- No risk of breaking other resources

### 🚀 Scalability
- Add unlimited resources without touching existing code
- No central configuration file that grows forever
- Registry auto-discovers everything

### 🧪 Testability
- Test each resource independently
- Mock the registry for component tests
- No complex dependencies

### 📚 Discoverability
- New developers can easily find resource definitions
- Clear file structure
- Self-documenting code

### 🔒 Type Safety
- Full TypeScript support
- Compile-time checks
- IDE autocomplete

## Examples

### Current Resources

- **Pod** (`pod.ts`): View, Describe, Edit, Exec, Logs, Port Forward, Events, Top, Delete
- **Deployment** (`deployment.ts`): View, Describe, Edit, Logs, Scale, Restart, Rollout Status, History, Events, Delete
- **CronJob** (`cronjob.ts`): View, Describe, Edit, Trigger, Suspend, Resume, Events, Delete
- **Service** (`service.ts`): View, Describe, Edit, Endpoints, Port Forward, Events, Delete

### Future Resources (Easy to Add)

- **StatefulSet**: Scale, Restart, Partition Update, etc.
- **DaemonSet**: Restart, Update Strategy, etc.
- **ConfigMap**: View, Edit, Delete
- **Secret**: View, Edit, Delete (with masking)
- **Ingress**: View, Edit, Describe, Delete
- **PersistentVolumeClaim**: View, Describe, Delete
- **Job**: Logs, Delete, Suspend

## Migration from Old System

The old system (`src/common/resourceActions.ts`) had all resources in one file:
- ❌ Hard to maintain (400+ lines)
- ❌ Tight coupling between resources
- ❌ Risk of breaking changes
- ❌ Difficult to test

The new system is:
- ✅ Modular (each resource ~100 lines)
- ✅ Independent files
- ✅ Safe to modify
- ✅ Easy to test

## Best Practices

1. **Keep actions simple**: One action = one kubectl command
2. **Use descriptive IDs**: `rollout-status` not `rs`
3. **Add helpful descriptions**: Users see these as tooltips
4. **Use appropriate icons**: Visual cues help users
5. **Consider isAvailable**: Hide actions that don't make sense
6. **Test your commands**: Ensure kubectl syntax is correct

## Questions?

- See `types.ts` for interface definitions
- See `pod.ts` for a complete example
- See `index.ts` for registry implementation
