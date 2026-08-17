use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

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
}

pub struct SystemAzureCommandRunner;

impl AzureCommandRunner for SystemAzureCommandRunner {
    fn run(
        &self,
        program: &str,
        args: &[String],
        timeout: Duration,
    ) -> Result<AzureCommandOutput, AzureCommandError> {
        let mut command = Command::new(program);
        command
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = command.spawn().map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                AzureCommandError::NotFound
            } else {
                AzureCommandError::Io
            }
        })?;
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let _ = sender.send(child.wait_with_output());
        });

        let output = receiver
            .recv_timeout(timeout)
            .map_err(|error| match error {
                mpsc::RecvTimeoutError::Timeout => AzureCommandError::Timeout,
                mpsc::RecvTimeoutError::Disconnected => AzureCommandError::Io,
            })?
            .map_err(|_| AzureCommandError::Io)?;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if !output.status.success() {
            return Err(AzureCommandError::Failed { stderr });
        }

        Ok(AzureCommandOutput { stdout })
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
    env: Vec<AuthEnv>,
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

            let login_mode = argument_value(&exec.args, &["--login", "-l"])
                .unwrap_or_else(|| "devicecode".to_string());
            let tenant_id =
                argument_value(&exec.args, &["--tenant-id", "--tenant", "-t"]).or_else(|| {
                    exec.env
                        .iter()
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

pub fn check_azure_auth_with_runner<R: AzureCommandRunner>(
    kubeconfig_yaml: &str,
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

    let Some(tenant_id) = selected.tenant_id.as_deref() else {
        let mut status = base_status(context_name, AzureAuthState::Error);
        status.login_mode = Some(selected.login_mode.clone());
        status.affected_contexts = affected_contexts;
        status.reason = Some("tenantMissing".to_string());
        status.safe_message =
            Some("This Azure kubeconfig context does not include a tenant ID.".to_string());
        return status;
    };

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
        status.tenant_id = selected.tenant_id.clone();
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
        tenant_id.to_string(),
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
            status.affected_contexts = affected_contexts;
            return status;
        }
    };
    let token: RawTokenMetadata = match serde_json::from_str(&token_output.stdout) {
        Ok(token) => token,
        Err(_) => {
            let mut status = base_status(context_name, AzureAuthState::Error);
            status.tenant_id = selected.tenant_id.clone();
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
    status.tenant_id = selected.tenant_id.clone();
    status.login_mode = Some(selected.login_mode.clone());
    status.account = accounts.first().cloned();
    status.accounts = accounts;
    status.expires_at_epoch_seconds = epoch_seconds(&token.expires_on);
    status.affected_contexts = affected_contexts;
    status
}

pub fn check_azure_auth(config_path: &str, context_name: &str) -> AzureSessionStatus {
    let kubeconfig_yaml = match std::fs::read_to_string(config_path) {
        Ok(contents) => contents,
        Err(_) => {
            let mut status = base_status(context_name, AzureAuthState::Error);
            status.reason = Some("configReadFailed".to_string());
            status.safe_message =
                Some("KubeCLI could not read the selected kubeconfig.".to_string());
            return status;
        }
    };

    check_azure_auth_with_runner(&kubeconfig_yaml, context_name, &SystemAzureCommandRunner)
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
}

lazy_static::lazy_static! {
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
    match LOGIN_RESERVATIONS.reserve(&tenant_id, &login_id) {
        LoginReservation::Existing(existing) => {
            return Ok(AzureLoginStart {
                login_id: existing,
                reused: true,
            });
        }
        LoginReservation::Started => {}
    }

    let mut command = Command::new("az");
    command
        .args(build_login_args(&tenant_id, method))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            LOGIN_RESERVATIONS.release(&tenant_id, &login_id);
            return Err(if error.kind() == std::io::ErrorKind::NotFound {
                "Azure CLI is not installed or is not available in KubeCLI's PATH.".to_string()
            } else {
                "KubeCLI could not start Azure CLI.".to_string()
            });
        }
    };

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
        let progress = if was_cancelled {
            AzureAuthProgress {
                login_id: worker_login_id.clone(),
                phase: "cancelled".to_string(),
                verification_url: None,
                user_code: None,
                safe_message: Some("Azure sign-in was cancelled.".to_string()),
                status: None,
            }
        } else if exit_status.map(|status| status.success()).unwrap_or(false) {
            let status = check_azure_auth(&config_path, &context_name);
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

        if let Ok(mut active) = ACTIVE_AZURE_LOGINS.lock() {
            active.remove(&worker_login_id);
        }
        LOGIN_RESERVATIONS.release(&tenant_id, &worker_login_id);
        emit_auth_progress(&app, progress);
    });

    Ok(AzureLoginStart {
        login_id,
        reused: false,
    })
}

pub fn cancel_azure_login(login_id: &str) -> Result<(), String> {
    let (child, cancelled) = {
        let active = ACTIVE_AZURE_LOGINS
            .lock()
            .map_err(|_| "Failed to access Azure login process".to_string())?;
        let Some(login) = active.get(login_id) else {
            return Ok(());
        };
        (Arc::clone(&login.child), Arc::clone(&login.cancelled))
    };
    cancelled.store(true, Ordering::SeqCst);
    let result = child
        .lock()
        .map_err(|_| "Failed to access Azure login process".to_string())?
        .kill()
        .map_err(|_| "Failed to cancel Azure sign-in".to_string());
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
        build_login_args, check_azure_auth_with_runner, discover_azure_contexts,
        parse_device_instruction, AzureAuthState, AzureCommandError, AzureCommandOutput,
        AzureCommandRunner, AzureLoginMethod, LoginReservation, LoginReservations,
    };
    use std::cell::RefCell;
    use std::collections::VecDeque;
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
        args: [get-token, --login, azurecli, --tenant-id, tenant-prod]
"#;

    struct FakeRunner {
        responses: RefCell<VecDeque<Result<AzureCommandOutput, AzureCommandError>>>,
        calls: RefCell<Vec<Vec<String>>>,
    }

    impl FakeRunner {
        fn new(responses: Vec<Result<AzureCommandOutput, AzureCommandError>>) -> Self {
            Self {
                responses: RefCell::new(responses.into()),
                calls: RefCell::new(Vec::new()),
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
