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

    Ok(KubeConfigSummary {
        current_context: config.current_context.unwrap_or_default(),
        contexts,
        config_path: path.to_string_lossy().to_string(),
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
