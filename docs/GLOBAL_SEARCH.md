# Global Resource Search

## Overview

A powerful global search feature that allows you to quickly find and access any Kubernetes resource across all namespaces without navigating through individual resource sections.

## Features

### 1. Search Across All Resources
- **Pods** - Search all pods in all namespaces
- **Deployments** - Search all deployments in all namespaces
- **CronJobs** - Search all cronjobs in all namespaces

### 2. Pre-fetching
- Resources are fetched on-demand when you start typing
- Fast search through cached results
- No need to expand individual sections

### 3. Smart Filtering
- Search by **resource name**
- Search by **namespace**
- Case-insensitive matching
- Real-time results as you type

### 4. Quick Actions
- **Action buttons** on each result for instant access
- **Favorite actions** shown for each resource type:
  - **Pods**: View, Exec, Logs
  - **Deployments**: View, Edit, Logs
  - **CronJobs**: View, Edit
- Click any action button to execute immediately
- Opens resource in terminal with correct namespace

## Usage

### Basic Search

1. **Open Terminal View**
   - Navigate to the terminal screen
   - Look for the search box at the top of the sidebar

2. **Start Typing**
   ```
   🔍 Search all resources...
   ```
   - Type any part of a resource name or namespace
   - Results appear automatically after 300ms

3. **Select Result**
   - Click on any result to view it
   - The resource will be displayed in the terminal

### Search Examples

**Search by name:**
```
nginx
```
Finds: `nginx-deployment`, `nginx-pod-123`, etc.

**Search by namespace:**
```
kube-system
```
Finds all resources in the `kube-system` namespace

**Partial match:**
```
app
```
Finds: `my-app`, `app-server`, `webapp`, etc.

## UI Components

### Search Box
```
┌─────────────────────────────────┐
│ 🔍 Search all resources...   ✕ │
└─────────────────────────────────┘
```

- **Input field**: Type your search query
- **Clear button (✕)**: Clear search and close results

### Results Dropdown
```
┌─────────────────────────────────────────┐
│ 3 RESULTS FOUND                         │
├─────────────────────────────────────────┤
│ nginx-deployment                        │
│ default | Deployment | 3/3              │
│ [👁 View] [✏️ Edit] [📋 Logs]           │
├─────────────────────────────────────────┤
│ nginx-pod-abc123                        │
│ default | Pod | Running                 │
│ [👁 View] [⚡ Exec] [📋 Logs]           │
├─────────────────────────────────────────┤
│ backup-cronjob                          │
│ kube-system | CronJob | 0 * * *         │
│ [👁 View] [✏️ Edit]                     │
└─────────────────────────────────────────┘
```

- **Result count**: Shows number of matches
- **Resource name**: Primary identifier (white text)
- **Namespace**: Shown in teal color
- **Resource type & info**: Additional context
- **Action buttons**: Quick access to favorite actions

## Implementation Details

### Architecture

```typescript
GlobalSearch Component
  ├── Search Input (debounced)
  ├── fetchAllResources() - Pre-fetch from kubectl
  ├── performSearch() - Filter cached results
  └── Results Dropdown
      └── Click → onSelectResult → View action
```

### Data Flow

1. **User types** → Debounced (300ms)
2. **Fetch resources** → kubectl commands
3. **Parse results** → Extract name, namespace, info
4. **Filter** → Match against query
5. **Display** → Show up to 20 results
6. **Click** → Execute view action

### Performance

- **Debouncing**: 300ms delay prevents excessive searches
- **Result limit**: Maximum 20 results shown
- **Efficient parsing**: Uses custom-columns (no JSON)
- **Cached results**: Search through fetched data

### kubectl Commands Used

**Pods:**
```bash
kubectl get pods -A --no-headers -o custom-columns=\
NAMESPACE:.metadata.namespace,\
NAME:.metadata.name,\
STATUS:.status.phase,\
READY:.status.containerStatuses[*].ready
```

**Deployments:**
```bash
kubectl get deployments -A --no-headers -o custom-columns=\
NAMESPACE:.metadata.namespace,\
NAME:.metadata.name,\
READY:.status.readyReplicas,\
DESIRED:.spec.replicas
```

**CronJobs:**
```bash
kubectl get cronjobs -A --no-headers -o custom-columns=\
NAMESPACE:.metadata.namespace,\
NAME:.metadata.name,\
SCHEDULE:.spec.schedule
```

## Color Scheme

| Element | Color | Hex Code | Purpose |
|---------|-------|----------|---------|
| Resource Name | Light Gray | `#cccccc` | Primary text |
| Namespace | Teal | `#4ec9b0` | Namespace identifier |
| Type/Info | Gray | `#858585` | Secondary info |
| Background | Dark Gray | `#2d2d30` | Results container |
| Hover | Blue | `#094771` | Interactive feedback |

## Keyboard Shortcuts

Currently mouse-only. **Context Menu Support:**
- ✅ More actions button (⋯) on each result
- ✅ Same context menu as sidebar lists
- ✅ Access to all available actions
- ✅ Consistent UX across search and lists

**Future Enhancements:**
- Keyboard navigation (↑↓ Enter Esc)
- Search history
- Filters by type/namespace
- Fuzzy search
- Favorites/Recents

## Benefits

### Speed
- ✅ **No navigation needed** - Direct access to any resource
- ✅ **Cross-namespace search** - Find resources anywhere
- ✅ **Fast filtering** - Real-time results

### Convenience
- ✅ **One search box** - No need to expand sections
- ✅ **Visual feedback** - See namespace and type
- ✅ **Quick actions** - Click to view immediately

### Efficiency
- ✅ **Debounced** - Prevents excessive API calls
- ✅ **Limited results** - Keeps UI responsive
- ✅ **Smart caching** - Reuses fetched data

## Troubleshooting

### No Results Found

**Possible causes:**
1. No resources match your query
2. Resources haven't been fetched yet
3. kubectl connection issue

**Solutions:**
- Try a different search term
- Check if resources exist: `kubectl get pods -A`
- Verify context is selected

### Search is Slow

**Possible causes:**
1. Large cluster with many resources
2. Network latency

**Solutions:**
- Be more specific in your search
- Wait for initial fetch to complete
- Consider filtering by namespace first

### Results Not Updating

**Possible causes:**
1. Cached results are stale
2. Resources changed after fetch

**Solutions:**
- Clear search and search again
- Refresh individual resource sections
- Switch context to force re-fetch

## Future Enhancements

Potential improvements:
1. **Keyboard navigation** - Arrow keys and Enter
2. **Search history** - Recent searches
3. **Filters** - By resource type, namespace
4. **Actions menu** - More than just view
5. **Fuzzy search** - Better matching algorithm
6. **Favorites** - Pin frequently accessed resources
7. **Recent** - Show recently viewed resources

## Files

- **src/components/sidebar/GlobalSearch.tsx** - Main component
- **src/components/TerminalSidebar.tsx** - Integration
- **src/components/sidebar/ResourceList.tsx** - Fixed text color

## Related Features

- **Resource Lists** - Browse resources by type
- **Context Menu** - Additional actions
- **Configuration Panel** - Namespace selection
- **Terminal** - Execute kubectl commands
