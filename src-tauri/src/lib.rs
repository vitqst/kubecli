mod commands;
mod kube;
mod terminal;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_contexts,
            set_context,
            set_namespace,
            run_kubectl,
            terminal_create,
            terminal_write,
            terminal_write_silent,
            terminal_resize,
            terminal_close,
            open_new_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
