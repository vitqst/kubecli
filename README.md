# Kubernetes CLI Manager

A desktop application for managing Kubernetes contexts and running kubectl commands with an intuitive UI.

📚 **[Full Documentation](docs/README.md)** | 🔧 **[Troubleshooting](docs/troubleshooting/)** | 🧪 **[Use Cases](docs/ai/)**

## Features

- **Kubeconfig File Switching**: Switch between multiple kubeconfig files (not just contexts)
- **Context Management**: View and switch between kubeconfig contexts
- **Command Execution**: Run kubectl commands with automatic context injection
- **Output Display**: Separate STDOUT/STDERR views with exit codes and timestamps
- **Error Handling**: Clear error messages for common issues
- **Auto-Discovery**: Automatically finds kubeconfig files in `~/.kube/` and `KUBECONFIG`

## Prerequisites

- **Node.js**: LTS version (18 or 20)
- **kubectl**: Installed and accessible in PATH
- **Kubeconfig**: Valid configuration at `~/.kube/config` or `$KUBECONFIG`

## Installation

```bash
npm install
```

## Development

Start the application in development mode:

```bash
npm start
```

The app will launch with DevTools open for debugging.

## Usage

### 1. Context Selection

On launch, the app automatically loads all available contexts from your kubeconfig. The current context is highlighted with "(current)" in the dropdown.

**Context details displayed:**
- Cluster name
- Server URL
- User
- Namespace (if configured)

### 2. Switching Contexts

Select a different context from the dropdown. The app will:
1. Execute `kubectl config use-context <name>`
2. Refresh the context list
3. Display any errors if the switch fails

### 3. Running Commands

Enter a kubectl command in the input field. You can use either format:
- `get pods -A`
- `kubectl get pods -A`

The app automatically:
- Strips the `kubectl` prefix if present
- Injects `--context <selected-context>`
- Executes the command

### 4. Viewing Output

After execution, the output section displays:
- **Exit code**: Command success/failure indicator
- **Timestamp**: When the command completed
- **STDOUT**: Standard output
- **STDERR**: Error output

## Error Scenarios

| Scenario | Behavior |
|----------|----------|
| No contexts found | Shows guidance to check kubeconfig paths |
| Context switch fails | Displays kubectl error and reverts selection |
| Empty command | Prevents submission with validation message |
| kubectl not installed | Shows error advising to install or fix PATH |
| Command execution error | Displays STDERR and non-zero exit code |

## Project Structure

```
src/
├── main.ts              # Electron main process & IPC handlers
├── renderer.tsx         # React UI components
├── preload.ts           # Secure IPC bridge
├── main/
│   └── kube.ts          # Kubernetes operations
├── common/
│   └── kubeTypes.ts     # Shared TypeScript types
└── types/
    └── global.d.ts      # Window API declarations
```

## Architecture

### Main Process (`src/main.ts`)
- Manages Electron window lifecycle
- Registers IPC handlers for:
  - `kube:get-contexts`: Load kubeconfig summary
  - `kube:set-context`: Switch active context
  - `kube:run-command`: Execute kubectl commands

### Kubernetes Module (`src/main/kube.ts`)
- **`loadKubeConfig()`**: Parses kubeconfig YAML and extracts context metadata
- **`useContext()`**: Switches context via `kubectl config use-context`
- **`runKubectlCommand()`**: Executes kubectl with context injection
- **`tokenize()`**: Safely parses command strings with quote handling

### Renderer Process (`src/renderer.tsx`)
- React-based UI with hooks for state management
- Communicates with main process via secure preload bridge
- Handles loading states, errors, and user interactions

### Preload Bridge (`src/preload.ts`)
- Exposes `window.kube` API to renderer
- Unwraps IPC responses and throws errors appropriately

## Building

Package the application for distribution:

```bash
npm run package
```

Create installers:

```bash
npm run make
```

## Testing

### Quick Error Check

```bash
./check-errors.sh
```

This will verify the app starts correctly and report any errors.

### Automated Tests

```bash
node test-implementation.js
```

Runs integration tests for core functionality.

### Manual Verification

1. **Context Loading** - Launch app and verify contexts appear
2. **Context Switching** - Select different contexts
3. **Command Execution** - Run kubectl commands
4. **Error Handling** - Test error scenarios

## Troubleshooting

If you encounter issues:

1. **Run diagnostics**: `./diagnose.sh`
2. **Check for errors**: `./check-errors.sh`
3. **See error reporting guide**: `docs/troubleshooting/ERROR_REPORTING.md`
4. **Check blank screen fix**: `docs/troubleshooting/BLANK_SCREEN_FIXED.md`

## Use Cases

See `docs/ai/use_case_001.md` for detailed scenario documentation.

## License

MIT
