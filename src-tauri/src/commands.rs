use crate::kube::{self, KubeConfigSummary};

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
