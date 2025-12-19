use crate::kube::{self, KubeConfigSummary};
use crate::terminal::TERMINAL_MANAGER;
use tauri::AppHandle;

#[tauri::command]
pub async fn get_contexts(config_path: Option<String>) -> Result<KubeConfigSummary, String> {
    // Run file I/O in blocking thread pool to not block the main thread
    tauri::async_runtime::spawn_blocking(move || {
        kube::parse_kubeconfig(config_path)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_context(config_path: String, context_name: String) -> Result<(), String> {
    // Run kubectl in blocking thread pool
    tauri::async_runtime::spawn_blocking(move || {
        kube::set_context(config_path, context_name)
    })
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
    tauri::async_runtime::spawn_blocking(move || {
        kube::run_kubectl(args, config_path)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn terminal_create(app: AppHandle, shell: Option<String>) -> Result<String, String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.create(app, shell)
}

#[tauri::command]
pub fn terminal_write(terminal_id: String, data: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.write(&terminal_id, &data)
}

#[tauri::command]
pub fn terminal_write_silent(terminal_id: String, data: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.write_silent(&terminal_id, &data)
}

#[tauri::command]
pub fn terminal_resize(terminal_id: String, cols: u16, rows: u16) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.resize(&terminal_id, cols, rows)
}

#[tauri::command]
pub fn terminal_close(terminal_id: String) -> Result<(), String> {
    let mut manager = TERMINAL_MANAGER.lock()
        .map_err(|_| "Failed to lock terminal manager".to_string())?;
    manager.close(&terminal_id)
}
