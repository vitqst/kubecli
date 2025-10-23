# Kubeconfig File Switching

The Kubernetes CLI Manager supports switching between multiple kubeconfig files, not just contexts within a single file.

## Overview

kubectl supports multiple kubeconfig files through:
- The `KUBECONFIG` environment variable (colon-separated paths)
- The `--kubeconfig` flag
- Multiple config files in `~/.kube/` directory

This app automatically discovers and allows you to switch between these files.

## How It Works

### Automatic Discovery

The app automatically scans for kubeconfig files in these locations:

1. **Default config**: `~/.kube/config`
2. **Additional files in ~/.kube/**:
   - Files starting with `config-` (e.g., `config-prod`, `config-dev`)
   - Files starting with `kubeconfig` (e.g., `kubeconfig-staging`)
   - Files ending with `.yaml` or `.yml`
   - Files without extensions
3. **KUBECONFIG environment variable**: All paths listed

### File Validation

Each discovered file is validated to ensure it's a valid kubeconfig:
- Must be readable
- Must be valid YAML
- Must contain `contexts` or `clusters` fields

## Usage

### In the UI

1. **Single Config**: If only one kubeconfig is found, no selector is shown
2. **Multiple Configs**: A dropdown appears above the context selector

```
Kubeconfig & Context
┌─────────────────────────────────┐
│ Kubeconfig file                 │
│ ┌─────────────────────────────┐ │
│ │ default (default)        ▼  │ │
│ └─────────────────────────────┘ │
│                                 │
│ Active context                  │
│ ┌─────────────────────────────┐ │
│ │ aks-brand-sandbox        ▼  │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

### Switching Configs

1. Select a different kubeconfig from the dropdown
2. The app will:
   - Load contexts from the new config
   - Update the context list
   - Select the current context from the new config
   - Update all kubectl commands to use the new config

## Common Scenarios

### Scenario 1: Multiple Environments

```bash
~/.kube/
├── config              # Default (development)
├── config-staging      # Staging environment
└── config-production   # Production environment
```

The app will show all three configs in the dropdown.

### Scenario 2: KUBECONFIG Environment Variable

```bash
export KUBECONFIG=~/.kube/config:~/projects/client-a/kubeconfig
```

The app will discover both configs and allow switching between them.

### Scenario 3: Project-Specific Configs

```bash
~/.kube/
├── config                    # Personal clusters
├── kubeconfig-project-a      # Project A clusters
└── kubeconfig-project-b.yaml # Project B clusters
```

All configs are discovered and available for switching.

## Technical Details

### Architecture

**Backend (`src/main/kube.ts`)**:
- `discoverKubeconfigs()` - Scans for available configs
- `setKubeconfigPath(path)` - Sets the active config
- `loadKubeConfig()` - Loads contexts from active config

**Frontend (`src/renderer.tsx`)**:
- `availableConfigs` state - List of discovered configs
- `handleConfigChange()` - Switches to selected config
- Conditional rendering - Shows selector only if multiple configs exist

**IPC Bridge (`src/preload.ts`)**:
- `setConfig(configPath)` - IPC method for switching configs

### State Management

When switching configs:
1. User selects new config from dropdown
2. `handleConfigChange()` is called
3. IPC call to `kube:set-config` with new path
4. Backend sets `currentKubeconfigPath`
5. Backend loads new config and returns summary
6. Frontend updates all state (contexts, current context, etc.)
7. UI refreshes with new data

### Context Preservation

The app attempts to preserve your selected context when switching configs:
- If the same context name exists in the new config, it remains selected
- Otherwise, falls back to the current context from the new config
- If no current context, selects the first available context

## Examples

### Example 1: Development vs Production

**Setup:**
```bash
# Development config
~/.kube/config

# Production config
~/.kube/config-prod
```

**Usage:**
1. Start app → Shows "default (default)" config
2. Select "config-prod" from dropdown
3. Context list updates to show production clusters
4. Run commands against production

### Example 2: Multiple Projects

**Setup:**
```bash
~/.kube/
├── config                  # Personal
├── kubeconfig-client-a     # Client A
└── kubeconfig-client-b     # Client B
```

**Usage:**
1. Switch between configs as needed
2. Each config has its own set of contexts
3. Commands always run against the selected config

### Example 3: Using KUBECONFIG Variable

**Setup:**
```bash
export KUBECONFIG=~/.kube/config:~/work/special-project/kubeconfig
```

**Usage:**
1. App discovers both configs
2. Shows "config (default)" and "kubeconfig"
3. Switch between them in the UI

## Benefits

1. **No Manual Editing**: Switch configs without editing files
2. **Visual Discovery**: See all available configs at a glance
3. **Safe Switching**: Validation ensures configs are valid
4. **Context Awareness**: Preserves context selection when possible
5. **Environment Isolation**: Keep different environments separate

## Limitations

1. **Read-Only**: Cannot create or edit kubeconfig files
2. **File-Based Only**: Doesn't support kubectl config plugins
3. **Local Files**: Only discovers files on local filesystem
4. **No Merging**: Doesn't merge multiple configs (kubectl does this with KUBECONFIG)

## Troubleshooting

### Config Not Appearing

**Problem**: Your kubeconfig file isn't showing in the dropdown

**Solutions**:
1. Check file location: Must be in `~/.kube/` or in `KUBECONFIG`
2. Check file name: Must match patterns (see "Automatic Discovery")
3. Check file format: Must be valid YAML with contexts/clusters
4. Check permissions: File must be readable

### Switching Fails

**Problem**: Error when switching configs

**Solutions**:
1. Check file is still accessible
2. Verify file is valid kubeconfig
3. Check kubectl is installed
4. Restart the app

### Contexts Not Loading

**Problem**: Config switches but no contexts appear

**Solutions**:
1. Verify config has contexts defined
2. Check config syntax with `kubectl config view --kubeconfig=<path>`
3. Ensure clusters are defined in the config

## API Reference

### IPC Methods

```typescript
// Switch to a different kubeconfig file
window.kube.setConfig(configPath: string): Promise<KubeConfigSummary>
```

### Types

```typescript
interface KubeConfigFile {
  path: string;        // Full path to config file
  name: string;        // Display name (filename)
  isDefault: boolean;  // True if this is ~/.kube/config
}

interface KubeConfigSummary {
  contexts: KubeContext[];
  currentContext: string | null;
  kubeconfigPath: string;
  availableConfigs?: KubeConfigFile[];  // Discovered configs
}
```

## See Also

- [kubectl config documentation](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
- [KUBECONFIG environment variable](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/)
