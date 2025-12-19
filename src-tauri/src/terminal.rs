use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    _reader_handle: thread::JoinHandle<()>,
}

pub struct TerminalManager {
    sessions: HashMap<String, PtySession>,
    next_id: u64,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            next_id: 1,
        }
    }

    pub fn create(&mut self, app: AppHandle, shell: Option<String>) -> Result<String, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let shell_cmd = shell.unwrap_or_else(|| {
            std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
        });

        let mut cmd = CommandBuilder::new(&shell_cmd);

        // Start as login shell for proper environment initialization
        // This helps zsh and its plugins (like autosuggestions) work correctly
        cmd.arg("-l");

        // Set essential terminal environment variables
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        // Disable shell history to prevent polluting user's history file
        cmd.env("HISTFILE", "");
        cmd.env("HISTSIZE", "0");
        cmd.env("SAVEHIST", "0");  // For zsh

        // Clear potentially problematic inherited variables
        // that can interfere with shell initialization
        cmd.env_remove("ZDOTDIR");
        cmd.env_remove("SHELL_SESSION_ID");

        // Set HOME to ensure shell finds config files
        if let Ok(home) = std::env::var("HOME") {
            cmd.env("HOME", home);
        }

        // Set a clean LANG/LC_ALL for proper character handling
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("LC_ALL", "en_US.UTF-8");

        pair.slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn shell: {}", e))?;

        let terminal_id = format!("term_{}", self.next_id);
        self.next_id += 1;

        let mut reader = pair.master.try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair.master.take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        let term_id_clone = terminal_id.clone();
        let reader_handle = thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        let _ = app.emit("terminal:exit", &term_id_clone);
                        break;
                    }
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let payload = serde_json::json!({
                            "terminalId": term_id_clone,
                            "data": data
                        });
                        let _ = app.emit("terminal:data", payload);
                    }
                    Err(_) => break,
                }
            }
        });

        self.sessions.insert(
            terminal_id.clone(),
            PtySession {
                master: pair.master,
                writer,
                _reader_handle: reader_handle,
            },
        );

        // // Disable shell history and clear screen (silent initialization)
        // // Leading space makes command ignored by history, clear hides output
        // if let Some(session) = self.sessions.get_mut(&terminal_id) {
        //     let init_cmd = "unset HISTFILE HISTSIZE SAVEHIST 2>/dev/null;";
        //     let _ = session.writer.write_all(init_cmd.as_bytes());
        //     let _ = session.writer.flush();
        // }

        Ok(terminal_id)
    }

    pub fn write(&mut self, terminal_id: &str, data: &str) -> Result<(), String> {
        let session = self.sessions.get_mut(terminal_id)
            .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

        session.writer.write_all(data.as_bytes())
            .map_err(|e| format!("Write failed: {}", e))?;

        session.writer.flush()
            .map_err(|e| format!("Flush failed: {}", e))?;

        Ok(())
    }

    /// Write commands silently (not shown to user)
    /// Sends command with leading space (ignored by history) and clears screen after
    pub fn write_silent(&mut self, terminal_id: &str, data: &str) -> Result<(), String> {
        let session = self.sessions.get_mut(terminal_id)
            .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

        // Leading space to ignore in history, clear to hide from user
        let silent_cmd = format!(" {} 2>/dev/null; clear\n", data.trim());

        session.writer.write_all(silent_cmd.as_bytes())
            .map_err(|e| format!("Write failed: {}", e))?;

        session.writer.flush()
            .map_err(|e| format!("Flush failed: {}", e))?;

        Ok(())
    }

    pub fn resize(&mut self, terminal_id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let session = self.sessions.get_mut(terminal_id)
            .ok_or_else(|| format!("Terminal {} not found", terminal_id))?;

        session.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| format!("Resize failed: {}", e))?;

        Ok(())
    }

    pub fn close(&mut self, terminal_id: &str) -> Result<(), String> {
        self.sessions.remove(terminal_id);
        Ok(())
    }
}

// Global terminal manager wrapped in mutex
lazy_static::lazy_static! {
    pub static ref TERMINAL_MANAGER: Arc<Mutex<TerminalManager>> =
        Arc::new(Mutex::new(TerminalManager::new()));
}
