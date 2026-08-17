mod azure_auth;
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
            check_azure_auth,
            start_azure_login,
            cancel_azure_login,
            terminal_create,
            terminal_write,
            terminal_write_silent,
            terminal_resize,
            terminal_close,
            open_new_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
                azure_auth::cancel_all_azure_logins();
            }
        });
}
