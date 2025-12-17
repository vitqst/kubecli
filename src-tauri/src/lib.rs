mod commands;
mod kube;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_contexts,
            set_context,
            set_namespace,
            run_kubectl,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
