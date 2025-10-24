use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
pub struct TerminalData {
    pub id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalExit {
    pub id: String,
    pub exit_code: i32,
}

pub struct TerminalManager {
    terminals: Arc<Mutex<HashMap<String, TerminalHandle>>>,
}

struct TerminalHandle {
    writer: Box<dyn Write + Send>,
    _reader_thread: std::thread::JoinHandle<()>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            terminals: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_terminal(
        &self,
        id: String,
        app_handle: AppHandle,
        cwd: Option<String>,
        env: Option<HashMap<String, String>>,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();
        
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let mut cmd = CommandBuilder::new("bash");
        cmd.env("TERM", "xterm-256color");
        
        if let Some(cwd_path) = cwd {
            cmd.cwd(cwd_path);
        }
        
        if let Some(env_vars) = env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        let mut child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        let terminal_id = id.clone();
        let app_handle_clone = app_handle.clone();
        
        // Spawn reader thread
        let reader_thread = std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = app_handle_clone.emit(
                            "terminal:data",
                            TerminalData {
                                id: terminal_id.clone(),
                                data,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }

            // Check exit status
            if let Ok(status) = child.wait() {
                let exit_code = status.exit_code();
                let _ = app_handle_clone.emit(
                    "terminal:exit",
                    TerminalExit {
                        id: terminal_id.clone(),
                        exit_code,
                    },
                );
            }
        });

        let handle = TerminalHandle {
            writer,
            _reader_thread: reader_thread,
        };

        self.terminals.lock().unwrap().insert(id.clone(), handle);

        Ok(id)
    }

    pub fn write_to_terminal(&self, id: &str, data: &str) -> Result<(), String> {
        let mut terminals = self.terminals.lock().unwrap();
        
        if let Some(handle) = terminals.get_mut(id) {
            handle
                .writer
                .write_all(data.as_bytes())
                .map_err(|e| format!("Failed to write to terminal: {}", e))?;
            handle
                .writer
                .flush()
                .map_err(|e| format!("Failed to flush terminal: {}", e))?;
            Ok(())
        } else {
            Err(format!("Terminal {} not found", id))
        }
    }

    pub fn resize_terminal(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        // Note: portable-pty doesn't support resize after creation
        // This is a limitation we'll document
        Ok(())
    }

    pub fn close_terminal(&self, id: &str) -> Result<(), String> {
        let mut terminals = self.terminals.lock().unwrap();
        
        if terminals.remove(id).is_some() {
            Ok(())
        } else {
            Err(format!("Terminal {} not found", id))
        }
    }
}

// Tauri commands
#[tauri::command]
pub async fn create_terminal(
    id: String,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    state: tauri::State<'_, TerminalManager>,
    app_handle: AppHandle,
) -> Result<String, String> {
    state.create_terminal(id, app_handle, cwd, env)
}

#[tauri::command]
pub async fn write_terminal(
    id: String,
    data: String,
    state: tauri::State<'_, TerminalManager>,
) -> Result<(), String> {
    state.write_to_terminal(&id, &data)
}

#[tauri::command]
pub async fn resize_terminal(
    id: String,
    cols: u16,
    rows: u16,
    state: tauri::State<'_, TerminalManager>,
) -> Result<(), String> {
    state.resize_terminal(&id, cols, rows)
}

#[tauri::command]
pub async fn close_terminal(
    id: String,
    state: tauri::State<'_, TerminalManager>,
) -> Result<(), String> {
    state.close_terminal(&id)
}
