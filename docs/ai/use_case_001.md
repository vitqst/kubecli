# Use Case 001 — Context Selection & kubectl Command

## Scenario
A developer wants to inspect workloads in a specific cluster without leaving the Kubernetes CLI Manager UI. They need to switch to the desired kubeconfig context and run `kubectl` commands that respect that selection.

## Preconditions
- `kubectl` is installed and can reach the target clusters.
- The kubeconfig file (`~/.kube/config` or `KUBECONFIG`) contains at least one valid context.
- The application is launched (`npm start`) and initial context loading has completed.

## Main Flow
1. **Load contexts**: On launch the app lists every context, highlights the current one, and shows cluster/server metadata.
2. **Select context**: The user picks a context from the dropdown. The app calls `kubectl config use-context <name>` and refreshes the list to confirm the change.
3. **Enter command**: The user types a kubectl command in plain text (either `get pods`, `kubectl get pods -A`, etc.).
4. **Run command**: Clicking `Run` triggers the command through the main process with `--context <selected>`.
5. **Review output**: STDOUT and STDERR print in separate panes along with the exit code and timestamp.

## Alternate / Error Paths
- **Missing contexts**: Show “No contexts found” with guidance to check kubeconfig paths.
- **Context switch failure**: Display the kubectl error message and revert to the previous selection.
- **Command validation**: Prevent empty submissions; surface validation errors above the input.
- **kubectl not installed**: Surface the spawn error and advise installing or fixing PATH.

## Postconditions
- Selected context remains active for subsequent commands.
- Command history is not persisted yet; future enhancements may add MRU storage.
- No kubeconfig data is modified beyond calling `kubectl config use-context`.
