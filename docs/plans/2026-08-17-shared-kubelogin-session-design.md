# Shared Kubelogin Session Implementation Plan

**Goal:** Renew one kubelogin device-code session that is reused by every compatible kubeconfig, without modifying kubeconfig files.

**Architecture:** KubeCLI reads the selected context's existing `kubelogin get-token` exec command and runs that command directly. Kubelogin owns the shared `${HOME}/.kube/cache/kubelogin/auth.json` identity cache; KubeCLI drains but never stores the returned ExecCredential token. A successful token command is followed by a Kubernetes API probe for the selected context before the UI reports success.

**Tech stack:** Rust, Tauri 2, kubelogin exec authentication, kubectl, Vitest.

## Task 1: Preserve the kubeconfig

- Add a failing Rust test that builds the native kubelogin command from a `devicecode` context.
- Assert that no `convert-kubeconfig` command is invoked.
- Remove the automatic `devicecode` to `azurecli` conversion.

## Task 2: Renew the shared cache

- Run the selected kubeconfig's `kubelogin get-token` arguments directly.
- Keep device-code URL/code progress parsing on stderr.
- Drain and discard the ExecCredential JSON on stdout; never log or persist it.
- Keep one active login per tenant to prevent duplicate prompts.

## Task 3: Verify Kubernetes access

- After kubelogin succeeds, run a scoped `kubectl get --raw=/version` probe.
- Report the native kubelogin context as active only when the API server accepts it.
- Preserve Azure CLI verification for contexts already configured with `azurecli`.

## Task 4: Verify

- Run all Rust and frontend tests, TypeScript checking, and the production frontend build.
- Reproduce one device-code renewal and inspect `/tmp/kubecli-azure-auth.log` for one login and a verified Kubernetes probe.

