# Implementation Plan: Kubernetes Resource Manager

## Overview

Transform the current kubectl command runner into a full-featured Kubernetes Resource Manager with:
- Resource browsing (Pods, Services, Deployments, CronJobs, ConfigMaps, Secrets)
- Integrated native terminal (like VS Code)
- Resource editing capabilities
- Left sidebar + main console panel layout

---

## Current State Analysis

### ✅ Already Implemented
- Electron + React + TypeScript setup
- Kubeconfig file switching
- Context management and switching
- Basic kubectl command execution
- IPC communication (main ↔ renderer)
- Error handling and reporting

### 🆕 New Requirements
- Resource type selection (Pods, Services, etc.)
- Resource list panel with filtering
- Native terminal integration (node-pty)
- Resource editing (YAML)
- New UI layout (sidebar + console)
- Resource data fetching and display

---

## Implementation Phases

### Phase 1: Terminal Integration (Foundation)
**Goal:** Replace current command output with native terminal

**Tasks:**
1. Install dependencies: `node-pty`, `xterm`, `xterm-addon-fit`
2. Create terminal manager in main process
3. Add IPC handlers for terminal operations
4. Integrate xterm.js in renderer
5. Connect terminal to shell (bash/zsh/powershell)

**Files to Create/Modify:**
- `src/main/terminal.ts` (NEW) - Terminal manager
- `src/components/Terminal.tsx` (NEW) - xterm.js component
- `src/main.ts` - Add terminal IPC handlers
- `src/preload.ts` - Expose terminal API
- `package.json` - Add dependencies

**Acceptance Criteria:**
- Terminal opens with native shell
- Commands execute with color output
- Copy/paste works
- Terminal resizes properly

---

### Phase 2: Resource Data Layer
**Goal:** Fetch and parse Kubernetes resources

**Tasks:**
1. Create resource types (Pod, Service, Deployment, etc.)
2. Add resource fetching functions
3. Parse `kubectl get -o json` output
4. Add resource filtering/search logic
5. Create IPC handlers for resource operations

**Files to Create/Modify:**
- `src/common/resourceTypes.ts` (NEW) - Resource type definitions
- `src/main/resources.ts` (NEW) - Resource fetching logic
- `src/main.ts` - Add resource IPC handlers
- `src/preload.ts` - Expose resource API

**Acceptance Criteria:**
- Can fetch all resource types
- Data parsed correctly
- Filtering by name/namespace works
- Error handling for missing resources

---

### Phase 3: UI Restructure (Sidebar + Console)
**Goal:** Implement new layout with sidebar and main panel

**Tasks:**
1. Create sidebar component
2. Add resource type selector
3. Create resource list component
4. Implement search/filter UI
5. Restructure main layout (flex/grid)
6. Apply new styling (pastel theme)

**Files to Create/Modify:**
- `src/components/Sidebar.tsx` (NEW) - Left sidebar
- `src/components/ResourceTypeSelector.tsx` (NEW) - Resource type dropdown
- `src/components/ResourceList.tsx` (NEW) - Resource list with actions
- `src/components/SearchBar.tsx` (NEW) - Search/filter
- `src/renderer.tsx` - Restructure layout
- `src/styles/` (NEW) - CSS modules or styled-components

**Acceptance Criteria:**
- Sidebar shows context + resource type selector
- Resource list displays with name, namespace, status
- Search filters resources
- Layout is responsive
- Matches design requirements

---

### Phase 4: Resource Actions (Edit/View)
**Goal:** Enable resource editing and viewing

**Tasks:**
1. Add "Edit" and "View" buttons to resource list
2. Implement `kubectl get <resource> -o yaml` for viewing
3. Implement `kubectl edit <resource>` for editing
4. Handle YAML display in terminal
5. Add save/apply functionality
6. Handle edit conflicts and errors

**Files to Create/Modify:**
- `src/main/resources.ts` - Add edit/view functions
- `src/components/ResourceList.tsx` - Add action buttons
- `src/main/terminal.ts` - Add YAML editing support
- `src/main.ts` - Add edit/view IPC handlers

**Acceptance Criteria:**
- Click "View" shows YAML in terminal
- Click "Edit" opens YAML in editor
- Changes can be saved back to cluster
- Errors are displayed clearly
- Read-only mode works for "View"

---

### Phase 5: Polish & Integration
**Goal:** Complete integration and polish

**Tasks:**
1. Add loading states for resource fetching
2. Implement auto-refresh for resource lists
3. Add keyboard shortcuts
4. Improve error messages
5. Add tooltips and help text
6. Performance optimization
7. Testing and bug fixes

**Files to Modify:**
- All components - Add loading states
- `src/renderer.tsx` - Add keyboard handlers
- `src/components/` - Add tooltips
- Documentation updates

**Acceptance Criteria:**
- Smooth user experience
- No performance issues
- All features work together
- Documentation updated

---

## Detailed Task Breakdown

### Phase 1: Terminal Integration

#### 1.1 Install Dependencies
```bash
npm install node-pty xterm xterm-addon-fit
npm install --save-dev @types/node-pty
```

#### 1.2 Create Terminal Manager (`src/main/terminal.ts`)
```typescript
import * as pty from 'node-pty';
import os from 'os';

export class TerminalManager {
  private terminals: Map<string, pty.IPty>;
  
  createTerminal(id: string): void {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cwd: process.env.HOME,
      env: process.env as any,
    });
    
    this.terminals.set(id, ptyProcess);
  }
  
  writeToTerminal(id: string, data: string): void;
  resizeTerminal(id: string, cols: number, rows: number): void;
  closeTerminal(id: string): void;
  // ... more methods
}
```

#### 1.3 Create Terminal Component (`src/components/Terminal.tsx`)
```typescript
import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export function Terminal() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm>();
  
  useEffect(() => {
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      theme: { background: '#1e1e1e' }
    });
    
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);
    
    xterm.open(terminalRef.current!);
    fitAddon.fit();
    
    // Connect to backend terminal
    xterm.onData(data => {
      window.terminal?.write(data);
    });
    
    window.terminal?.onData(data => {
      xterm.write(data);
    });
    
    xtermRef.current = xterm;
    
    return () => xterm.dispose();
  }, []);
  
  return <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />;
}
```

#### 1.4 Add IPC Handlers (`src/main.ts`)
```typescript
import { TerminalManager } from './main/terminal';

const terminalManager = new TerminalManager();

ipcMain.handle('terminal:create', async (_event, id: string) => {
  terminalManager.createTerminal(id);
  return ok({ id });
});

ipcMain.handle('terminal:write', async (_event, id: string, data: string) => {
  terminalManager.writeToTerminal(id, data);
  return ok({});
});

ipcMain.handle('terminal:resize', async (_event, id: string, cols: number, rows: number) => {
  terminalManager.resizeTerminal(id, cols, rows);
  return ok({});
});
```

---

### Phase 2: Resource Data Layer

#### 2.1 Create Resource Types (`src/common/resourceTypes.ts`)
```typescript
export type ResourceType = 
  | 'pods'
  | 'services'
  | 'deployments'
  | 'cronjobs'
  | 'configmaps'
  | 'secrets';

export interface KubeResource {
  name: string;
  namespace: string;
  kind: string;
  status?: string;
  age?: string;
  labels?: Record<string, string>;
  metadata?: any;
}

export interface ResourceListResult {
  resources: KubeResource[];
  resourceType: ResourceType;
}
```

#### 2.2 Create Resource Fetcher (`src/main/resources.ts`)
```typescript
import { spawn } from 'child_process';
import type { KubeResource, ResourceType } from '../common/resourceTypes';

export async function listResources(
  context: string,
  resourceType: ResourceType,
  namespace?: string
): Promise<KubeResource[]> {
  const args = [
    '--context', context,
    'get', resourceType,
    '-o', 'json'
  ];
  
  if (namespace) {
    args.push('-n', namespace);
  } else {
    args.push('--all-namespaces');
  }
  
  const result = await executeKubectl(args);
  const data = JSON.parse(result.stdout);
  
  return data.items.map((item: any) => ({
    name: item.metadata.name,
    namespace: item.metadata.namespace,
    kind: item.kind,
    status: extractStatus(item),
    age: calculateAge(item.metadata.creationTimestamp),
    labels: item.metadata.labels,
    metadata: item.metadata,
  }));
}

export async function getResourceYaml(
  context: string,
  resourceType: ResourceType,
  name: string,
  namespace: string
): Promise<string> {
  const args = [
    '--context', context,
    'get', resourceType,
    name,
    '-n', namespace,
    '-o', 'yaml'
  ];
  
  const result = await executeKubectl(args);
  return result.stdout;
}

function extractStatus(item: any): string {
  // Extract status based on resource type
  if (item.kind === 'Pod') {
    return item.status?.phase || 'Unknown';
  }
  if (item.kind === 'Deployment') {
    const ready = item.status?.readyReplicas || 0;
    const desired = item.spec?.replicas || 0;
    return `${ready}/${desired}`;
  }
  return 'N/A';
}

function calculateAge(timestamp: string): string {
  const created = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - created.getTime();
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}
```

---

### Phase 3: UI Restructure

#### 3.1 Create Sidebar Component (`src/components/Sidebar.tsx`)
```typescript
import React from 'react';
import type { ResourceType } from '../common/resourceTypes';
import type { KubeContext, KubeConfigFile } from '../common/kubeTypes';

interface SidebarProps {
  // Context selection
  contexts: KubeContext[];
  selectedContext: string;
  onContextChange: (context: string) => void;
  
  // Config selection
  availableConfigs: KubeConfigFile[];
  currentConfig: string;
  onConfigChange: (path: string) => void;
  
  // Resource type selection
  resourceType: ResourceType;
  onResourceTypeChange: (type: ResourceType) => void;
  
  // Resource list
  resources: KubeResource[];
  onResourceSelect: (resource: KubeResource) => void;
  onResourceEdit: (resource: KubeResource) => void;
  onResourceView: (resource: KubeResource) => void;
  
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function Sidebar(props: SidebarProps) {
  const filteredResources = props.resources.filter(r =>
    r.name.toLowerCase().includes(props.searchQuery.toLowerCase()) ||
    r.namespace.toLowerCase().includes(props.searchQuery.toLowerCase())
  );
  
  return (
    <div style={styles.sidebar}>
      {/* Config selector */}
      {props.availableConfigs.length > 1 && (
        <select value={props.currentConfig} onChange={e => props.onConfigChange(e.target.value)}>
          {props.availableConfigs.map(config => (
            <option key={config.path} value={config.path}>
              {config.name} {config.isDefault ? '(default)' : ''}
            </option>
          ))}
        </select>
      )}
      
      {/* Context selector */}
      <select value={props.selectedContext} onChange={e => props.onContextChange(e.target.value)}>
        {props.contexts.map(ctx => (
          <option key={ctx.name} value={ctx.name}>{ctx.name}</option>
        ))}
      </select>
      
      {/* Resource type selector */}
      <select value={props.resourceType} onChange={e => props.onResourceTypeChange(e.target.value as ResourceType)}>
        <option value="pods">Pods</option>
        <option value="services">Services</option>
        <option value="deployments">Deployments</option>
        <option value="cronjobs">CronJobs</option>
        <option value="configmaps">ConfigMaps</option>
        <option value="secrets">Secrets</option>
      </select>
      
      {/* Search bar */}
      <input
        type="text"
        placeholder="Search resources..."
        value={props.searchQuery}
        onChange={e => props.onSearchChange(e.target.value)}
      />
      
      {/* Resource list */}
      <div style={styles.resourceList}>
        {filteredResources.map(resource => (
          <div key={`${resource.namespace}/${resource.name}`} style={styles.resourceItem}>
            <div style={styles.resourceInfo}>
              <div style={styles.resourceName}>{resource.name}</div>
              <div style={styles.resourceMeta}>
                {resource.namespace} • {resource.status}
              </div>
            </div>
            <div style={styles.resourceActions}>
              <button onClick={() => props.onResourceView(resource)}>View</button>
              <button onClick={() => props.onResourceEdit(resource)}>Edit</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: '300px',
    height: '100vh',
    backgroundColor: '#f5f5dc', // Soft pastel
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    borderRight: '1px solid #ddd',
  },
  resourceList: {
    flex: 1,
    overflowY: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  resourceItem: {
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  resourceInfo: {
    flex: 1,
  },
  resourceName: {
    fontWeight: 'bold',
    fontSize: '14px',
  },
  resourceMeta: {
    fontSize: '12px',
    color: '#666',
    marginTop: '4px',
  },
  resourceActions: {
    display: 'flex',
    gap: '4px',
  },
};
```

#### 3.2 Update Main Layout (`src/renderer.tsx`)
```typescript
function App() {
  const [resourceType, setResourceType] = useState<ResourceType>('pods');
  const [resources, setResources] = useState<KubeResource[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // ... existing state
  
  const handleResourceTypeChange = useCallback(async (type: ResourceType) => {
    setResourceType(type);
    // Fetch resources of this type
    const result = await kubeAPI.listResources(selectedContext, type);
    setResources(result.resources);
  }, [selectedContext]);
  
  const handleResourceView = useCallback(async (resource: KubeResource) => {
    const yaml = await kubeAPI.getResourceYaml(
      selectedContext,
      resourceType,
      resource.name,
      resource.namespace
    );
    // Display in terminal
    await terminalAPI.write(`# ${resource.kind}: ${resource.name}\n${yaml}\n`);
  }, [selectedContext, resourceType]);
  
  const handleResourceEdit = useCallback(async (resource: KubeResource) => {
    // Open in terminal editor
    await terminalAPI.executeCommand(
      `kubectl --context ${selectedContext} edit ${resourceType} ${resource.name} -n ${resource.namespace}`
    );
  }, [selectedContext, resourceType]);
  
  return (
    <div style={styles.container}>
      <Sidebar
        contexts={contexts}
        selectedContext={selectedContext}
        onContextChange={handleContextChange}
        availableConfigs={availableConfigs}
        currentConfig={kubeconfigPath}
        onConfigChange={handleConfigChange}
        resourceType={resourceType}
        onResourceTypeChange={handleResourceTypeChange}
        resources={resources}
        onResourceSelect={() => {}}
        onResourceEdit={handleResourceEdit}
        onResourceView={handleResourceView}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />
      
      <div style={styles.mainPanel}>
        <Terminal />
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
  },
  mainPanel: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
};
```

---

## Dependencies to Add

```json
{
  "dependencies": {
    "node-pty": "^1.0.0",
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0"
  },
  "devDependencies": {
    "@types/node-pty": "^1.0.0"
  }
}
```

---

## Implementation Order

1. **Week 1: Terminal Integration**
   - Day 1-2: Install dependencies, create terminal manager
   - Day 3-4: Integrate xterm.js component
   - Day 5: Testing and bug fixes

2. **Week 2: Resource Data Layer**
   - Day 1-2: Create resource types and fetching logic
   - Day 3-4: Add IPC handlers and parsing
   - Day 5: Testing with different resource types

3. **Week 3: UI Restructure**
   - Day 1-2: Create sidebar component
   - Day 3-4: Implement resource list and search
   - Day 5: Apply styling and polish

4. **Week 4: Resource Actions**
   - Day 1-2: Implement view functionality
   - Day 3-4: Implement edit functionality
   - Day 5: Testing and error handling

5. **Week 5: Polish & Integration**
   - Day 1-2: Add loading states and auto-refresh
   - Day 3-4: Performance optimization
   - Day 5: Documentation and final testing

---

## Testing Strategy

### Unit Tests
- Terminal manager functions
- Resource parsing logic
- Search/filter functions

### Integration Tests
- Terminal ↔ main process communication
- Resource fetching and display
- Edit/view workflows

### Manual Tests
- Test with different resource types
- Test with multiple contexts
- Test error scenarios (no kubectl, invalid context, etc.)
- Test on different platforms (Windows, macOS, Linux)

---

## Success Criteria

✅ Native terminal works like VS Code
✅ All 6 resource types can be listed
✅ Resources can be viewed (YAML)
✅ Resources can be edited (kubectl edit)
✅ Search/filter works correctly
✅ UI matches design requirements
✅ No performance issues with large resource lists
✅ Error handling is robust
✅ Documentation is complete

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| node-pty platform issues | High | Test on all platforms early, have fallback to current command execution |
| Terminal performance with large output | Medium | Implement output buffering and limits |
| kubectl edit complexity | Medium | Start with view-only, add edit later |
| Resource parsing failures | Medium | Add comprehensive error handling and validation |
| UI complexity | Low | Build incrementally, test each component |

---

## Next Steps

1. Review and approve this plan
2. Set up project tracking (GitHub issues/project board)
3. Start with Phase 1: Terminal Integration
4. Regular check-ins after each phase
5. Iterate based on feedback

---

## Notes

- Keep existing functionality working during development
- Use feature flags to toggle new UI
- Maintain backward compatibility
- Document all new APIs
- Update tests as we go
