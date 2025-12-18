use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

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
    let home_dir = dirs::home_dir().ok_or("Failed to get home directory")?;
    let kube_dir = home_dir.join(".kube");

    // Check if ~/.kube directory exists
    if !kube_dir.exists() {
        return Ok(vec![]);
    }

    // Read directory entries
    let entries = fs::read_dir(&kube_dir)
        .map_err(|e| format!("Failed to read ~/.kube directory: {}", e))?;

    let mut configs = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Check if file starts with "config" (case-insensitive)
        if let Some(filename) = path.file_name().and_then(|s| s.to_str()) {
            if filename.to_lowercase().starts_with("config") {
                // Get file name without extension for display
                let name = if filename == "config" {
                    "default".to_string()
                } else {
                    // Remove "config" prefix and any extensions
                    let stripped = filename.trim_start_matches("config");
                    let cleaned = stripped.trim_start_matches('-').trim_start_matches('_');
                    if cleaned.is_empty() {
                        filename.to_string()
                    } else {
                        cleaned.to_string()
                    }
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
    let mut cmd = Command::new("kubectl");

    if let Some(path) = config_path {
        cmd.env("KUBECONFIG", path);
    }

    cmd.args(&args);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute kubectl: {}", e))?;

    if output.status.success() {
        String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 in output: {}", e))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("kubectl error: {}", stderr))
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
