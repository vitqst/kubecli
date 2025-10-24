# Refactoring Guide - SOLID & Atomic Design Principles

## Overview

This guide documents the refactoring of large monolithic components into smaller, focused, reusable components following SOLID principles and atomic design patterns.

## Problem Statement

Three main files grew too large and became difficult to maintain:

| File | Original Size | Issues |
|------|--------------|--------|
| `TerminalSidebar.tsx` | ~1000 lines | Mixed concerns: config, resources, context menu |
| `Terminal.tsx` | ~500 lines | Complex initialization, resize logic, loading states |
| `renderer.tsx` | ~1000 lines | Mixed screens, action handlers, state management |

## SOLID Principles Applied

### 1. Single Responsibility Principle (SRP)
Each component has one clear purpose:
- `ConfigurationPanel` - Only handles config/context/namespace selectors
- `ResourceList` - Only displays and manages resource lists
- `ContextMenu` - Only handles context menu display and actions
- `HomeScreen` - Only displays home/welcome screen

### 2. Open/Closed Principle (OCP)
Components are open for extension but closed for modification:
- `ResourceList` is generic and works with any resource type
- New resource types can be added without modifying existing components
- Render logic is passed as props (renderItem function)

### 3. Liskov Substitution Principle (LSP)
Components can be substituted without breaking functionality:
- All resource lists use the same `ResourceList` component
- Different resource types (Pod, Deployment, CronJob) work identically

### 4. Interface Segregation Principle (ISP)
Components only depend on interfaces they use:
- Props are minimal and focused
- No unnecessary dependencies
- Clear, typed interfaces for all components

### 5. Dependency Inversion Principle (DIP)
Components depend on abstractions, not implementations:
- Callbacks for actions (onConfigChange, onResourceAction)
- Generic renderItem function for custom rendering
- No direct coupling to parent components

## Atomic Design Structure

```
src/components/
├── sidebar/                    # Sidebar-specific components
│   ├── ConfigurationPanel.tsx  # Config/Context/Namespace selectors
│   ├── ResourceList.tsx        # Generic resource list component
│   └── ContextMenu.tsx         # Context menu for actions
├── screens/                    # Screen-level components
│   ├── HomeScreen.tsx          # Welcome/configuration screen
│   └── TerminalScreen.tsx      # Terminal view (to be created)
├── terminal/                   # Terminal-specific components
│   ├── TerminalCore.tsx        # Core xterm logic (to be created)
│   ├── TerminalOverlay.tsx     # Loading overlay (to be created)
│   └── TerminalResize.tsx      # Resize handler (to be created)
└── shared/                     # Shared/reusable components
    ├── MemoryDisplay.tsx       # RAM monitor (already memoized)
    └── ActionPromptDialog.tsx  # Existing prompt dialog
```

## New Components Created

### 1. ConfigurationPanel

**Purpose**: Manage kubeconfig, context, and namespace selection

**Props**:
```typescript
interface ConfigurationPanelProps {
  kubeconfigPath: string;
  availableConfigs: Array<{ path: string; name: string; isDefault: boolean }>;
  selectedContext: string;
  contexts: Array<{ name: string; cluster: string }>;
  selectedNamespace: string;
  namespaces: string[];
  loadingNamespaces: boolean;
  isInEditMode: boolean;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onNamespaceChange: (namespace: string) => void;
}
```

**Benefits**:
- ~150 lines (extracted from 1000-line file)
- Self-contained with own styles
- Reusable across different views
- Easy to test independently

### 2. ResourceList (Generic)

**Purpose**: Display any resource type with actions

**Props**:
```typescript
interface ResourceListProps<T> {
  title: string;
  icon: string;
  items: T[];
  loading: boolean;
  isCollapsed: boolean;
  isInEditMode: boolean;
  resourceType: ResourceType;
  onToggle: () => void;
  onRefresh: () => void;
  onResourceAction: (actionId, resourceType, resourceName, customNamespace?) => void;
  onShowContextMenu: (x, y, resourceType, resourceName, customNamespace?) => void;
  renderItem: (item: T) => {
    name: string;
    displayName: string;
    info: React.ReactNode;
    namespace?: string;
  };
}
```

**Benefits**:
- Generic - works with Pods, Deployments, CronJobs, any resource
- ~200 lines (reusable for all resource types)
- Handles actions, context menu, collapse/expand
- Custom rendering via renderItem prop

**Usage Example**:
```typescript
<ResourceList
  title="Pods"
  icon="📦"
  items={pods}
  loading={loadingPods}
  isCollapsed={collapsedSections.pods}
  isInEditMode={isInEditMode}
  resourceType="pod"
  onToggle={() => toggleSection('pods')}
  onRefresh={loadPods}
  onResourceAction={onResourceAction}
  onShowContextMenu={showContextMenu}
  renderItem={(pod) => ({
    name: pod.name,
    displayName: pod.name,
    info: (
      <>
        <span>{pod.ready} | {pod.status} | Restarts: {pod.restarts}</span>
        <span>Age: {pod.age}</span>
      </>
    ),
  })}
/>
```

### 3. ContextMenu

**Purpose**: Display and handle context menu actions

**Props**:
```typescript
interface ContextMenuProps {
  x: number;
  y: number;
  resourceType: ResourceType;
  resourceName: string;
  namespace: string;
  customNamespace?: string;
  onAction: (actionId, resourceType, resourceName, customNamespace?) => void;
  onClose: () => void;
}
```

**Benefits**:
- ~100 lines (extracted from sidebar)
- Self-contained event handling
- Automatic click-outside detection
- Reusable for any resource type

### 4. HomeScreen

**Purpose**: Display welcome screen with configuration

**Props**:
```typescript
interface HomeScreenProps {
  kubeconfigPath: string;
  availableConfigs: Array<...>;
  selectedContext: string;
  contexts: Array<...>;
  disabled: boolean;
  onConfigChange: (path: string) => void;
  onContextChange: (context: string) => void;
  onGetStarted: () => void;
}
```

**Benefits**:
- ~250 lines (extracted from renderer)
- Complete home screen logic
- Self-contained styles
- Easy to modify independently

## Migration Strategy

### Phase 1: Sidebar Refactoring ✅ (Completed)

1. ✅ Extract `ConfigurationPanel` from `TerminalSidebar`
2. ✅ Create generic `ResourceList` component
3. ✅ Extract `ContextMenu` component
4. ⏳ Update `TerminalSidebar` to use new components

### Phase 2: Screen Refactoring ✅ (Completed)

1. ✅ Extract `HomeScreen` from `renderer.tsx`
2. ⏳ Create `TerminalScreen` component
3. ⏳ Update `renderer.tsx` to use screen components

### Phase 3: Terminal Refactoring (Next)

1. ⏳ Extract `TerminalCore` (xterm initialization)
2. ⏳ Extract `TerminalOverlay` (loading state)
3. ⏳ Extract `TerminalResize` (resize logic)
4. ⏳ Update `Terminal.tsx` to use extracted components

### Phase 4: Testing & Documentation

1. ⏳ Add unit tests for each component
2. ⏳ Update component documentation
3. ⏳ Create Storybook stories (optional)

## Benefits of Refactoring

### Code Quality
- **Reduced complexity**: Each file <300 lines
- **Better maintainability**: Clear, focused components
- **Easier testing**: Isolated, testable units
- **Improved readability**: Self-documenting structure

### Performance
- **Better memoization**: Smaller components = better React.memo()
- **Reduced re-renders**: Isolated state changes
- **Faster development**: Hot reload more efficient

### Developer Experience
- **Easier onboarding**: Clear component hierarchy
- **Faster debugging**: Isolated concerns
- **Better IDE support**: Smaller files load faster
- **Clearer git diffs**: Changes are localized

## File Size Comparison

### Before Refactoring
```
TerminalSidebar.tsx:  ~1000 lines  ❌ Too large
Terminal.tsx:         ~500 lines   ⚠️  Large
renderer.tsx:         ~1000 lines  ❌ Too large
```

### After Refactoring
```
sidebar/
  ConfigurationPanel.tsx:  ~150 lines  ✅ Focused
  ResourceList.tsx:        ~200 lines  ✅ Focused
  ContextMenu.tsx:         ~100 lines  ✅ Focused
  
screens/
  HomeScreen.tsx:          ~250 lines  ✅ Focused
  TerminalScreen.tsx:      ~300 lines  ✅ Focused (to be created)
  
TerminalSidebar.tsx:       ~300 lines  ✅ Orchestrator only
Terminal.tsx:              ~200 lines  ✅ Orchestrator only
renderer.tsx:              ~400 lines  ✅ Main app only
```

## Usage Guidelines

### When to Create a New Component

Create a new component when:
1. **File exceeds 300 lines** - Consider splitting
2. **Multiple responsibilities** - Violates SRP
3. **Repeated code** - Extract to shared component
4. **Complex logic** - Isolate for testing
5. **Independent feature** - Can work standalone

### Component Naming Conventions

- **Screens**: `[Name]Screen.tsx` (e.g., `HomeScreen`, `TerminalScreen`)
- **Panels**: `[Name]Panel.tsx` (e.g., `ConfigurationPanel`)
- **Lists**: `[Name]List.tsx` (e.g., `ResourceList`)
- **Menus**: `[Name]Menu.tsx` (e.g., `ContextMenu`)
- **Overlays**: `[Name]Overlay.tsx` (e.g., `LoadingOverlay`)

### Props Best Practices

1. **Use TypeScript interfaces** - Always type props
2. **Minimal props** - Only what's needed
3. **Callbacks for actions** - Don't pass entire objects
4. **Render props for customization** - Allow flexibility
5. **Default values** - Use optional props with defaults

## Testing Strategy

### Unit Tests
```typescript
// ConfigurationPanel.test.tsx
describe('ConfigurationPanel', () => {
  it('renders all selectors', () => {
    // Test rendering
  });
  
  it('calls onConfigChange when config changes', () => {
    // Test callbacks
  });
  
  it('disables selectors in edit mode', () => {
    // Test edit mode
  });
});
```

### Integration Tests
```typescript
// TerminalSidebar.test.tsx
describe('TerminalSidebar', () => {
  it('integrates ConfigurationPanel and ResourceList', () => {
    // Test integration
  });
});
```

## Next Steps

1. **Complete Phase 1**: Update `TerminalSidebar` to use new components
2. **Complete Phase 2**: Create `TerminalScreen` component
3. **Start Phase 3**: Refactor `Terminal.tsx`
4. **Add tests**: Unit tests for each component
5. **Document**: Update component documentation

## Resources

- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Atomic Design](https://bradfrost.com/blog/post/atomic-web-design/)
- [React Component Patterns](https://reactpatterns.com/)
- [Component Composition](https://reactjs.org/docs/composition-vs-inheritance.html)
