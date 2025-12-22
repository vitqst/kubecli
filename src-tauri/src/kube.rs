use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};
use std::sync::mpsc;
use std::thread;
use lazy_static::lazy_static;
use std::sync::Mutex;

// Cache for available kubeconfig files to avoid rescanning on every context switch
lazy_static! {
    static ref AVAILABLE_CONFIGS: Mutex<Vec<KubeConfigFile>> = Mutex::new(Vec::new());
}

// Types matching the frontend's KubeTypes.ts

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContextInfo {
    pub name: String,
    pub cluster: String,
    pub user: String,
    pub namespace: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KubeConfigSummary {
    pub current_context: String,
    pub contexts: Vec<ContextInfo>,
    pub config_path: String,
    pub available_configs: Vec<KubeConfigFile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KubeConfigFile {
    pub path: String,
    pub name: String,
    pub is_default: bool,
}

// Internal types for parsing kubeconfig YAML

#[derive(Debug, Deserialize)]
struct KubeConfig {
    #[serde(rename = "current-context")]
    current_context: Option<String>,
    contexts: Option<Vec<KubeContext>>,
}

#[derive(Debug, Deserialize)]
struct KubeContext {
    name: String,
    context: KubeContextDetails,
}

#[derive(Debug, Deserialize)]
struct KubeContextDetails {
    cluster: String,
    user: String,
    namespace: Option<String>,
}

fn get_default_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".kube")
        .join("config")
}

fn scan_kube_configs() -> Result<Vec<KubeConfigFile>, String> {
    // First check cache
    let cached = AVAILABLE_CONFIGS.lock().map_err(|_| "Failed to lock cache")?;
    if !cached.is_empty() {
        return Ok(cached.clone());
    }
    drop(cached); // Release lock

    // Not cached, scan directory
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let kube_dir = home_dir.join(".kube");

    // Check if ~/.kube directory exists
    if !kube_dir.exists() {
        // Cache empty result
        let mut cache = AVAILABLE_CONFIGS.lock().map_err(|_| "Failed to lock cache")?;
        *cache = Vec::new();
        return Ok(vec![]);
    }

    // Read directory entries
    let entries = fs::read_dir(&kube_dir)
        .map_err(|e| format!("Failed to read ~/.kube directory: {}", e))?;

    let mut configs = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip directories
        if path.is_dir() {
            continue;
        }

        // Check if it's a file (not hidden like .env, .secrets)
        if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
            // Skip hidden files
            if filename.starts_with('.') {
                continue;
            }

            // Try to read and parse as kubeconfig, check if it has contexts
            if let Ok(contents) = fs::read_to_string(&path) {
                if let Ok(config) = serde_yaml::from_str::<KubeConfig>(&contents) {
                    // Only include configs that have at least one context
                    if let Some(contexts) = config.contexts {
                        if !contexts.is_empty() {
                            let name = if filename == "config" {
                                "default".to_string()
                            } else {
                                filename.to_string()
                            };

                            let is_default = filename.to_lowercase() == "config";

                            configs.push(KubeConfigFile {
                                path: path.to_string_lossy().to_string(),
                                name,
                                is_default,
                            });
                        }
                    }
                }
            }
        }
    }

    // Sort: default config first, then alphabetically
    configs.sort_by(|a, b| {
        if a.is_default && !b.is_default {
            std::cmp::Ordering::Less
        } else if !a.is_default && b.is_default {
            std::cmp::Ordering::Greater
        } else {
            a.name.cmp(&b.name)
        }
    });

    // Cache the results
    let mut cache = AVAILABLE_CONFIGS.lock().map_err(|_| "Failed to lock cache")?;
    *cache = configs.clone();

    Ok(configs)
}

pub fn parse_kubeconfig(config_path: Option<String>) -> Result<KubeConfigSummary, String> {
    let path = config_path
        .map(PathBuf::from)
        .unwrap_or_else(get_default_config_path);

    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read kubeconfig: {}", e))?;

    let config: KubeConfig = serde_yaml::from_str(&contents)
        .map_err(|e| format!("Failed to parse kubeconfig: {}", e))?;

    let contexts = config
        .contexts
        .unwrap_or_default()
        .into_iter()
        .map(|ctx| ContextInfo {
            name: ctx.name,
            cluster: ctx.context.cluster,
            user: ctx.context.user,
            namespace: ctx.context.namespace,
        })
        .collect();

    // Scan for available kubeconfig files
    let available_configs = scan_kube_configs()
        .unwrap_or_else(|e| {
            eprintln!("Warning: Failed to scan kube configs: {}", e);
            vec![]
        });

    Ok(KubeConfigSummary {
        current_context: config.current_context.unwrap_or_default(),
        contexts,
        config_path: path.to_string_lossy().to_string(),
        available_configs,
    })
}

pub fn run_kubectl(args: Vec<String>, config_path: Option<String>) -> Result<String, String> {
    run_kubectl_with_timeout(args, config_path, Duration::from_secs(120), 2)
}

/// Run kubectl command with timeout and retry logic
/// If a command times out, it will be retried up to `max_retries` times
fn run_kubectl_with_timeout(
    args: Vec<String>,
    config_path: Option<String>,
    timeout: Duration,
    max_retries: u32,
) -> Result<String, String> {
    let mut last_error = String::new();

    for attempt in 0..=max_retries {
        if attempt > 0 {
            eprintln!("[kubectl] Retry attempt {} for: {:?}", attempt, args);
        }

        match run_kubectl_once(&args, &config_path, timeout) {
            Ok(output) => return Ok(output),
            Err(e) => {
                last_error = e;
                if attempt < max_retries {
                    // Brief pause before retry
                    thread::sleep(Duration::from_millis(100));
                }
            }
        }
    }

    Err(last_error)
}

/// Execute a single kubectl command with timeout
fn run_kubectl_once(
    args: &[String],
    config_path: &Option<String>,
    timeout: Duration,
) -> Result<String, String> {
    let mut cmd = Command::new("kubectl");

    // Inherit HOME for Azure CLI credentials (~/.azure/)
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", &home);
    }

    // Inherit PATH to find kubelogin and az CLI
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", &path);
    }

    // Inherit Azure-specific env vars for auth
    // kubelogin needs these to find cached tokens and authenticate
    for var in &[
        "AZURE_CONFIG_DIR",
        "AZURE_CLI_HOME",
        "KUBELOGIN_FORCE_NONINTERACTIVE",
        "AZURE_TENANT_ID",
        "AZURE_CLIENT_ID",
        "AZURE_CLIENT_SECRET",
        "AZURE_AUTHORITY_HOST",
        "AZURE_FEDERATED_TOKEN_FILE",
        "XDG_RUNTIME_DIR",
        "XDG_CACHE_HOME",
        "XDG_DATA_HOME",
    ] {
        if let Ok(val) = std::env::var(var) {
            cmd.env(var, val);
        }
    }

    if let Some(ref path) = config_path {
        cmd.env("KUBECONFIG", path);
    }

    cmd.args(args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let start = Instant::now();
    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    // Use a channel to wait for the process with timeout
    let (tx, rx) = mpsc::channel();

    // Spawn a thread to wait for the child process
    let wait_thread = thread::spawn(move || {
        let result = child.wait_with_output();
        let _ = tx.send(result);
    });

    // Wait for the result with timeout
    match rx.recv_timeout(timeout) {
        Ok(result) => {
            let _ = wait_thread.join();
            let output = result.map_err(|e| format!("Failed to wait for kubectl: {}", e))?;
            let elapsed = start.elapsed();

            if output.status.success() {
                eprintln!("[kubectl] Success in {:?}: {:?}", elapsed, args);
                String::from_utf8(output.stdout)
                    .map_err(|e| format!("Invalid UTF-8 in output: {}", e))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!("kubectl error: {}", stderr))
            }
        }
        Err(mpsc::RecvTimeoutError::Timeout) => {
            eprintln!("[kubectl] Timeout after {:?}: {:?}", timeout, args);
            // Let the process finish in background - don't try to kill it
            // as that can cause crashes
            drop(wait_thread);
            Err(format!("kubectl timed out after {:?}", timeout))
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => {
            drop(wait_thread);
            Err("kubectl process monitoring failed".to_string())
        }
    }
}

pub fn set_context(config_path: String, context_name: String) -> Result<(), String> {
    run_kubectl(
        vec![
            "--kubeconfig".to_string(),
            config_path,
            "config".to_string(),
            "use-context".to_string(),
            context_name,
        ],
        None,
    )?;
    Ok(())
}

pub fn set_namespace(
    config_path: String,
    context: String,
    namespace: String,
) -> Result<(), String> {
    run_kubectl(
        vec![
            "--kubeconfig".to_string(),
            config_path,
            "config".to_string(),
            "set-context".to_string(),
            context,
            "--namespace".to_string(),
            namespace,
        ],
        None,
    )?;
    Ok(())
}
