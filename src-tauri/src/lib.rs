mod terminal;

use terminal::TerminalManager;
use std::env;

#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(TerminalManager::new())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      terminal::create_terminal,
      terminal::write_terminal,
      terminal::resize_terminal,
      terminal::close_terminal,
      get_home_dir,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
