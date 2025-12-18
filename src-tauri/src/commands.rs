use crate::kube::{self, KubeConfigSummary};
use crate::terminal::TERMINAL_MANAGER;
use tauri::AppHandle;

#[tauri::command]
pub fn get_contexts(config_path: Option<String>) -> Result<KubeConfigSummary, String> {
    kube::parse_kubeconfig(config_path)
}

#[tauri::command]
pub fn set_context(config_path: String, context_name: String) -> Result<(), String> {
    kube::set_context(config_path, context_name)
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
pub fn run_kubectl(args: Vec<String>, config_path: Option<String>) -> Result<String, String> {
    kube::run_kubectl(args, config_path)
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
