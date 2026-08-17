use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

const AUTH_DIAGNOSTIC_LOG_NAME: &str = "kubecli-azure-auth.log";
const AUTH_DIAGNOSTIC_MAX_BYTES: u64 = 4 * 1024 * 1024;

lazy_static::lazy_static! {
    static ref AUTH_DIAGNOSTIC_LOCK: Mutex<()> = Mutex::new(());
}

pub(crate) fn auth_diagnostic_log_path() -> PathBuf {
    std::env::temp_dir().join(AUTH_DIAGNOSTIC_LOG_NAME)
}

pub(crate) fn diagnostic_value(value: &str) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut escaped = collapsed.replace('\\', "\\\\").replace('"', "\\\"");
    if escaped.chars().count() > 2_000 {
        escaped = escaped.chars().take(2_000).collect::<String>();
        escaped.push('…');
    }
    escaped
}

fn append_auth_diagnostic_to(
    path: &Path,
    event: &str,
    fields: &[(&str, String)],
) -> std::io::Result<()> {
    let _guard = AUTH_DIAGNOSTIC_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let rotate = path
        .metadata()
        .map(|metadata| metadata.len() >= AUTH_DIAGNOSTIC_MAX_BYTES)
        .unwrap_or(false);
    let mut options = OpenOptions::new();
    options.create(true).write(true);
    if rotate {
        options.truncate(true);
    } else {
        options.append(true);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path)?;
    let timestamp_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let mut line = format!(
        "timestamp_ms={} pid={} event=\"{}\"",
        timestamp_ms,
        std::process::id(),
        diagnostic_value(event)
    );
    for (name, value) in fields {
        line.push(' ');
        line.push_str(name);
        line.push_str("=\"");
        line.push_str(&diagnostic_value(value));
        line.push('"');
    }
    writeln!(file, "{line}")
}

pub(crate) fn log_auth_diagnostic(event: &str, fields: &[(&str, String)]) {
    let _ = append_auth_diagnostic_to(&auth_diagnostic_log_path(), event, fields);
}

fn command_label(program: &str, args: &[String]) -> String {
    let executable = program.rsplit(['/', '\\']).next().unwrap_or(program);
    match executable {
        "az" => format!(
            "az {}",
            args.iter()
                .take(2)
                .map(String::as_str)
                .collect::<Vec<_>>()
                .join(" ")
        ),
        "kubectl" => "kubectl cluster probe".to_string(),
        "kubelogin" => format!(
            "kubelogin {}",
            args.first().map(String::as_str).unwrap_or("<none>")
        ),
        _ => executable.to_string(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AzureContextInfo {
    pub context_name: String,
    pub cluster_name: String,
    pub user_name: String,
    pub tenant_id: Option<String>,
    pub login_mode: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AzureAuthState {
    NotAzure,
    Active,
    Expired,
    SignedOut,
    Error,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureAccountSummary {
    pub username: String,
    pub subscription_id: String,
    pub subscription_name: String,
    pub tenant_id: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureSessionStatus {
    pub state: AzureAuthState,
    pub context_name: String,
    pub tenant_id: Option<String>,
    pub login_mode: Option<String>,
    pub account: Option<AzureAccountSummary>,
    pub accounts: Vec<AzureAccountSummary>,
    pub expires_at_epoch_seconds: Option<i64>,
    pub affected_contexts: Vec<String>,
    pub reason: Option<String>,
    pub safe_message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AzureCommandOutput {
    pub stdout: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AzureCommandError {
    NotFound,
    Timeout,
    Failed { stderr: String },
    Io,
}

pub trait AzureCommandRunner {
    fn run(
        &self,
        program: &str,
        args: &[String],
        timeout: Duration,
    ) -> Result<AzureCommandOutput, AzureCommandError>;

    fn run_with_env(
        &self,
        program: &str,
        args: &[String],
        timeout: Duration,
        _env: &[(String, String)],
    ) -> Result<AzureCommandOutput, AzureCommandError> {
        self.run(program, args, timeout)
    }

    fn run_with_env_discarding_stdout(
        &self,
        program: &str,
        args: &[String],
        timeout: Duration,
        env: &[(String, String)],
    ) -> Result<(), AzureCommandError> {
        self.run_with_env(program, args, timeout, env).map(|_| ())
    }
}

pub struct SystemAzureCommandRunner;

fn terminate_command_tree(child: &mut std::process::Child) {
    #[cfg(unix)]
    {
        let process_group = -(child.id() as libc::pid_t);
        // The command is spawned in its own process group, so this targets only that command tree.
        unsafe {
            libc::kill(process_group, libc::SIGKILL);
        }
    }
    let _ = child.kill();
}

impl SystemAzureCommandRunner {
    fn run_command(
        program: &str,
        args: &[String],
        timeout: Duration,
        env: &[(String, String)],
        capture_stdout: bool,
    ) -> Result<AzureCommandOutput, AzureCommandError> {
        let started = Instant::now();
        let label = command_label(program, args);
        log_auth_diagnostic(
            "command.start",
            &[
                ("command", label.clone()),
                ("timeout_ms", timeout.as_millis().to_string()),
                (
                    "env_names",
                    env.iter()
                        .map(|(name, _)| name.as_str())
                        .collect::<Vec<_>>()
                        .join(","),
                ),
            ],
        );
        let mut command = Command::new(program);
        command.args(args).stderr(Stdio::piped());
        if capture_stdout {
            command.stdout(Stdio::piped());
        } else {
            command.stdout(Stdio::null());
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.process_group(0);
        }
        for (name, value) in env {
            command.env(name, value);
        }

        let mut child = match command.spawn() {
            Ok(child) => child,
            Err(error) => {
                let kind = if error.kind() == std::io::ErrorKind::NotFound {
                    AzureCommandError::NotFound
                } else {
                    AzureCommandError::Io
                };
                log_auth_diagnostic(
                    "command.spawn_failed",
                    &[
                        ("command", label),
                        ("error_kind", format!("{kind:?}")),
                        ("detail", error.to_string()),
                    ],
                );
                return Err(kind);
            }
        };
        let mut stdout_reader = child.stdout.take().map(|mut stdout| {
            thread::spawn(move || {
                let mut bytes = Vec::new();
                let result = stdout.read_to_end(&mut bytes);
                (result, bytes)
            })
        });
        let mut stderr_reader = child.stderr.take().map(|mut stderr| {
            thread::spawn(move || {
                let mut bytes = Vec::new();
                let result = stderr.read_to_end(&mut bytes);
                (result, bytes)
            })
        });
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if started.elapsed() < timeout => {
                    thread::sleep(Duration::from_millis(25));
                }
                Ok(None) => {
                    terminate_command_tree(&mut child);
                    let _ = child.wait();
                    if let Some(reader) = stdout_reader.take() {
                        let _ = reader.join();
                    }
                    if let Some(reader) = stderr_reader.take() {
                        let _ = reader.join();
                    }
                    log_auth_diagnostic(
                        "command.wait_failed",
                        &[
                            ("command", label),
                            ("elapsed_ms", started.elapsed().as_millis().to_string()),
                            ("error_kind", "Timeout".to_string()),
                        ],
                    );
                    return Err(AzureCommandError::Timeout);
                }
                Err(error) => {
                    terminate_command_tree(&mut child);
                    let _ = child.wait();
                    if let Some(reader) = stdout_reader.take() {
                        let _ = reader.join();
                    }
                    if let Some(reader) = stderr_reader.take() {
                        let _ = reader.join();
                    }
                    log_auth_diagnostic(
                        "command.wait_failed",
                        &[
                            ("command", label),
                            ("elapsed_ms", started.elapsed().as_millis().to_string()),
                            ("error_kind", "Io".to_string()),
                            ("detail", error.to_string()),
                        ],
                    );
                    return Err(AzureCommandError::Io);
                }
            }
        };
        let stdout = match stdout_reader.and_then(|reader| reader.join().ok()) {
            Some((Ok(_), bytes)) => String::from_utf8_lossy(&bytes).to_string(),
            Some((Err(error), _)) => {
                log_auth_diagnostic(
                    "command.output_failed",
                    &[
                        ("command", label.clone()),
                        ("elapsed_ms", started.elapsed().as_millis().to_string()),
                        ("error_kind", "Io".to_string()),
                        ("detail", error.to_string()),
                    ],
                );
                return Err(AzureCommandError::Io);
            }
            None => String::new(),
        };
        let stderr = match stderr_reader.and_then(|reader| reader.join().ok()) {
            Some((Ok(_), bytes)) => String::from_utf8_lossy(&bytes).to_string(),
            Some((Err(error), _)) => {
                log_auth_diagnostic(
                    "command.output_failed",
                    &[
                        ("command", label.clone()),
                        ("elapsed_ms", started.elapsed().as_millis().to_string()),
                        ("error_kind", "Io".to_string()),
                        ("detail", error.to_string()),
                    ],
                );
                return Err(AzureCommandError::Io);
            }
            None => String::new(),
        };
        log_auth_diagnostic(
            "command.finish",
            &[
                ("command", label),
                ("success", status.success().to_string()),
                (
                    "exit_code",
                    status
                        .code()
                        .map(|code| code.to_string())
                        .unwrap_or_else(|| "signal".to_string()),
                ),
                ("elapsed_ms", started.elapsed().as_millis().to_string()),
                ("stdout_bytes", stdout.len().to_string()),
                ("stderr_bytes", stderr.len().to_string()),
            ],
        );
        if !status.success() {
            return Err(AzureCommandError::Failed { stderr });
        }

        Ok(AzureCommandOutput { stdout })
    }
}

impl AzureCommandRunner for SystemAzureCommandRunner {
    fn run(
        &self,
        program: &str,
        args: &[String],
        timeout: Duration,
    ) -> Result<AzureCommandOutput, AzureCommandError> {
        Self::run_command(program, args, timeout, &[], true)
    }

    fn run_with_env(
        &self,
        program: &str,
        args: &[String],
        timeout: Duration,
        env: &[(String, String)],
    ) -> Result<AzureCommandOutput, AzureCommandError> {
        Self::run_command(program, args, timeout, env, true)
    }

    fn run_with_env_discarding_stdout(
        &self,
        program: &str,
        args: &[String],
        timeout: Duration,
        env: &[(String, String)],
    ) -> Result<(), AzureCommandError> {
        Self::run_command(program, args, timeout, env, false).map(|_| ())
    }
}

#[derive(Debug, Deserialize)]
struct AuthKubeConfig {
    #[serde(default)]
    contexts: Vec<AuthContextEntry>,
    #[serde(default)]
    users: Vec<AuthUserEntry>,
}

#[derive(Debug, Deserialize)]
struct AuthContextEntry {
    name: String,
    context: AuthContext,
}

#[derive(Debug, Deserialize)]
struct AuthContext {
    cluster: String,
    user: String,
}

#[derive(Debug, Deserialize)]
struct AuthUserEntry {
    name: String,
    user: AuthUser,
}

#[derive(Debug, Deserialize)]
struct AuthUser {
    exec: Option<AuthExec>,
}

#[derive(Debug, Deserialize)]
struct AuthExec {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    env: Option<Vec<AuthEnv>>,
}

#[derive(Debug, Deserialize)]
struct AuthEnv {
    name: String,
    value: String,
}

fn executable_name(command: &str) -> &str {
    command.rsplit(['/', '\\']).next().unwrap_or(command)
}

fn argument_value(args: &[String], names: &[&str]) -> Option<String> {
    for (index, argument) in args.iter().enumerate() {
        if names.contains(&argument.as_str()) {
            return args.get(index + 1).cloned();
        }

        for name in names {
            if let Some(value) = argument.strip_prefix(&format!("{}=", name)) {
                return Some(value.to_string());
            }
        }
    }

    None
}

pub fn discover_azure_contexts(kubeconfig_yaml: &str) -> Result<Vec<AzureContextInfo>, String> {
    let config: AuthKubeConfig = serde_yaml::from_str(kubeconfig_yaml)
        .map_err(|error| format!("Failed to parse kubeconfig authentication: {}", error))?;

    let users: HashMap<_, _> = config
        .users
        .into_iter()
        .map(|entry| (entry.name, entry.user))
        .collect();

    let contexts = config
        .contexts
        .into_iter()
        .filter_map(|entry| {
            let user = users.get(&entry.context.user)?;
            let exec = user.exec.as_ref()?;
            if !executable_name(&exec.command).eq_ignore_ascii_case("kubelogin") {
                return None;
            }

            let login_mode = effective_login_mode(exec);
            let tenant_id =
                argument_value(&exec.args, &["--tenant-id", "--tenant", "-t"]).or_else(|| {
                    exec.env
                        .iter()
                        .flatten()
                        .find(|item| item.name == "AZURE_TENANT_ID" || item.name == "AAD_TENANT_ID")
                        .map(|item| item.value.clone())
                });

            Some(AzureContextInfo {
                context_name: entry.name,
                cluster_name: entry.context.cluster,
                user_name: entry.context.user,
                tenant_id,
                login_mode,
            })
        })
        .collect();

    Ok(contexts)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SharedKubeloginIdentity {
    #[serde(default)]
    authority: String,
    #[serde(default)]
    client_id: String,
    #[serde(default)]
    tenant_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum NativeKubeloginCacheCheck {
    Compatible,
    Unavailable(AzureSessionStatus),
}

fn selected_auth_exec<'a>(config: &'a AuthKubeConfig, context_name: &str) -> Option<&'a AuthExec> {
    let user_name = config
        .contexts
        .iter()
        .find(|entry| entry.name == context_name)?
        .context
        .user
        .as_str();
    config
        .users
        .iter()
        .find(|entry| entry.name == user_name)?
        .user
        .exec
        .as_ref()
}

fn command_env_value(exec: &AuthExec, name: &str) -> Option<String> {
    exec.env
        .iter()
        .flatten()
        .rev()
        .find(|item| item.name == name)
        .map(|item| item.value.clone())
        .or_else(|| std::env::var(name).ok())
}

fn argument_flag_enabled(args: &[String], name: &str) -> bool {
    args.iter().any(|argument| {
        argument == name
            || argument
                .strip_prefix(&format!("{name}="))
                .is_some_and(|value| !value.eq_ignore_ascii_case("false"))
    })
}

fn effective_login_mode(exec: &AuthExec) -> String {
    let configured =
        argument_value(&exec.args, &["--login", "-l"]).unwrap_or_else(|| "devicecode".to_string());
    if argument_flag_enabled(&exec.args, "--disable-environment-override") {
        return configured;
    }
    command_env_value(exec, "AAD_LOGIN_METHOD").unwrap_or(configured)
}

fn is_shared_user_login_mode(login_mode: &str) -> bool {
    matches!(login_mode, "azurecli" | "devicecode" | "interactive")
}

fn default_authority_host(environment: &str) -> &'static str {
    match environment.to_ascii_lowercase().as_str() {
        "azurechinacloud" => "https://login.chinacloudapi.cn",
        "azureusgovernment" => "https://login.microsoftonline.us",
        "azuregermancloud" => "https://login.microsoftonline.de",
        _ => "https://login.microsoftonline.com",
    }
}

fn cache_path_for_exec(exec: &AuthExec) -> Option<PathBuf> {
    let exec_home = command_env_value(exec, "HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))?;
    let cache_dir = argument_value(&exec.args, &["--cache-dir", "--token-cache-dir"])
        .or_else(|| command_env_value(exec, "KUBECACHEDIR"))
        .map(PathBuf::from);
    let cache_dir = match cache_dir {
        Some(path) if path.starts_with("~") => path
            .strip_prefix("~")
            .map(|suffix| exec_home.join(suffix))
            .unwrap_or(path),
        Some(path) => path,
        None => exec_home.join(".kube/cache/kubelogin"),
    };
    Some(cache_dir.join("auth.json"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NativeKubeloginScope {
    tenant_id: String,
    client_id: String,
    cache_path: PathBuf,
    environment: String,
    authority_host: String,
}

fn native_kubelogin_scope(exec: &AuthExec) -> Option<NativeKubeloginScope> {
    if !executable_name(&exec.command).eq_ignore_ascii_case("kubelogin")
        || exec.args.first().map(String::as_str) != Some("get-token")
    {
        return None;
    }
    let environment_override = !argument_flag_enabled(&exec.args, "--disable-environment-override");
    let login_mode = effective_login_mode(exec);
    if !is_shared_user_login_mode(&login_mode) {
        return None;
    }
    // An azurecli kubeconfig can only be redirected to the shared device-code
    // cache through kubelogin's environment override. If the kubeconfig
    // explicitly disables that mechanism, leave it on its configured backend.
    if login_mode != "devicecode" && !environment_override {
        return None;
    }
    let environment = argument_value(&exec.args, &["--environment", "-e"])
        .unwrap_or_else(|| "AzurePublicCloud".to_string());
    let authority_host = argument_value(&exec.args, &["--authority-host"])
        .unwrap_or_else(|| default_authority_host(&environment).to_string());
    let use_azurerm = argument_flag_enabled(&exec.args, "--use-azurerm-env-vars");
    let mut tenant_id =
        argument_value(&exec.args, &["--tenant-id", "--tenant", "-t"]).unwrap_or_default();
    let mut client_id = argument_value(&exec.args, &["--client-id"]).unwrap_or_default();
    if environment_override {
        if use_azurerm {
            if let Some(value) = command_env_value(exec, "ARM_TENANT_ID") {
                tenant_id = value;
            }
            if let Some(value) = command_env_value(exec, "ARM_CLIENT_ID") {
                client_id = value;
            }
        } else {
            if let Some(value) = command_env_value(exec, "AZURE_TENANT_ID") {
                tenant_id = value;
            }
            if let Some(value) = command_env_value(exec, "AAD_SERVICE_PRINCIPAL_CLIENT_ID") {
                client_id = value;
            }
            if let Some(value) = command_env_value(exec, "AZURE_CLIENT_ID") {
                client_id = value;
            }
        }
    }
    Some(NativeKubeloginScope {
        tenant_id: tenant_id.to_ascii_lowercase(),
        client_id: client_id.to_ascii_lowercase(),
        cache_path: cache_path_for_exec(exec)?,
        environment: environment.to_ascii_lowercase(),
        authority_host: authority_host.trim_end_matches('/').to_ascii_lowercase(),
    })
}

fn compatible_native_contexts(kubeconfig_yaml: &str, context_name: &str) -> Vec<String> {
    let Ok(config) = serde_yaml::from_str::<AuthKubeConfig>(kubeconfig_yaml) else {
        return Vec::new();
    };
    let Some(selected_scope) =
        selected_auth_exec(&config, context_name).and_then(native_kubelogin_scope)
    else {
        return Vec::new();
    };
    config
        .contexts
        .iter()
        .filter_map(|context| {
            let scope =
                selected_auth_exec(&config, &context.name).and_then(native_kubelogin_scope)?;
            (scope == selected_scope).then(|| context.name.clone())
        })
        .collect()
}

fn native_kubelogin_cache_path(kubeconfig_yaml: &str, context_name: &str) -> Option<PathBuf> {
    let config: AuthKubeConfig = serde_yaml::from_str(kubeconfig_yaml).ok()?;
    let exec = selected_auth_exec(&config, context_name)?;
    native_kubelogin_scope(exec).map(|scope| scope.cache_path)
}

pub(crate) fn kubelogin_runtime_env(
    kubeconfig_yaml: &str,
    context_name: &str,
) -> Option<Vec<(String, String)>> {
    let config: AuthKubeConfig = serde_yaml::from_str(kubeconfig_yaml).ok()?;
    let scope = selected_auth_exec(&config, context_name).and_then(native_kubelogin_scope)?;
    let cached_identity = std::fs::read_to_string(&scope.cache_path)
        .ok()
        .and_then(|contents| serde_json::from_str::<SharedKubeloginIdentity>(&contents).ok());
    Some(kubelogin_runtime_env_for_scope(
        scope,
        cached_identity.as_ref(),
    ))
}

fn kubelogin_runtime_env_for_scope(
    scope: NativeKubeloginScope,
    cached_identity: Option<&SharedKubeloginIdentity>,
) -> Vec<(String, String)> {
    let mut env = vec![("AAD_LOGIN_METHOD".to_string(), "devicecode".to_string())];
    let tenant_id = if scope.tenant_id.is_empty() {
        cached_identity
            .map(|identity| identity.tenant_id.clone())
            .unwrap_or_default()
    } else {
        scope.tenant_id
    };
    let client_id = if scope.client_id.is_empty() {
        cached_identity
            .map(|identity| identity.client_id.clone())
            .unwrap_or_default()
    } else {
        scope.client_id
    };
    if !tenant_id.is_empty() {
        env.push(("AZURE_TENANT_ID".to_string(), tenant_id));
    }
    if !client_id.is_empty() {
        env.push(("AZURE_CLIENT_ID".to_string(), client_id));
    }
    env
}

fn check_native_kubelogin_cache(
    kubeconfig_yaml: &str,
    context_name: &str,
    cache_json: Option<&str>,
) -> Option<NativeKubeloginCacheCheck> {
    let contexts = discover_azure_contexts(kubeconfig_yaml).ok()?;
    let selected = contexts
        .iter()
        .find(|context| context.context_name == context_name)?;
    if !is_shared_user_login_mode(&selected.login_mode) {
        return None;
    }

    let config: AuthKubeConfig = serde_yaml::from_str(kubeconfig_yaml).ok()?;
    let exec = selected_auth_exec(&config, context_name)?;
    let scope = native_kubelogin_scope(exec)?;
    let affected_contexts = compatible_native_contexts(kubeconfig_yaml, context_name);
    let mut status = base_status(context_name, AzureAuthState::SignedOut);
    status.tenant_id = if scope.tenant_id.is_empty() {
        selected.tenant_id.clone()
    } else {
        Some(scope.tenant_id.clone())
    };
    status.login_mode = Some(selected.login_mode.clone());
    status.affected_contexts = affected_contexts;

    let Some(cache_json) = cache_json else {
        status.reason = Some("kubeloginCacheMissing".to_string());
        status.safe_message =
            Some("Sign in once to unlock compatible Kubernetes contexts.".to_string());
        return Some(NativeKubeloginCacheCheck::Unavailable(status));
    };
    let identity: SharedKubeloginIdentity = match serde_json::from_str(cache_json) {
        Ok(identity) => identity,
        Err(_) => {
            status.reason = Some("kubeloginCacheUnreadable".to_string());
            status.safe_message =
                Some("Kubelogin's saved session could not be read. Sign in again.".to_string());
            return Some(NativeKubeloginCacheCheck::Unavailable(status));
        }
    };
    if status.tenant_id.is_none() && !identity.tenant_id.is_empty() {
        status.tenant_id = Some(identity.tenant_id.clone());
    }
    let tenant_matches =
        scope.tenant_id.is_empty() || scope.tenant_id.eq_ignore_ascii_case(&identity.tenant_id);
    let client_matches =
        scope.client_id.is_empty() || scope.client_id.eq_ignore_ascii_case(&identity.client_id);
    let cached_authority = identity
        .authority
        .trim_end_matches('/')
        .to_ascii_lowercase();
    let authority_matches = !cached_authority.is_empty()
        && (cached_authority == scope.authority_host
            || cached_authority.starts_with(&format!("{}/", scope.authority_host)));
    if !tenant_matches || !client_matches || !authority_matches {
        status.reason = Some("kubeloginIdentityMismatch".to_string());
        status.safe_message =
            Some("The shared kubelogin session belongs to a different Azure context.".to_string());
        return Some(NativeKubeloginCacheCheck::Unavailable(status));
    }

    Some(NativeKubeloginCacheCheck::Compatible)
}

fn verify_native_kubelogin_context_with_runner<R: AzureCommandRunner>(
    kubeconfig_yaml: &str,
    config_path: &str,
    context_name: &str,
    runner: &R,
) -> AzureSessionStatus {
    let contexts = match discover_azure_contexts(kubeconfig_yaml) {
        Ok(contexts) => contexts,
        Err(_) => {
            let mut status = base_status(context_name, AzureAuthState::Error);
            status.reason = Some("invalidKubeconfig".to_string());
            status.safe_message = Some(
                "KubeCLI could not read Azure authentication settings from this kubeconfig."
                    .to_string(),
            );
            return status;
        }
    };
    let Some(selected) = contexts
        .iter()
        .find(|context| context.context_name == context_name)
    else {
        return base_status(context_name, AzureAuthState::NotAzure);
    };
    let runtime_env = kubelogin_runtime_env(kubeconfig_yaml, context_name).unwrap_or_default();
    let effective_tenant = runtime_env
        .iter()
        .find(|(name, _)| name == "AZURE_TENANT_ID")
        .map(|(_, value)| value.clone())
        .or_else(|| selected.tenant_id.clone());
    let affected_contexts = compatible_native_contexts(kubeconfig_yaml, context_name);
    let mut invocation = match build_native_kubelogin_login(
        kubeconfig_yaml,
        context_name,
        AzureLoginMethod::DeviceCode,
    ) {
        Ok(invocation) => invocation,
        Err(error) => {
            let mut status = base_status(context_name, AzureAuthState::Error);
            status.tenant_id = effective_tenant.clone();
            status.login_mode = Some(selected.login_mode.clone());
            status.affected_contexts = affected_contexts;
            status.reason = Some("invalidKubeloginExec".to_string());
            status.safe_message = Some(error);
            return status;
        }
    };
    merge_command_env(&mut invocation.env, &runtime_env);
    if let Err(error) = runner.run_with_env_discarding_stdout(
        &invocation.program,
        &invocation.args,
        Duration::from_secs(5),
        &invocation.env,
    ) {
        let mut status = base_status(context_name, AzureAuthState::Error);
        status.tenant_id = effective_tenant.clone();
        status.login_mode = Some(selected.login_mode.clone());
        status.affected_contexts = affected_contexts;
        match error {
            AzureCommandError::NotFound => {
                status.reason = Some("kubeloginMissing".to_string());
                status.safe_message = Some(
                    "kubelogin is not installed or is not available in KubeCLI's PATH.".to_string(),
                );
            }
            AzureCommandError::Timeout | AzureCommandError::Failed { .. } => {
                status.state = AzureAuthState::Expired;
                status.reason = Some("interactionRequired".to_string());
                status.safe_message =
                    Some("The shared kubelogin session needs you to sign in again.".to_string());
            }
            AzureCommandError::Io => {
                status.reason = Some("kubeloginFailed".to_string());
                status.safe_message = Some("KubeCLI could not start kubelogin.".to_string());
            }
        }
        return status;
    }
    let args = vec![
        "--kubeconfig".to_string(),
        config_path.to_string(),
        "--context".to_string(),
        context_name.to_string(),
        "--request-timeout=10s".to_string(),
        "get".to_string(),
        "--raw=/version".to_string(),
    ];
    let result = runner.run_with_env("kubectl", &args, Duration::from_secs(15), &runtime_env);
    let mut status = base_status(
        context_name,
        if result.is_ok() {
            AzureAuthState::Active
        } else {
            AzureAuthState::Error
        },
    );
    status.tenant_id = effective_tenant;
    status.login_mode = Some(selected.login_mode.clone());
    status.affected_contexts = affected_contexts;
    if let Err(error) = result {
        match error {
            AzureCommandError::NotFound => {
                status.reason = Some("kubectlMissing".to_string());
                status.safe_message = Some(
                    "kubectl is not installed or is not available in KubeCLI's PATH.".to_string(),
                );
            }
            AzureCommandError::Timeout => {
                status.state = AzureAuthState::Expired;
                status.reason = Some("interactionRequired".to_string());
                status.safe_message =
                    Some("The shared kubelogin session needs you to sign in again.".to_string());
            }
            AzureCommandError::Failed { stderr } => {
                let lower = stderr.to_lowercase();
                if lower.contains("provide credentials")
                    || lower.contains("must be logged in")
                    || lower.contains("unauthorized")
                    || lower.contains("device code")
                    || lower.contains("microsoft.com/devicelogin")
                {
                    status.state = AzureAuthState::Expired;
                    status.reason = Some("clusterAuthRejected".to_string());
                    status.safe_message = Some(
                        "Kubernetes still requires Azure credentials. Try signing in again."
                            .to_string(),
                    );
                } else {
                    status.reason = Some("clusterProbeFailed".to_string());
                    status.safe_message =
                        Some("KubeCLI could not verify Kubernetes access.".to_string());
                }
            }
            AzureCommandError::Io => {
                status.reason = Some("clusterProbeFailed".to_string());
                status.safe_message = Some("KubeCLI could not start kubectl.".to_string());
            }
        }
    }
    status
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawAzureAccount {
    id: String,
    name: String,
    tenant_id: String,
    #[serde(default)]
    is_default: bool,
    #[serde(default)]
    state: String,
    user: RawAzureUser,
}

#[derive(Debug, Deserialize)]
struct RawAzureUser {
    name: String,
}

#[derive(Debug, Deserialize)]
struct RawTokenMetadata {
    #[serde(default)]
    expires_on: serde_json::Value,
}

fn base_status(context_name: &str, state: AzureAuthState) -> AzureSessionStatus {
    AzureSessionStatus {
        state,
        context_name: context_name.to_string(),
        tenant_id: None,
        login_mode: None,
        account: None,
        accounts: Vec::new(),
        expires_at_epoch_seconds: None,
        affected_contexts: Vec::new(),
        reason: None,
        safe_message: None,
    }
}

fn safe_command_error(
    context_name: &str,
    selected: &AzureContextInfo,
    accounts: Vec<AzureAccountSummary>,
    error: AzureCommandError,
) -> AzureSessionStatus {
    let mut status = base_status(context_name, AzureAuthState::Error);
    status.tenant_id = selected.tenant_id.clone();
    status.login_mode = Some(selected.login_mode.clone());
    status.account = accounts
        .iter()
        .find(|account| account.is_default)
        .cloned()
        .or_else(|| accounts.first().cloned());
    status.accounts = accounts;

    match error {
        AzureCommandError::NotFound => {
            status.reason = Some("cliMissing".to_string());
            status.safe_message = Some(
                "Azure CLI is not installed or is not available in KubeCLI's PATH.".to_string(),
            );
        }
        AzureCommandError::Timeout => {
            status.reason = Some("cliTimeout".to_string());
            status.safe_message = Some("Azure CLI did not respond in time.".to_string());
        }
        AzureCommandError::Failed { stderr } => {
            let lower = stderr.to_lowercase();
            if lower.contains("az login")
                || lower.contains("interaction_required")
                || lower.contains("interaction required")
                || lower.contains("aadsts50058")
                || lower.contains("credential unavailable")
            {
                status.state = if status.accounts.is_empty() {
                    AzureAuthState::SignedOut
                } else {
                    AzureAuthState::Expired
                };
                status.reason = Some("interactionRequired".to_string());
                status.safe_message =
                    Some("Your Azure session needs you to sign in again.".to_string());
            } else {
                status.reason = Some("cliFailed".to_string());
                status.safe_message = Some(
                    "Azure CLI could not verify this session. Open session details to retry."
                        .to_string(),
                );
            }
        }
        AzureCommandError::Io => {
            status.reason = Some("cliFailed".to_string());
            status.safe_message = Some("KubeCLI could not start Azure CLI.".to_string());
        }
    }

    status
}

fn epoch_seconds(value: &serde_json::Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_str().and_then(|item| item.parse::<i64>().ok()))
}

fn resolve_context_tenant_with_runner<R: AzureCommandRunner>(
    kubeconfig_yaml: &str,
    config_path: &str,
    context_name: &str,
    runner: &R,
) -> Option<String> {
    let contexts = discover_azure_contexts(kubeconfig_yaml).ok()?;
    let selected = contexts
        .iter()
        .find(|context| context.context_name == context_name)?;
    if selected.login_mode != "azurecli" {
        return selected.tenant_id.clone();
    }
    if selected.tenant_id.is_some() {
        return selected.tenant_id.clone();
    }

    let account_args = vec![
        "account".to_string(),
        "list".to_string(),
        "--all".to_string(),
        "--query".to_string(),
        "[].{id:id,name:name,tenantId:tenantId,user:user,isDefault:isDefault,state:state}"
            .to_string(),
        "--output".to_string(),
        "json".to_string(),
        "--only-show-errors".to_string(),
    ];
    let output = runner
        .run("az", &account_args, Duration::from_secs(15))
        .ok()?;
    let accounts: Vec<RawAzureAccount> = serde_json::from_str(&output.stdout).ok()?;

    let mut candidates = accounts
        .into_iter()
        .filter(|account| {
            !account.tenant_id.is_empty()
                && (account.state.is_empty() || account.state.eq_ignore_ascii_case("enabled"))
        })
        .map(|account| (account.tenant_id, account.is_default))
        .collect::<Vec<_>>();
    candidates.sort_by_key(|(_, is_default)| !*is_default);
    candidates.dedup_by(|left, right| left.0 == right.0);

    let probe_args = vec![
        "--kubeconfig".to_string(),
        config_path.to_string(),
        "--context".to_string(),
        context_name.to_string(),
        "--request-timeout=10s".to_string(),
        "get".to_string(),
        "--raw=/version".to_string(),
    ];
    for (tenant_id, _) in candidates {
        let env = vec![("AZURE_TENANT_ID".to_string(), tenant_id.clone())];
        if runner
            .run_with_env("kubectl", &probe_args, Duration::from_secs(15), &env)
            .is_err()
        {
            continue;
        }

        return Some(tenant_id);
    }

    None
}

fn context_tenant_key(config_path: &str, context_name: &str) -> String {
    format!("{config_path}\0{context_name}")
}

pub fn resolve_context_tenant(config_path: &str, context_name: &str) -> Option<String> {
    let key = context_tenant_key(config_path, context_name);
    if let Some(tenant_id) = CONTEXT_TENANT_OVERRIDES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&key)
        .cloned()
    {
        log_auth_diagnostic(
            "tenant.cache_hit",
            &[
                ("context", context_name.to_string()),
                ("tenant", tenant_id.clone()),
            ],
        );
        return Some(tenant_id);
    }

    let _resolution = TENANT_RESOLUTION_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(tenant_id) = CONTEXT_TENANT_OVERRIDES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&key)
        .cloned()
    {
        log_auth_diagnostic(
            "tenant.cache_hit_after_lock",
            &[
                ("context", context_name.to_string()),
                ("tenant", tenant_id.clone()),
            ],
        );
        return Some(tenant_id);
    }

    let kubeconfig_yaml = match std::fs::read_to_string(config_path) {
        Ok(contents) => contents,
        Err(error) => {
            log_auth_diagnostic(
                "tenant.config_read_failed",
                &[
                    ("context", context_name.to_string()),
                    ("config_path", config_path.to_string()),
                    ("detail", error.to_string()),
                ],
            );
            return None;
        }
    };
    let tenant_id = resolve_context_tenant_with_runner(
        &kubeconfig_yaml,
        config_path,
        context_name,
        &SystemAzureCommandRunner,
    );
    let Some(tenant_id) = tenant_id else {
        log_auth_diagnostic(
            "tenant.resolve_failed",
            &[
                ("context", context_name.to_string()),
                ("config_path", config_path.to_string()),
            ],
        );
        return None;
    };
    log_auth_diagnostic(
        "tenant.resolved",
        &[
            ("context", context_name.to_string()),
            ("tenant", tenant_id.clone()),
        ],
    );
    CONTEXT_TENANT_OVERRIDES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .insert(key, tenant_id.clone());
    Some(tenant_id)
}

#[cfg(test)]
pub fn check_azure_auth_with_runner<R: AzureCommandRunner>(
    kubeconfig_yaml: &str,
    context_name: &str,
    runner: &R,
) -> AzureSessionStatus {
    check_azure_auth_with_runner_for_tenant(kubeconfig_yaml, context_name, runner, None)
}

fn check_azure_auth_with_runner_for_tenant<R: AzureCommandRunner>(
    kubeconfig_yaml: &str,
    context_name: &str,
    runner: &R,
    preferred_tenant_id: Option<&str>,
) -> AzureSessionStatus {
    let contexts = match discover_azure_contexts(kubeconfig_yaml) {
        Ok(contexts) => contexts,
        Err(_) => {
            let mut status = base_status(context_name, AzureAuthState::Error);
            status.reason = Some("invalidKubeconfig".to_string());
            status.safe_message = Some(
                "KubeCLI could not read Azure authentication settings from this kubeconfig."
                    .to_string(),
            );
            return status;
        }
    };

    let Some(selected) = contexts
        .iter()
        .find(|context| context.context_name == context_name)
    else {
        return base_status(context_name, AzureAuthState::NotAzure);
    };

    let affected_contexts = contexts
        .iter()
        .filter(|context| context.tenant_id == selected.tenant_id)
        .map(|context| context.context_name.clone())
        .collect::<Vec<_>>();

    if selected.login_mode != "azurecli" {
        let mut status = base_status(context_name, AzureAuthState::Error);
        status.tenant_id = selected.tenant_id.clone();
        status.login_mode = Some(selected.login_mode.clone());
        status.affected_contexts = affected_contexts;
        status.reason = Some("unsupportedLoginMode".to_string());
        status.safe_message = Some(format!(
            "This context uses kubelogin mode '{}'; KubeCLI only manages Azure CLI user sessions.",
            selected.login_mode
        ));
        return status;
    }

    let account_args = vec![
        "account".to_string(),
        "list".to_string(),
        "--all".to_string(),
        "--query".to_string(),
        "[].{id:id,name:name,tenantId:tenantId,user:user,isDefault:isDefault,state:state}"
            .to_string(),
        "--output".to_string(),
        "json".to_string(),
        "--only-show-errors".to_string(),
    ];
    let account_output = match runner.run("az", &account_args, Duration::from_secs(15)) {
        Ok(output) => output,
        Err(error) => {
            let mut status = safe_command_error(context_name, selected, Vec::new(), error);
            status.affected_contexts = affected_contexts;
            return status;
        }
    };

    let raw_accounts: Vec<RawAzureAccount> = match serde_json::from_str(&account_output.stdout) {
        Ok(accounts) => accounts,
        Err(_) => {
            let mut status = base_status(context_name, AzureAuthState::Error);
            status.tenant_id = selected.tenant_id.clone();
            status.login_mode = Some(selected.login_mode.clone());
            status.affected_contexts = affected_contexts;
            status.reason = Some("invalidCliOutput".to_string());
            status.safe_message =
                Some("Azure CLI returned an unreadable account list.".to_string());
            return status;
        }
    };

    let tenant_id = selected
        .tenant_id
        .clone()
        .or_else(|| preferred_tenant_id.map(str::to_string))
        .or_else(|| {
            raw_accounts
                .iter()
                .find(|account| {
                    account.is_default
                        && !account.tenant_id.is_empty()
                        && (account.state.is_empty()
                            || account.state.eq_ignore_ascii_case("enabled"))
                })
                .map(|account| account.tenant_id.clone())
        });
    let Some(tenant_id) = tenant_id else {
        let mut status = base_status(context_name, AzureAuthState::Error);
        status.login_mode = Some(selected.login_mode.clone());
        status.affected_contexts = affected_contexts;
        status.reason = Some("tenantMissing".to_string());
        status.safe_message = Some(
            "This kubeconfig omits the Azure tenant, and Azure CLI has no default account to infer it from."
                .to_string(),
        );
        return status;
    };
    let affected_contexts = contexts
        .iter()
        .filter(|context| {
            context.tenant_id.as_deref() == Some(tenant_id.as_str())
                || (selected.tenant_id.is_none() && context.tenant_id.is_none())
        })
        .map(|context| context.context_name.clone())
        .collect::<Vec<_>>();

    let mut accounts = raw_accounts
        .into_iter()
        .filter(|account| {
            account.tenant_id == tenant_id
                && (account.state.is_empty() || account.state.eq_ignore_ascii_case("enabled"))
        })
        .map(|account| AzureAccountSummary {
            username: account.user.name,
            subscription_id: account.id,
            subscription_name: account.name,
            tenant_id: account.tenant_id,
            is_default: account.is_default,
        })
        .collect::<Vec<_>>();
    accounts.sort_by_key(|account| !account.is_default);

    if accounts.is_empty() {
        let mut status = base_status(context_name, AzureAuthState::SignedOut);
        status.tenant_id = Some(tenant_id.clone());
        status.login_mode = Some(selected.login_mode.clone());
        status.affected_contexts = affected_contexts;
        status.reason = Some("accountNotFound".to_string());
        status.safe_message =
            Some("No Azure CLI account is signed in for this tenant.".to_string());
        return status;
    }

    let token_args = vec![
        "account".to_string(),
        "get-access-token".to_string(),
        "--tenant".to_string(),
        tenant_id.clone(),
        "--resource".to_string(),
        "https://management.azure.com/".to_string(),
        "--query".to_string(),
        "{expiresOn:expiresOn,expires_on:expires_on,tenant:tenant,subscription:subscription}"
            .to_string(),
        "--output".to_string(),
        "json".to_string(),
        "--only-show-errors".to_string(),
    ];
    let token_output = match runner.run("az", &token_args, Duration::from_secs(15)) {
        Ok(output) => output,
        Err(error) => {
            let mut status = safe_command_error(context_name, selected, accounts, error);
            status.tenant_id = Some(tenant_id.clone());
            status.affected_contexts = affected_contexts;
            return status;
        }
    };
    let token: RawTokenMetadata = match serde_json::from_str(&token_output.stdout) {
        Ok(token) => token,
        Err(_) => {
            let mut status = base_status(context_name, AzureAuthState::Error);
            status.tenant_id = Some(tenant_id.clone());
            status.login_mode = Some(selected.login_mode.clone());
            status.account = accounts.first().cloned();
            status.accounts = accounts;
            status.affected_contexts = affected_contexts;
            status.reason = Some("invalidCliOutput".to_string());
            status.safe_message =
                Some("Azure CLI returned unreadable session metadata.".to_string());
            return status;
        }
    };

    let mut status = base_status(context_name, AzureAuthState::Active);
    status.tenant_id = Some(tenant_id);
    status.login_mode = Some(selected.login_mode.clone());
    status.account = accounts.first().cloned();
    status.accounts = accounts;
    status.expires_at_epoch_seconds = epoch_seconds(&token.expires_on);
    status.affected_contexts = affected_contexts;
    status
}

pub fn check_azure_auth(config_path: &str, context_name: &str) -> AzureSessionStatus {
    log_auth_diagnostic(
        "auth_check.start",
        &[
            ("context", context_name.to_string()),
            ("config_path", config_path.to_string()),
            (
                "azure_config_dir",
                std::env::var("AZURE_CONFIG_DIR").unwrap_or_else(|_| "<default>".to_string()),
            ),
            (
                "home",
                std::env::var("HOME").unwrap_or_else(|_| "<unset>".to_string()),
            ),
        ],
    );
    let kubeconfig_yaml = match std::fs::read_to_string(config_path) {
        Ok(contents) => contents,
        Err(error) => {
            let mut status = base_status(context_name, AzureAuthState::Error);
            status.reason = Some("configReadFailed".to_string());
            status.safe_message =
                Some("KubeCLI could not read the selected kubeconfig.".to_string());
            log_auth_diagnostic(
                "auth_check.finish",
                &[
                    ("context", context_name.to_string()),
                    ("state", format!("{:?}", status.state)),
                    ("reason", "configReadFailed".to_string()),
                    ("detail", error.to_string()),
                ],
            );
            return status;
        }
    };

    if let Some(cache_path) = native_kubelogin_cache_path(&kubeconfig_yaml, context_name) {
        let cache_json = std::fs::read_to_string(&cache_path).ok();
        if let Some(cache_check) =
            check_native_kubelogin_cache(&kubeconfig_yaml, context_name, cache_json.as_deref())
        {
            let status = match cache_check {
                NativeKubeloginCacheCheck::Compatible => {
                    verify_native_kubelogin_context_with_runner(
                        &kubeconfig_yaml,
                        config_path,
                        context_name,
                        &SystemAzureCommandRunner,
                    )
                }
                NativeKubeloginCacheCheck::Unavailable(status) => status,
            };
            log_auth_diagnostic(
                "auth_check.finish",
                &[
                    ("context", context_name.to_string()),
                    ("state", format!("{:?}", status.state)),
                    (
                        "tenant",
                        status
                            .tenant_id
                            .clone()
                            .unwrap_or_else(|| "<none>".to_string()),
                    ),
                    ("cache_path", cache_path.display().to_string()),
                    (
                        "reason",
                        status
                            .reason
                            .clone()
                            .unwrap_or_else(|| "<none>".to_string()),
                    ),
                ],
            );
            return status;
        }
    }

    let tenant_id = resolve_context_tenant(config_path, context_name);
    let status = check_azure_auth_with_runner_for_tenant(
        &kubeconfig_yaml,
        context_name,
        &SystemAzureCommandRunner,
        tenant_id.as_deref(),
    );
    log_auth_diagnostic(
        "auth_check.finish",
        &[
            ("context", context_name.to_string()),
            ("state", format!("{:?}", status.state)),
            (
                "tenant",
                status
                    .tenant_id
                    .clone()
                    .unwrap_or_else(|| "<none>".to_string()),
            ),
            ("account_count", status.accounts.len().to_string()),
            (
                "reason",
                status
                    .reason
                    .clone()
                    .unwrap_or_else(|| "<none>".to_string()),
            ),
            (
                "safe_message",
                status
                    .safe_message
                    .clone()
                    .unwrap_or_else(|| "<none>".to_string()),
            ),
        ],
    );
    status
}

fn verify_azure_auth_after_login_with<C, W>(mut check: C, mut wait: W) -> AzureSessionStatus
where
    C: FnMut() -> AzureSessionStatus,
    W: FnMut(Duration),
{
    let mut status = check();
    for delay in [
        Duration::from_millis(250),
        Duration::from_millis(500),
        Duration::from_secs(1),
        Duration::from_secs(2),
    ] {
        if status.state == AzureAuthState::Active {
            break;
        }
        wait(delay);
        status = check();
    }
    status
}

fn verify_azure_auth_after_login(config_path: &str, context_name: &str) -> AzureSessionStatus {
    let mut attempt = 0;
    verify_azure_auth_after_login_with(
        || {
            attempt += 1;
            let status = check_azure_auth(config_path, context_name);
            log_auth_diagnostic(
                "post_login_verification.attempt",
                &[
                    ("attempt", attempt.to_string()),
                    ("context", context_name.to_string()),
                    ("state", format!("{:?}", status.state)),
                    (
                        "reason",
                        status
                            .reason
                            .clone()
                            .unwrap_or_else(|| "<none>".to_string()),
                    ),
                ],
            );
            status
        },
        thread::sleep,
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AzureLoginMethod {
    Browser,
    DeviceCode,
}

pub fn build_login_args(tenant_id: &str, method: AzureLoginMethod) -> Vec<String> {
    let mut args = vec![
        "login".to_string(),
        "--tenant".to_string(),
        tenant_id.to_string(),
        "--allow-no-subscriptions".to_string(),
        "--output".to_string(),
        "none".to_string(),
        "--only-show-errors".to_string(),
    ];
    if method == AzureLoginMethod::DeviceCode {
        args.push("--use-device-code".to_string());
    }
    args
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct NativeKubeloginInvocation {
    program: String,
    args: Vec<String>,
    env: Vec<(String, String)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InteractiveLoginBackend {
    AzureCli,
    NativeKubelogin,
}

fn set_login_argument(args: &mut Vec<String>, login_mode: &str) {
    let mut normalized = Vec::with_capacity(args.len() + 2);
    let mut index = 0;
    while index < args.len() {
        let argument = &args[index];
        if argument == "--login" || argument == "-l" {
            index += 1;
            if index < args.len() {
                index += 1;
            }
            continue;
        }
        if argument.starts_with("--login=") || argument.starts_with("-l=") {
            index += 1;
            continue;
        }
        normalized.push(argument.clone());
        index += 1;
    }
    normalized.extend(["--login".to_string(), login_mode.to_string()]);
    *args = normalized;
}

fn merge_command_env(env: &mut Vec<(String, String)>, overrides: &[(String, String)]) {
    for (name, value) in overrides {
        env.retain(|(existing, _)| existing != name);
        env.push((name.clone(), value.clone()));
    }
}

fn build_native_kubelogin_login(
    kubeconfig_yaml: &str,
    context_name: &str,
    method: AzureLoginMethod,
) -> Result<NativeKubeloginInvocation, String> {
    let config: AuthKubeConfig = serde_yaml::from_str(kubeconfig_yaml)
        .map_err(|error| format!("Failed to parse kubeconfig authentication: {error}"))?;
    let user_name = config
        .contexts
        .iter()
        .find(|entry| entry.name == context_name)
        .map(|entry| entry.context.user.as_str())
        .ok_or_else(|| "The selected Kubernetes context was not found.".to_string())?;
    let exec = config
        .users
        .iter()
        .find(|entry| entry.name == user_name)
        .and_then(|entry| entry.user.exec.as_ref())
        .ok_or_else(|| "The selected context does not use exec authentication.".to_string())?;
    if !executable_name(&exec.command).eq_ignore_ascii_case("kubelogin") {
        return Err("The selected context does not use Azure kubelogin.".to_string());
    }
    if exec.args.first().map(String::as_str) != Some("get-token") {
        return Err("The selected kubelogin exec command is not a get-token command.".to_string());
    }
    let current_mode = effective_login_mode(exec);
    if !is_shared_user_login_mode(&current_mode) {
        return Err(format!(
            "This context uses kubelogin mode '{current_mode}', which is not an interactive user session."
        ));
    }
    if current_mode != "devicecode"
        && argument_flag_enabled(&exec.args, "--disable-environment-override")
    {
        return Err(
            "This context disables kubelogin environment overrides, so it cannot share the device-code cache without changing the kubeconfig."
                .to_string(),
        );
    }

    let mut args = exec.args.clone();
    let requested_mode = match method {
        AzureLoginMethod::Browser => "interactive",
        AzureLoginMethod::DeviceCode => "devicecode",
    };
    set_login_argument(&mut args, requested_mode);
    let mut env = exec
        .env
        .iter()
        .flatten()
        .map(|item| (item.name.clone(), item.value.clone()))
        .collect::<Vec<_>>();
    env.retain(|(name, _)| name != "AAD_LOGIN_METHOD");
    env.push(("AAD_LOGIN_METHOD".to_string(), requested_mode.to_string()));
    Ok(NativeKubeloginInvocation {
        program: exec.command.clone(),
        args,
        env,
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCodeInstruction {
    pub verification_url: Option<String>,
    pub user_code: Option<String>,
    pub safe_message: String,
}

pub fn parse_device_instruction(line: &str) -> DeviceCodeInstruction {
    let verification_url = line
        .split_whitespace()
        .find(|word| word.starts_with("https://") || word.starts_with("http://"))
        .map(|word| {
            word.trim_matches(|character: char| ",.;()[]{}<>".contains(character))
                .to_string()
        });

    let lower = line.to_lowercase();
    let user_code = lower.find("code ").and_then(|position| {
        line.get(position + 5..)
            .and_then(|tail| tail.split_whitespace().next())
            .map(|word| {
                word.trim_matches(|character: char| {
                    !character.is_ascii_alphanumeric() && character != '-'
                })
            })
            .filter(|word| (6..=20).contains(&word.len()))
            .map(str::to_string)
    });

    DeviceCodeInstruction {
        verification_url,
        user_code,
        safe_message: line.trim().to_string(),
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LoginReservation {
    Started,
    Existing(String),
}

#[derive(Default)]
pub struct LoginReservations {
    active_by_tenant: Mutex<HashMap<String, String>>,
}

impl LoginReservations {
    pub fn reserve(&self, tenant_id: &str, login_id: &str) -> LoginReservation {
        let mut active = self
            .active_by_tenant
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(existing) = active.get(tenant_id) {
            return LoginReservation::Existing(existing.clone());
        }
        active.insert(tenant_id.to_string(), login_id.to_string());
        LoginReservation::Started
    }

    pub fn release(&self, tenant_id: &str, login_id: &str) {
        let mut active = self
            .active_by_tenant
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if active.get(tenant_id).map(String::as_str) == Some(login_id) {
            active.remove(tenant_id);
        }
    }
}

struct ActiveAzureLogin {
    child: Arc<Mutex<std::process::Child>>,
    cancelled: Arc<AtomicBool>,
    reservation_scope: String,
}

lazy_static::lazy_static! {
    static ref CONTEXT_TENANT_OVERRIDES: Mutex<HashMap<String, String>> =
        Mutex::new(HashMap::new());
    static ref TENANT_RESOLUTION_LOCK: Mutex<()> = Mutex::new(());
    static ref LOGIN_RESERVATIONS: LoginReservations = LoginReservations::default();
    static ref ACTIVE_AZURE_LOGINS: Mutex<HashMap<String, ActiveAzureLogin>> =
        Mutex::new(HashMap::new());
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureLoginStart {
    pub login_id: String,
    pub reused: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AzureAuthProgress {
    pub login_id: String,
    pub phase: String,
    pub verification_url: Option<String>,
    pub user_code: Option<String>,
    pub safe_message: Option<String>,
    pub status: Option<AzureSessionStatus>,
}

fn emit_auth_progress(app: &AppHandle, progress: AzureAuthProgress) {
    let _ = app.emit("azure-auth-progress", progress);
}

fn drain_login_output<R: Read + Send + 'static>(
    reader: R,
    app: AppHandle,
    login_id: String,
    method: AzureLoginMethod,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if method != AzureLoginMethod::DeviceCode {
                continue;
            }
            let instruction = parse_device_instruction(&line);
            if instruction.verification_url.is_some() || instruction.user_code.is_some() {
                emit_auth_progress(
                    &app,
                    AzureAuthProgress {
                        login_id: login_id.clone(),
                        phase: "deviceCode".to_string(),
                        verification_url: instruction.verification_url,
                        user_code: instruction.user_code,
                        safe_message: Some(instruction.safe_message),
                        status: None,
                    },
                );
            }
        }
    })
}

pub fn start_azure_login(
    app: AppHandle,
    config_path: String,
    context_name: String,
    tenant_id: String,
    method: AzureLoginMethod,
) -> Result<AzureLoginStart, String> {
    let login_id = uuid::Uuid::new_v4().to_string();
    log_auth_diagnostic(
        "login.requested",
        &[
            ("login_id", login_id.clone()),
            ("context", context_name.clone()),
            ("tenant", tenant_id.clone()),
            ("method", format!("{method:?}")),
            ("config_path", config_path.clone()),
        ],
    );
    let kubeconfig_yaml = match std::fs::read_to_string(&config_path) {
        Ok(contents) => contents,
        Err(error) => {
            log_auth_diagnostic(
                "login.config_read_failed",
                &[
                    ("login_id", login_id),
                    ("context", context_name),
                    ("detail", error.to_string()),
                ],
            );
            return Err("KubeCLI could not read the selected kubeconfig.".to_string());
        }
    };
    let selected = discover_azure_contexts(&kubeconfig_yaml)
        .ok()
        .and_then(|contexts| {
            contexts
                .into_iter()
                .find(|context| context.context_name == context_name)
        })
        .ok_or_else(|| "The selected context does not use Azure kubelogin.".to_string())?;
    let effective_tenant = selected
        .tenant_id
        .clone()
        .unwrap_or_else(|| tenant_id.clone());
    let shared_native = serde_yaml::from_str::<AuthKubeConfig>(&kubeconfig_yaml)
        .ok()
        .and_then(|config| {
            selected_auth_exec(&config, &context_name).and_then(native_kubelogin_scope)
        })
        .is_some();
    let (program, args, env, login_backend, reservation_scope) = if selected.login_mode
        == "azurecli"
        && !shared_native
    {
        if selected
            .tenant_id
            .as_deref()
            .is_some_and(|configured| !configured.eq_ignore_ascii_case(&tenant_id))
        {
            return Err(
                "The selected context's Azure tenant changed. Refresh and try again.".to_string(),
            );
        }
        (
            "az".to_string(),
            build_login_args(&effective_tenant, method),
            Vec::new(),
            InteractiveLoginBackend::AzureCli,
            format!("azurecli:{}", effective_tenant.to_ascii_lowercase()),
        )
    } else {
        let mut invocation =
            match build_native_kubelogin_login(&kubeconfig_yaml, &context_name, method) {
                Ok(invocation) => invocation,
                Err(error) => {
                    log_auth_diagnostic(
                        "login.backend_failed",
                        &[
                            ("login_id", login_id),
                            ("context", context_name),
                            ("detail", error.clone()),
                        ],
                    );
                    return Err(error);
                }
            };
        let config: AuthKubeConfig = serde_yaml::from_str(&kubeconfig_yaml)
            .map_err(|_| "KubeCLI could not read Azure authentication settings.".to_string())?;
        let scope = selected_auth_exec(&config, &context_name)
            .and_then(native_kubelogin_scope)
            .ok_or_else(|| {
                "The selected context is not compatible with shared kubelogin authentication."
                    .to_string()
            })?;
        if !scope.tenant_id.is_empty() && !scope.tenant_id.eq_ignore_ascii_case(&tenant_id) {
            return Err(
                "The selected context's Azure tenant changed. Refresh and try again.".to_string(),
            );
        }
        let mut runtime_env =
            kubelogin_runtime_env(&kubeconfig_yaml, &context_name).unwrap_or_default();
        if !runtime_env
            .iter()
            .any(|(name, _)| name == "AZURE_TENANT_ID")
        {
            runtime_env.push(("AZURE_TENANT_ID".to_string(), tenant_id.clone()));
        }
        let requested_mode = match method {
            AzureLoginMethod::Browser => "interactive",
            AzureLoginMethod::DeviceCode => "devicecode",
        };
        if let Some((_, value)) = runtime_env
            .iter_mut()
            .find(|(name, _)| name == "AAD_LOGIN_METHOD")
        {
            *value = requested_mode.to_string();
        }
        merge_command_env(&mut invocation.env, &runtime_env);
        let reservation_scope = format!(
            "kubelogin:{}:{}:{}:{}:{}",
            scope.tenant_id,
            scope.client_id,
            scope.cache_path.display(),
            scope.environment,
            scope.authority_host,
        );
        (
            invocation.program,
            invocation.args,
            invocation.env,
            InteractiveLoginBackend::NativeKubelogin,
            reservation_scope,
        )
    };
    match LOGIN_RESERVATIONS.reserve(&reservation_scope, &login_id) {
        LoginReservation::Existing(existing) => {
            log_auth_diagnostic(
                "login.reused",
                &[
                    ("requested_login_id", login_id),
                    ("active_login_id", existing.clone()),
                    ("scope", reservation_scope),
                ],
            );
            return Ok(AzureLoginStart {
                login_id: existing,
                reused: true,
            });
        }
        LoginReservation::Started => {}
    }
    log_auth_diagnostic(
        "login.backend_ready",
        &[
            ("login_id", login_id.clone()),
            ("context", context_name.clone()),
            ("backend", format!("{login_backend:?}")),
            ("kubeconfig_unchanged", "true".to_string()),
        ],
    );

    let mut command = Command::new(&program);
    command
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (name, value) in &env {
        command.env(name, value);
    }
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            LOGIN_RESERVATIONS.release(&reservation_scope, &login_id);
            log_auth_diagnostic(
                "login.spawn_failed",
                &[
                    ("login_id", login_id.clone()),
                    ("context", context_name.clone()),
                    ("error_kind", format!("{:?}", error.kind())),
                    ("detail", error.to_string()),
                ],
            );
            return Err(if error.kind() == std::io::ErrorKind::NotFound {
                format!("{program} is not installed or is not available in KubeCLI's PATH.")
            } else {
                format!("KubeCLI could not start {program}.")
            });
        }
    };
    log_auth_diagnostic(
        "login.spawned",
        &[
            ("login_id", login_id.clone()),
            ("context", context_name.clone()),
            ("process_id", child.id().to_string()),
        ],
    );

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));
    let cancelled = Arc::new(AtomicBool::new(false));
    ACTIVE_AZURE_LOGINS
        .lock()
        .map_err(|_| "Failed to track Azure login process".to_string())?
        .insert(
            login_id.clone(),
            ActiveAzureLogin {
                child: Arc::clone(&child),
                cancelled: Arc::clone(&cancelled),
                reservation_scope: reservation_scope.clone(),
            },
        );

    emit_auth_progress(
        &app,
        AzureAuthProgress {
            login_id: login_id.clone(),
            phase: match method {
                AzureLoginMethod::Browser => "waitingForBrowser",
                AzureLoginMethod::DeviceCode => "waitingForDeviceCode",
            }
            .to_string(),
            verification_url: None,
            user_code: None,
            safe_message: None,
            status: None,
        },
    );

    let stdout_reader =
        stdout.map(|reader| drain_login_output(reader, app.clone(), login_id.clone(), method));
    let stderr_reader =
        stderr.map(|reader| drain_login_output(reader, app.clone(), login_id.clone(), method));
    let worker_login_id = login_id.clone();
    thread::spawn(move || {
        let exit_status = loop {
            let poll = child
                .lock()
                .map_err(|_| ())
                .and_then(|mut child| child.try_wait().map_err(|_| ()));
            match poll {
                Ok(Some(status)) => break Some(status),
                Ok(None) => thread::sleep(Duration::from_millis(150)),
                Err(()) => break None,
            }
        };

        if let Some(reader) = stdout_reader {
            let _ = reader.join();
        }
        if let Some(reader) = stderr_reader {
            let _ = reader.join();
        }

        let was_cancelled = cancelled.load(Ordering::SeqCst);
        let exit_success = exit_status
            .as_ref()
            .map(|status| status.success())
            .unwrap_or(false);
        log_auth_diagnostic(
            "login.process_finished",
            &[
                ("login_id", worker_login_id.clone()),
                ("context", context_name.clone()),
                ("cancelled", was_cancelled.to_string()),
                ("success", exit_success.to_string()),
                (
                    "exit_code",
                    exit_status
                        .as_ref()
                        .and_then(|status| status.code())
                        .map(|code| code.to_string())
                        .unwrap_or_else(|| "none".to_string()),
                ),
            ],
        );
        let progress = if was_cancelled {
            AzureAuthProgress {
                login_id: worker_login_id.clone(),
                phase: "cancelled".to_string(),
                verification_url: None,
                user_code: None,
                safe_message: Some("Azure sign-in was cancelled.".to_string()),
                status: None,
            }
        } else if exit_success {
            let status = match login_backend {
                InteractiveLoginBackend::AzureCli => {
                    verify_azure_auth_after_login(&config_path, &context_name)
                }
                InteractiveLoginBackend::NativeKubelogin => {
                    verify_native_kubelogin_context_with_runner(
                        &kubeconfig_yaml,
                        &config_path,
                        &context_name,
                        &SystemAzureCommandRunner,
                    )
                }
            };
            if status.state == AzureAuthState::Active {
                AzureAuthProgress {
                    login_id: worker_login_id.clone(),
                    phase: "verified".to_string(),
                    verification_url: None,
                    user_code: None,
                    safe_message: Some("Azure access is ready.".to_string()),
                    status: Some(status),
                }
            } else {
                AzureAuthProgress {
                    login_id: worker_login_id.clone(),
                    phase: "failed".to_string(),
                    verification_url: None,
                    user_code: None,
                    safe_message: Some(
                        "Sign-in finished, but Azure access could not be verified.".to_string(),
                    ),
                    status: Some(status),
                }
            }
        } else {
            AzureAuthProgress {
                login_id: worker_login_id.clone(),
                phase: "failed".to_string(),
                verification_url: None,
                user_code: None,
                safe_message: Some(
                    "Azure sign-in did not complete. Try again or use device code.".to_string(),
                ),
                status: None,
            }
        };

        log_auth_diagnostic(
            "login.final_progress",
            &[
                ("login_id", worker_login_id.clone()),
                ("context", context_name),
                ("phase", progress.phase.clone()),
                (
                    "state",
                    progress
                        .status
                        .as_ref()
                        .map(|status| format!("{:?}", status.state))
                        .unwrap_or_else(|| "<none>".to_string()),
                ),
                (
                    "reason",
                    progress
                        .status
                        .as_ref()
                        .and_then(|status| status.reason.clone())
                        .unwrap_or_else(|| "<none>".to_string()),
                ),
            ],
        );

        if let Ok(mut active) = ACTIVE_AZURE_LOGINS.lock() {
            active.remove(&worker_login_id);
        }
        LOGIN_RESERVATIONS.release(&reservation_scope, &worker_login_id);
        emit_auth_progress(&app, progress);
    });

    Ok(AzureLoginStart {
        login_id,
        reused: false,
    })
}

pub fn cancel_azure_login(login_id: &str) -> Result<(), String> {
    let (child, cancelled, reservation_scope) = {
        let active = ACTIVE_AZURE_LOGINS
            .lock()
            .map_err(|_| "Failed to access Azure login process".to_string())?;
        let Some(login) = active.get(login_id) else {
            return Ok(());
        };
        (
            Arc::clone(&login.child),
            Arc::clone(&login.cancelled),
            login.reservation_scope.clone(),
        )
    };
    cancelled.store(true, Ordering::SeqCst);
    let result = child
        .lock()
        .map_err(|_| "Failed to access Azure login process".to_string())?
        .kill()
        .map_err(|_| "Failed to cancel Azure sign-in".to_string());
    LOGIN_RESERVATIONS.release(&reservation_scope, login_id);
    result
}

pub fn cancel_all_azure_logins() {
    let login_ids = ACTIVE_AZURE_LOGINS
        .lock()
        .map(|active| active.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    for login_id in login_ids {
        let _ = cancel_azure_login(&login_id);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        append_auth_diagnostic_to, build_login_args, build_native_kubelogin_login,
        check_azure_auth_with_runner, check_native_kubelogin_cache, diagnostic_value,
        discover_azure_contexts, kubelogin_runtime_env, kubelogin_runtime_env_for_scope,
        native_kubelogin_cache_path, parse_device_instruction, resolve_context_tenant_with_runner,
        verify_azure_auth_after_login_with, verify_native_kubelogin_context_with_runner,
        AzureAuthState, AzureCommandError, AzureCommandOutput, AzureCommandRunner,
        AzureLoginMethod, LoginReservation, LoginReservations, NativeKubeloginCacheCheck,
        NativeKubeloginScope, SharedKubeloginIdentity, SystemAzureCommandRunner,
    };
    use std::cell::RefCell;
    use std::collections::VecDeque;
    use std::fs;
    use std::time::Duration;

    const AZURE_CLI_KUBECONFIG: &str = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
  - name: aks-payments-prod
    context: { cluster: aks-payments-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --login, azurecli, --tenant-id, tenant-prod, --client-id, client-aks]
"#;

    struct FakeRunner {
        responses: RefCell<VecDeque<Result<AzureCommandOutput, AzureCommandError>>>,
        calls: RefCell<Vec<Vec<String>>>,
        envs: RefCell<Vec<Vec<(String, String)>>>,
    }

    impl FakeRunner {
        fn new(responses: Vec<Result<AzureCommandOutput, AzureCommandError>>) -> Self {
            Self {
                responses: RefCell::new(responses.into()),
                calls: RefCell::new(Vec::new()),
                envs: RefCell::new(Vec::new()),
            }
        }

        fn success(stdout: &str) -> Result<AzureCommandOutput, AzureCommandError> {
            Ok(AzureCommandOutput {
                stdout: stdout.to_string(),
            })
        }
    }

    impl AzureCommandRunner for FakeRunner {
        fn run(
            &self,
            program: &str,
            args: &[String],
            _timeout: Duration,
        ) -> Result<AzureCommandOutput, AzureCommandError> {
            let mut call = vec![program.to_string()];
            call.extend(args.iter().cloned());
            self.calls.borrow_mut().push(call);
            self.responses
                .borrow_mut()
                .pop_front()
                .expect("unexpected command")
        }

        fn run_with_env(
            &self,
            program: &str,
            args: &[String],
            timeout: Duration,
            env: &[(String, String)],
        ) -> Result<AzureCommandOutput, AzureCommandError> {
            self.envs.borrow_mut().push(env.to_vec());
            self.run(program, args, timeout)
        }
    }

    #[test]
    fn discovers_azure_cli_context_and_tenant_from_kubelogin_args() {
        let yaml = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context:
      cluster: aks-orders-prod
      user: clusterUser_orders_aks-orders-prod
users:
  - name: clusterUser_orders_aks-orders-prod
    user:
      exec:
        command: kubelogin
        args:
          - get-token
          - --login
          - azurecli
          - --tenant-id
          - 11111111-2222-3333-4444-555555555555
          - --server-id
          - 6dae42f8-4368-4678-94ff-3960e28e3630
"#;

        let contexts = discover_azure_contexts(yaml).expect("valid kubeconfig");

        assert_eq!(contexts.len(), 1);
        assert_eq!(contexts[0].context_name, "aks-orders-prod");
        assert_eq!(contexts[0].cluster_name, "aks-orders-prod");
        assert_eq!(contexts[0].user_name, "clusterUser_orders_aks-orders-prod");
        assert_eq!(
            contexts[0].tenant_id.as_deref(),
            Some("11111111-2222-3333-4444-555555555555")
        );
        assert_eq!(contexts[0].login_mode, "azurecli");
    }

    #[test]
    fn accepts_null_exec_environment_from_aks_kubeconfig() {
        let yaml = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --login, azurecli, --tenant-id, tenant-prod]
        env: null
"#;

        let contexts = discover_azure_contexts(yaml).expect("AKS kubeconfig with null env");

        assert_eq!(contexts.len(), 1);
        assert_eq!(contexts[0].context_name, "aks-orders-prod");
        assert_eq!(contexts[0].tenant_id.as_deref(), Some("tenant-prod"));
    }

    #[test]
    fn supports_short_flags_and_ignores_non_azure_exec_users() {
        let yaml = r#"
apiVersion: v1
contexts:
  - name: aks-labs
    context: { cluster: aks-labs, user: azure-user }
  - name: eks-labs
    context: { cluster: eks-labs, user: aws-user }
users:
  - name: azure-user
    user:
      exec:
        command: /usr/local/bin/kubelogin
        args: [get-token, -l, devicecode, -t, tenant-labs]
  - name: aws-user
    user:
      exec:
        command: aws
        args: [eks, get-token]
"#;

        let contexts = discover_azure_contexts(yaml).expect("valid kubeconfig");

        assert_eq!(contexts.len(), 1);
        assert_eq!(contexts[0].context_name, "aks-labs");
        assert_eq!(contexts[0].tenant_id.as_deref(), Some("tenant-labs"));
        assert_eq!(contexts[0].login_mode, "devicecode");
    }

    #[test]
    fn uses_tenant_from_exec_environment_and_skips_missing_user() {
        let yaml = r#"
apiVersion: v1
contexts:
  - name: aks-env
    context: { cluster: aks-env, user: azure-env-user }
  - name: orphan
    context: { cluster: orphan, user: missing-user }
users:
  - name: azure-env-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --login, azurecli]
        env:
          - name: AZURE_TENANT_ID
            value: tenant-from-env
"#;

        let contexts = discover_azure_contexts(yaml).expect("valid kubeconfig");

        assert_eq!(contexts.len(), 1);
        assert_eq!(contexts[0].tenant_id.as_deref(), Some("tenant-from-env"));
    }

    #[test]
    fn reports_active_session_without_requesting_token_text() {
        let runner = FakeRunner::new(vec![
            FakeRunner::success(
                r#"[{"id":"sub-prod","name":"Production","tenantId":"tenant-prod","isDefault":true,"state":"Enabled","user":{"name":"alex@contoso.com","type":"user"}}]"#,
            ),
            FakeRunner::success(
                r#"{"expiresOn":"2026-08-17 11:30:00.000000","expires_on":1786966200,"tenant":"tenant-prod","subscription":"sub-prod"}"#,
            ),
        ]);

        let status = check_azure_auth_with_runner(AZURE_CLI_KUBECONFIG, "aks-orders-prod", &runner);

        assert_eq!(status.state, AzureAuthState::Active);
        assert_eq!(status.tenant_id.as_deref(), Some("tenant-prod"));
        assert_eq!(
            status.account.as_ref().map(|a| a.username.as_str()),
            Some("alex@contoso.com")
        );
        assert_eq!(status.expires_at_epoch_seconds, Some(1786966200));
        assert_eq!(
            status.affected_contexts,
            vec!["aks-orders-prod", "aks-payments-prod"]
        );

        let calls = runner.calls.borrow();
        assert_eq!(calls.len(), 2);
        let token_call = calls[1].join(" ");
        assert!(token_call.contains("expires_on"));
        assert!(!token_call.contains("accessToken"));
    }

    #[test]
    fn infers_missing_tenant_from_default_azure_cli_account() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --login, azurecli, --server-id, aks-server]
        env: null
"#;
        let runner = FakeRunner::new(vec![
            FakeRunner::success(
                r#"[{"id":"sub-other","name":"Other","tenantId":"tenant-other","isDefault":false,"state":"Enabled","user":{"name":"alex@contoso.com","type":"user"}},{"id":"sub-current","name":"Current","tenantId":"tenant-current","isDefault":true,"state":"Enabled","user":{"name":"alex@contoso.com","type":"user"}}]"#,
            ),
            FakeRunner::success(
                r#"{"expiresOn":"2026-08-17 11:30:00.000000","expires_on":1786966200,"tenant":"tenant-current","subscription":"sub-current"}"#,
            ),
        ]);

        let status = check_azure_auth_with_runner(kubeconfig, "aks-orders-prod", &runner);

        assert_eq!(status.state, AzureAuthState::Active);
        assert_eq!(status.tenant_id.as_deref(), Some("tenant-current"));
        assert_eq!(status.accounts.len(), 1);
        assert_eq!(status.accounts[0].subscription_id, "sub-current");
        assert!(runner.calls.borrow()[1].contains(&"tenant-current".to_string()));
    }

    #[test]
    fn retries_post_login_verification_until_the_new_session_is_visible() {
        let mut checks = 0;
        let mut waits = Vec::new();

        let status = verify_azure_auth_after_login_with(
            || {
                checks += 1;
                let mut status = super::base_status(
                    "aks-orders-prod",
                    if checks < 3 {
                        AzureAuthState::Expired
                    } else {
                        AzureAuthState::Active
                    },
                );
                status.reason = (checks < 3).then(|| "interactionRequired".to_string());
                status
            },
            |delay| waits.push(delay),
        );

        assert_eq!(status.state, AzureAuthState::Active);
        assert_eq!(checks, 3);
        assert_eq!(
            waits,
            [Duration::from_millis(250), Duration::from_millis(500)]
        );
    }

    #[test]
    fn builds_native_devicecode_login_without_converting_kubeconfig() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --tenant-id, tenant-prod, --login, devicecode]
"#;
        let invocation = build_native_kubelogin_login(
            kubeconfig,
            "aks-orders-prod",
            AzureLoginMethod::DeviceCode,
        )
        .expect("build native kubelogin command");

        assert_eq!(invocation.program, "kubelogin");
        assert_eq!(
            invocation.args,
            [
                "get-token",
                "--tenant-id",
                "tenant-prod",
                "--login",
                "devicecode",
            ]
        );
        assert!(!invocation
            .args
            .iter()
            .any(|arg| arg == "convert-kubeconfig"));
    }

    #[test]
    fn overrides_azurecli_kubeconfig_to_shared_devicecode_in_memory() {
        let invocation = build_native_kubelogin_login(
            AZURE_CLI_KUBECONFIG,
            "aks-orders-prod",
            AzureLoginMethod::DeviceCode,
        )
        .expect("azurecli context is compatible with native kubelogin");

        assert!(invocation
            .args
            .windows(2)
            .any(|pair| pair == ["--login", "devicecode"]));
        assert_eq!(
            kubelogin_runtime_env(AZURE_CLI_KUBECONFIG, "aks-orders-prod"),
            Some(vec![
                ("AAD_LOGIN_METHOD".to_string(), "devicecode".to_string()),
                ("AZURE_TENANT_ID".to_string(), "tenant-prod".to_string()),
                ("AZURE_CLIENT_ID".to_string(), "client-aks".to_string()),
            ])
        );
    }

    #[test]
    fn recovers_missing_kubeconfig_identity_from_shared_cache() {
        let env = kubelogin_runtime_env_for_scope(
            NativeKubeloginScope {
                tenant_id: String::new(),
                client_id: String::new(),
                cache_path: "/home/user/.kube/cache/kubelogin/auth.json".into(),
                environment: "azurepubliccloud".to_string(),
                authority_host: "https://login.microsoftonline.com".to_string(),
            },
            Some(&SharedKubeloginIdentity {
                authority: "https://login.microsoftonline.com/tenant-prod".to_string(),
                client_id: "client-aks".to_string(),
                tenant_id: "tenant-prod".to_string(),
            }),
        );

        assert_eq!(
            env,
            vec![
                ("AAD_LOGIN_METHOD".to_string(), "devicecode".to_string()),
                ("AZURE_TENANT_ID".to_string(), "tenant-prod".to_string()),
                ("AZURE_CLIENT_ID".to_string(), "client-aks".to_string()),
            ]
        );
    }

    #[test]
    fn does_not_override_non_devicecode_mode_when_environment_override_is_disabled() {
        for login_mode in ["azurecli", "interactive"] {
            let kubeconfig = AZURE_CLI_KUBECONFIG.replace(
                "--login, azurecli",
                &format!("--login, {login_mode}, --disable-environment-override"),
            );

            assert_eq!(kubelogin_runtime_env(&kubeconfig, "aks-orders-prod"), None);
            assert!(build_native_kubelogin_login(
                &kubeconfig,
                "aks-orders-prod",
                AzureLoginMethod::DeviceCode,
            )
            .is_err());
        }
    }

    #[test]
    fn rejects_non_token_kubelogin_exec_commands() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: unsafe
    context: { cluster: unsafe, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [convert-kubeconfig, --login, devicecode]
"#;

        let error =
            build_native_kubelogin_login(kubeconfig, "unsafe", AzureLoginMethod::DeviceCode)
                .expect_err("non-token command must be rejected");

        assert!(error.contains("get-token"));
    }

    #[test]
    fn normalizes_short_and_duplicate_login_flags_in_memory() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, -l=devicecode, --tenant-id, tenant-prod, --login, interactive]
"#;

        let invocation = build_native_kubelogin_login(
            kubeconfig,
            "aks-orders-prod",
            AzureLoginMethod::DeviceCode,
        )
        .expect("normalize login args");

        assert_eq!(
            invocation.args,
            [
                "get-token",
                "--tenant-id",
                "tenant-prod",
                "--login",
                "devicecode",
            ]
        );
    }

    #[test]
    fn forces_requested_login_mode_over_exec_environment() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --tenant-id, tenant-prod, --login, devicecode]
        env:
          - { name: AAD_LOGIN_METHOD, value: interactive }
"#;

        let invocation = build_native_kubelogin_login(
            kubeconfig,
            "aks-orders-prod",
            AzureLoginMethod::DeviceCode,
        )
        .expect("build device-code invocation");

        assert_eq!(
            invocation
                .env
                .iter()
                .find(|(name, _)| name == "AAD_LOGIN_METHOD")
                .map(|(_, value)| value.as_str()),
            Some("devicecode")
        );
    }

    #[test]
    fn routes_using_effective_login_mode_from_exec_environment() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --tenant-id, tenant-prod, --login, azurecli]
        env:
          - { name: AAD_LOGIN_METHOD, value: devicecode }
"#;

        let contexts = discover_azure_contexts(kubeconfig).expect("discover context");
        assert_eq!(contexts[0].login_mode, "devicecode");
        assert!(build_native_kubelogin_login(
            kubeconfig,
            "aks-orders-prod",
            AzureLoginMethod::DeviceCode,
        )
        .is_ok());
    }

    #[test]
    fn honors_kubelogin_cache_directory_environment() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --tenant-id, tenant-prod, --login, devicecode]
        env:
          - { name: KUBECACHEDIR, value: /tmp/shared-kubelogin-test }
"#;

        assert_eq!(
            native_kubelogin_cache_path(kubeconfig, "aks-orders-prod"),
            Some(std::path::PathBuf::from(
                "/tmp/shared-kubelogin-test/auth.json"
            ))
        );
    }

    #[test]
    fn recognizes_compatible_context_from_shared_kubelogin_cache() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --tenant-id, tenant-prod, --client-id, client-aks, --login, devicecode]
"#;
        let cache = r#"{
          "authority":"https://login.microsoftonline.com/tenant-prod",
          "clientId":"client-aks",
          "homeAccountId":"account.tenant",
          "tenantId":"tenant-prod",
          "username":"alex@contoso.com",
          "version":"1.0"
        }"#;

        let cache_check = check_native_kubelogin_cache(kubeconfig, "aks-orders-prod", Some(cache))
            .expect("native kubelogin context");

        assert_eq!(cache_check, NativeKubeloginCacheCheck::Compatible);
    }

    #[test]
    fn reports_native_context_signed_out_when_shared_identity_is_for_another_client() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --tenant-id, tenant-prod, --client-id, client-aks, --login, devicecode]
"#;
        let cache = r#"{"clientId":"another-client","tenantId":"tenant-prod"}"#;

        let cache_check = check_native_kubelogin_cache(kubeconfig, "aks-orders-prod", Some(cache))
            .expect("native kubelogin context");
        let NativeKubeloginCacheCheck::Unavailable(status) = cache_check else {
            panic!("mismatched cache must be unavailable");
        };

        assert_eq!(status.state, AzureAuthState::SignedOut);
        assert_eq!(status.reason.as_deref(), Some("kubeloginIdentityMismatch"));
    }

    #[test]
    fn rejects_shared_identity_from_another_azure_authority() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --tenant-id, tenant-prod, --client-id, client-aks, --login, devicecode]
"#;
        let cache = r#"{
          "authority":"https://login.microsoftonline.us/tenant-prod",
          "clientId":"client-aks",
          "tenantId":"tenant-prod"
        }"#;

        let cache_check = check_native_kubelogin_cache(kubeconfig, "aks-orders-prod", Some(cache))
            .expect("native kubelogin context");
        let NativeKubeloginCacheCheck::Unavailable(status) = cache_check else {
            panic!("another authority must be unavailable");
        };

        assert_eq!(status.reason.as_deref(), Some("kubeloginIdentityMismatch"));
    }

    #[cfg(unix)]
    #[test]
    fn command_timeout_terminates_descendants_that_hold_output_pipes() {
        let started = std::time::Instant::now();
        let result = SystemAzureCommandRunner.run(
            "sh",
            &["-c".to_string(), "sleep 30 & wait".to_string()],
            Duration::from_millis(50),
        );

        assert!(matches!(result, Err(AzureCommandError::Timeout)));
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn verifies_native_login_with_selected_context_without_editing_credentials() {
        let runner = FakeRunner::new(vec![
            FakeRunner::success(""),
            FakeRunner::success(r#"{"gitVersion":"v1.30.0"}"#),
        ]);

        let status = verify_native_kubelogin_context_with_runner(
            AZURE_CLI_KUBECONFIG
                .replace("azurecli", "devicecode")
                .as_str(),
            "/home/user/.kube/prod",
            "aks-orders-prod",
            &runner,
        );

        assert_eq!(status.state, AzureAuthState::Active);
        let calls = runner.calls.borrow();
        assert_eq!(calls.len(), 2);
        assert_eq!(
            calls[0],
            [
                "kubelogin",
                "get-token",
                "--tenant-id",
                "tenant-prod",
                "--client-id",
                "client-aks",
                "--login",
                "devicecode",
            ]
        );
        assert_eq!(
            calls[1],
            [
                "kubectl",
                "--kubeconfig",
                "/home/user/.kube/prod",
                "--context",
                "aks-orders-prod",
                "--request-timeout=10s",
                "get",
                "--raw=/version",
            ]
        );
    }

    #[test]
    fn writes_private_single_line_auth_diagnostics() {
        let path = std::env::temp_dir().join(format!(
            "kubecli-auth-diagnostic-test-{}.log",
            uuid::Uuid::new_v4()
        ));

        append_auth_diagnostic_to(
            &path,
            "verification.result",
            &[
                ("attempt", "2".to_string()),
                ("detail", "first line\nsecond line".to_string()),
            ],
        )
        .expect("write diagnostic");

        let contents = fs::read_to_string(&path).expect("read diagnostic");
        assert_eq!(contents.lines().count(), 1);
        assert!(contents.contains("event=\"verification.result\""));
        assert!(contents.contains("attempt=\"2\""));
        assert!(contents.contains("detail=\"first line second line\""));
        assert_eq!(diagnostic_value("a\rb\tc\n"), "a b c");

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }

        fs::remove_file(path).expect("remove diagnostic fixture");
    }

    #[test]
    fn resolves_missing_tenant_by_asking_the_cluster() {
        let kubeconfig = r#"
apiVersion: v1
contexts:
  - name: aks-orders-prod
    context: { cluster: aks-orders-prod, user: azure-user }
users:
  - name: azure-user
    user:
      exec:
        command: kubelogin
        args: [get-token, --login, azurecli, --server-id, aks-server]
        env: null
"#;
        let runner = FakeRunner::new(vec![
            FakeRunner::success(
                r#"[{"id":"sub-cluster","name":"Cluster","tenantId":"tenant-cluster","isDefault":false,"state":"Enabled","user":{"name":"alex@contoso.com","type":"user"}},{"id":"sub-default","name":"Default","tenantId":"tenant-default","isDefault":true,"state":"Enabled","user":{"name":"alex@contoso.com","type":"user"}}]"#,
            ),
            Err(AzureCommandError::Failed {
                stderr: "Unauthorized".to_string(),
            }),
            FakeRunner::success(r#"{"gitVersion":"v1.30.0"}"#),
        ]);

        let tenant = resolve_context_tenant_with_runner(
            kubeconfig,
            "/home/user/.kube/config",
            "aks-orders-prod",
            &runner,
        );

        assert_eq!(tenant.as_deref(), Some("tenant-cluster"));
        assert_eq!(
            runner.envs.borrow().as_slice(),
            [
                vec![("AZURE_TENANT_ID".to_string(), "tenant-default".to_string())],
                vec![("AZURE_TENANT_ID".to_string(), "tenant-cluster".to_string())],
            ]
        );
        let calls = runner.calls.borrow();
        assert!(!calls
            .iter()
            .flatten()
            .any(|argument| argument == "set-credentials"));
    }

    #[test]
    fn does_not_run_azure_cli_for_non_azure_context() {
        let runner = FakeRunner::new(vec![]);
        let status = check_azure_auth_with_runner(
            "contexts: [{ name: local, context: { cluster: local, user: local-user } }]",
            "local",
            &runner,
        );

        assert_eq!(status.state, AzureAuthState::NotAzure);
        assert!(runner.calls.borrow().is_empty());
    }

    #[test]
    fn reports_signed_out_when_tenant_has_no_account() {
        let runner = FakeRunner::new(vec![FakeRunner::success("[]")]);

        let status = check_azure_auth_with_runner(AZURE_CLI_KUBECONFIG, "aks-orders-prod", &runner);

        assert_eq!(status.state, AzureAuthState::SignedOut);
        assert_eq!(status.reason.as_deref(), Some("accountNotFound"));
    }

    #[test]
    fn normalizes_interaction_required_without_exposing_raw_stderr() {
        let runner = FakeRunner::new(vec![
            FakeRunner::success(
                r#"[{"id":"sub-prod","name":"Production","tenantId":"tenant-prod","isDefault":true,"state":"Enabled","user":{"name":"alex@contoso.com","type":"user"}}]"#,
            ),
            Err(AzureCommandError::Failed {
                stderr: "AADSTS50058: secret-correlation-data. Please run 'az login'.".to_string(),
            }),
        ]);

        let status = check_azure_auth_with_runner(AZURE_CLI_KUBECONFIG, "aks-orders-prod", &runner);

        assert_eq!(status.state, AzureAuthState::Expired);
        assert_eq!(status.reason.as_deref(), Some("interactionRequired"));
        assert!(!status
            .safe_message
            .unwrap_or_default()
            .contains("secret-correlation-data"));
    }

    #[test]
    fn reports_missing_azure_cli_as_actionable_error() {
        let runner = FakeRunner::new(vec![Err(AzureCommandError::NotFound)]);

        let status = check_azure_auth_with_runner(AZURE_CLI_KUBECONFIG, "aks-orders-prod", &runner);

        assert_eq!(status.state, AzureAuthState::Error);
        assert_eq!(status.reason.as_deref(), Some("cliMissing"));
        assert!(status
            .safe_message
            .unwrap_or_default()
            .contains("Azure CLI"));
    }

    #[test]
    fn builds_browser_login_as_the_default_interactive_flow() {
        assert_eq!(
            build_login_args("tenant-prod", AzureLoginMethod::Browser),
            vec![
                "login",
                "--tenant",
                "tenant-prod",
                "--allow-no-subscriptions",
                "--output",
                "none",
                "--only-show-errors",
            ]
        );
    }

    #[test]
    fn adds_device_code_flag_only_for_device_flow() {
        let args = build_login_args("tenant-prod", AzureLoginMethod::DeviceCode);
        assert!(args.contains(&"--use-device-code".to_string()));
    }

    #[test]
    fn extracts_device_code_and_verification_url_from_cli_instruction() {
        let instruction = parse_device_instruction(
            "To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code F7KQ-P9WX to authenticate.",
        );

        assert_eq!(
            instruction.verification_url.as_deref(),
            Some("https://microsoft.com/devicelogin")
        );
        assert_eq!(instruction.user_code.as_deref(), Some("F7KQ-P9WX"));
    }

    #[test]
    fn reuses_one_active_login_per_tenant_until_it_is_released() {
        let reservations = LoginReservations::default();

        assert_eq!(
            reservations.reserve("tenant-prod", "login-1"),
            LoginReservation::Started
        );
        assert_eq!(
            reservations.reserve("tenant-prod", "login-2"),
            LoginReservation::Existing("login-1".to_string())
        );

        reservations.release("tenant-prod", "login-1");
        assert_eq!(
            reservations.reserve("tenant-prod", "login-2"),
            LoginReservation::Started
        );
    }
}
