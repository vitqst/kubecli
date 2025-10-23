# Kubernetes CLI Manager

A lightweight Electron-based desktop application to manage Kubernetes clusters using `kubectl`. The application provides an intuitive interface for developers and DevOps engineers to interact with their Kubernetes environments efficiently.

## Features

-   **Configuration Management:**
    -   Read and parse `~/.kube/config` file.
    -   Switch between multiple Kubernetes contexts.
    -   Assign custom aliases to clusters.
-   **Service Management:**
    -   List services by namespace.
    -   Start and stop port-forwarding sessions.
-   **Pod Management:**
    -   List pods with status, restarts, and age.
    -   Filter pods by namespace, labels, or name.
    -   Stream real-time logs from pods and containers.
-   **Deployment Management:**
    -   List deployments and their replica status.
    -   Open deployment YAML in the system's default editor.
    -   Apply changes to deployments directly from the application.
-   **ConfigMap Management:**
    -   List and preview ConfigMaps.
    -   Edit ConfigMap data and apply changes.

## Technology Stack

-   [Electron](https://www.electronjs.org/)
-   [React](https://reactjs.org/)
-   [TypeScript](https://www.typescriptlang.org/)
-   [kubectl](https://kubernetes.io/docs/reference/kubectl/)

## Development

To run the application in development mode:

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd kubecli
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the application:**
    ```bash
    npm start
    ```

## Building the Application

To build the application for your current platform:

```bash
npm run make
```

This will generate a distributable application in the `out` directory.

## Testing

You can exercise the application locally against a real Kubernetes API by running Minikube:

1. **Install prerequisites:**
   - [Minikube](https://minikube.sigs.k8s.io/docs/start/)
   - `kubectl` (bundled with Minikube or installed separately)

2. **Start a local cluster:**
   ```bash
   minikube start
   ```

3. **Create sample resources (optional, gives the UI something to show):**
   ```bash
   kubectl create namespace demo
   kubectl create deployment hello-minikube --image=k8s.gcr.io/echoserver:1.10 -n demo
   kubectl expose deployment hello-minikube --type=ClusterIP --port=8080 -n demo
   ```

4. **Run the app (`npm start`) and select the Minikube context** that now appears in `~/.kube/config`.

5. **Tear down when finished:**
   ```bash
   minikube delete
   ```

Minikube writes to the same kubeconfig file that the app reads, so no additional configuration is necessary once the cluster is running.

## Implementation Roadmap

### Milestone 0 – Context Picker & Command Runner
- Parse `~/.kube/config`, normalize context metadata, and surface it in a simple selector.
- Allow the user to switch the active context from within the UI and persist that choice.
- Expose a lightweight command runner that executes `kubectl` with the selected context (e.g., `kubectl get pods`), showing stdout/stderr inline.
- Acceptance: Selecting a context updates the current context and running a command respects the chosen context without leaving the app.

### Optional Follow‑Ups
- Add aliases or favorites for frequently used contexts.
- Persist a short command history so users can re-run common invocations.
- Layer in resource browsing (pods, services, deployments) once the core picker/runner loop feels solid.

## Validation Plan
- `npm run lint` and `npm run test` (unit coverage for config parsing and command execution helpers).
- Manual smoke tests for context switching and sample commands (`kubectl get pods`, `kubectl config current-context`).
- Integration tests that mock `kubectl` responses to validate parsing and UI state transitions once the runner is implemented.
- Exploratory tests against Minikube and a real remote cluster to confirm kubeconfig handling.

## Open Questions
- Do we need a background service to watch kubeconfig changes, or can Electron file watchers suffice?
- How should we persist user-specific preferences (aliases, command history) across devices?
- Are there compliance constraints around storing kubeconfig data or cluster credentials locally?
