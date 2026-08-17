use crate::azure_auth::{self, AzureLoginMethod, AzureLoginStart, AzureSessionStatus};
use crate::kube::{self, KubeConfigSummary};
use crate::terminal::TERMINAL_MANAGER;
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn get_contexts(config_path: Option<String>) -> Result<KubeConfigSummary, String> {
    // Run file I/O in blocking thread pool to not block the main thread
    tauri::async_runtime::spawn_blocking(move || kube::parse_kubeconfig(config_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_context(config_path: String, context_name: String) -> Result<(), String> {
    // Run kubectl in blocking thread pool
    tauri::async_runtime::spawn_blocking(move || kube::set_context(config_path, context_name))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn set_namespace(
    config_path: String,
    context: String,
    namespace: String,
) -> Result<(), String> {
    kube::set_namespace(config_path, context, namespace)
}

#[tauri::command]
pub async fn run_kubectl(args: Vec<String>, config_path: Option<String>) -> Result<String, String> {
    // Run kubectl in blocking thread pool to not block the main thread
    tauri::async_runtime::spawn_blocking(move || kube::run_kubectl(args, config_path))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn check_azure_auth(
    config_path: String,
    context_name: String,
) -> Result<AzureSessionStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        azure_auth::check_azure_auth(&config_path, &context_name)
    })
    .await
    .map_err(|error| format!("Task failed: {}", error))
}

#[tauri::command]
pub fn start_azure_login(
    app: AppHandle,
    config_path: String,
    context_name: String,
    tenant_id: String,
    method: AzureLoginMethod,
) -> Result<AzureLoginStart, String> {
    azure_auth::start_azure_login(app, config_path, context_name, tenant_id, method)
}

#[tauri::command]
pub fn cancel_azure_login(login_id: String) -> Result<(), String> {
    azure_auth::cancel_azure_login(&login_id)
}

#[tauri::command]
pub fn terminal_create(
    app: AppHandle,
    shell: Option<String>,
    initial_env: Option<std::collections::HashMap<String, String>>,
) -> Result<String, String> {
    let mut manager = TERMINAL_MANAGER
        .lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.create(app, shell, initial_env)
}

#[tauri::command]
pub fn terminal_write(terminal_id: String, data: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER
        .lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.write(&terminal_id, &data)
}

#[tauri::command]
pub fn terminal_write_silent(terminal_id: String, data: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER
        .lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.write_silent(&terminal_id, &data)
}

#[tauri::command]
pub fn terminal_resize(terminal_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER
        .lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.resize(&terminal_id, cols, rows)
}

#[tauri::command]
pub fn terminal_close(terminal_id: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER
        .lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.close(&terminal_id)
}

/// Opens a new isolated KubeCLI window. Each window has its own state.
#[tauri::command]
pub fn open_new_window(app: AppHandle) -> Result<(), String> {
    let label = format!("kubecli-{}", uuid::Uuid::new_v4());

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::default())
        .title("KubeCLI")
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}
