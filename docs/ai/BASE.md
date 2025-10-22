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
