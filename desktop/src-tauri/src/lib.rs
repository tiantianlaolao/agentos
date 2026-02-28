mod ws_client;
mod process_manager;
mod skill_executor;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{
    ipc::Channel, Manager,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    menu::{MenuBuilder, MenuItemBuilder},
};
use tokio::sync::Mutex;
use ws_client::{WsClient, ConnectResult};
use process_manager::ProcessManager;

struct AppState {
    ws_client: Arc<Mutex<WsClient>>,
    process_manager: Arc<Mutex<ProcessManager>>,
}

// ── Tauri Commands ──

#[tauri::command]
async fn connect_server(
    state: tauri::State<'_, AppState>,
    url: String,
    mode: String,
    auth_token: Option<String>,
    api_key: Option<String>,
    model: Option<String>,
    copaw_url: Option<String>,
    copaw_token: Option<String>,
    agent_url: Option<String>,
    agent_token: Option<String>,
    agent_protocol: Option<String>,
    on_event: Channel<Value>,
) -> Result<ConnectResult, String> {
    println!("[Tauri] connect_server called (mode: {})", mode);
    let mut client = state.ws_client.lock().await;
    let result = client
        .connect(&url, &mode, auth_token, api_key, model, copaw_url, copaw_token, agent_url, agent_token, agent_protocol, on_event)
        .await
        .map_err(|e| e.to_string());
    println!("[Tauri] connect_server result: {:?}", result);
    result
}

#[tauri::command]
async fn disconnect_server(state: tauri::State<'_, AppState>) -> Result<(), String> {
    println!("[Tauri] disconnect_server called");
    // Print backtrace-like info
    let mut client = state.ws_client.lock().await;
    println!("[Tauri] disconnect_server: was_connected={}", client.is_connected());
    client.disconnect().await;
    Ok(())
}

#[tauri::command]
async fn send_message(
    state: tauri::State<'_, AppState>,
    conversation_id: String,
    content: String,
    history: Vec<ChatMessage>,
) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client
        .send_chat(&conversation_id, &content, &history)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_generation(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client.stop_chat().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_connection_status(state: tauri::State<'_, AppState>) -> Result<bool, String> {
    let client = state.ws_client.lock().await;
    Ok(client.is_connected())
}

// ── Process Manager commands ──

#[derive(Serialize)]
struct AgentStatus {
    name: String,
    status: String, // "running", "stopped", "error"
    pid: Option<u32>,
}

#[tauri::command]
async fn launch_agent(
    state: tauri::State<'_, AppState>,
    name: String,
    command: String,
    args: Vec<String>,
) -> Result<u32, String> {
    let mut pm = state.process_manager.lock().await;
    pm.spawn(&name, &command, &args).map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_agent(state: tauri::State<'_, AppState>, name: String) -> Result<(), String> {
    let mut pm = state.process_manager.lock().await;
    pm.kill(&name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_agents(state: tauri::State<'_, AppState>) -> Result<Vec<AgentStatus>, String> {
    let pm = state.process_manager.lock().await;
    Ok(pm
        .list()
        .into_iter()
        .map(|(name, info)| AgentStatus {
            name,
            status: info.0.to_string(),
            pid: info.1,
        })
        .collect())
}

#[tauri::command]
async fn get_agent_logs(
    state: tauri::State<'_, AppState>,
    name: String,
    lines: Option<usize>,
) -> Result<Vec<String>, String> {
    let pm = state.process_manager.lock().await;
    pm.get_logs(&name, lines.unwrap_or(100))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn request_skill_list(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client
        .send_skill_list_request()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn toggle_skill(
    state: tauri::State<'_, AppState>,
    name: String,
    enabled: bool,
) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client
        .send_skill_toggle(&name, enabled)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_skill(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client
        .send_skill_install(&name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn uninstall_skill(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client
        .send_skill_uninstall(&name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn request_skill_library(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client
        .send_skill_library_request()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn request_skill_config(
    state: tauri::State<'_, AppState>,
    skill_name: String,
) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client
        .send_skill_config_get(&skill_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_skill_config(
    state: tauri::State<'_, AppState>,
    skill_name: String,
    config: Value,
) -> Result<(), String> {
    let client = state.ws_client.lock().await;
    client
        .send_skill_config_set(&skill_name, &config)
        .await
        .map_err(|e| e.to_string())
}

// ── Local OpenClaw management commands ──

const OPENCLAW_PROCESS_NAME: &str = "local-openclaw";

#[derive(Serialize)]
struct PrerequisiteStatus {
    node_installed: bool,
    node_version: String,
    npm_installed: bool,
    openclaw_installed: bool,
    openclaw_version: String,
}

/// Build an extended PATH that includes common Node.js install locations (nvm, Homebrew, Volta, fnm).
fn extended_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut path = std::env::var("PATH").unwrap_or_default();
    // For nvm, find the latest installed version directory
    if let Ok(entries) = std::fs::read_dir(format!("{}/.nvm/versions/node", home)) {
        let mut versions: Vec<_> = entries.filter_map(|e| e.ok()).collect();
        versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
        if let Some(latest) = versions.first() {
            path = format!("{}/bin:{}", latest.path().display(), path);
        }
    }
    let extra = [
        "/usr/local/bin",
        "/opt/homebrew/bin",
        &format!("{}/.volta/bin", home),
        &format!("{}/.fnm/aliases/default/bin", home),
    ];
    for p in extra {
        if !path.contains(p) {
            path = format!("{}:{}", p, path);
        }
    }
    path
}

#[tauri::command]
async fn check_openclaw_prerequisites() -> Result<PrerequisiteStatus, String> {
    let path = extended_path();

    let node_output = std::process::Command::new("node")
        .arg("--version")
        .env("PATH", &path)
        .output();
    let (node_installed, node_version) = match node_output {
        Ok(out) if out.status.success() => {
            let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
            // Check >= 18: parse "v18.x.y"
            let major: u32 = ver
                .trim_start_matches('v')
                .split('.')
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            (major >= 18, ver)
        }
        _ => (false, String::new()),
    };

    let npm_output = std::process::Command::new("npm")
        .arg("--version")
        .env("PATH", &path)
        .output();
    let npm_installed = npm_output.map(|o| o.status.success()).unwrap_or(false);

    let oc_output = std::process::Command::new("openclaw")
        .arg("--version")
        .env("PATH", &path)
        .output();
    let (openclaw_installed, openclaw_version) = match oc_output {
        Ok(out) if out.status.success() => {
            let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
            (true, ver)
        }
        _ => (false, String::new()),
    };

    Ok(PrerequisiteStatus {
        node_installed,
        node_version,
        npm_installed,
        openclaw_installed,
        openclaw_version,
    })
}

#[derive(Serialize)]
struct InstallResult {
    success: bool,
    token: String,
    config_dir: String,
    error: String,
}

#[tauri::command]
async fn install_openclaw(
    provider: String,
    api_key: String,
    model: String,
    port: Option<u16>,
    registry: Option<String>,
    base_url: Option<String>,
    user_id: Option<String>,
) -> Result<InstallResult, String> {
    let port = port.unwrap_or(18789);
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = if let Some(ref uid) = user_id {
        home.join(".agentos").join("openclaw").join("users").join(uid)
    } else {
        home.join(".agentos").join("openclaw")
    };
    let path = extended_path();

    // Step 1: npm install -g openclaw (skip if already installed)
    let oc_check = std::process::Command::new("openclaw")
        .arg("--version")
        .env("PATH", &path)
        .output();
    let already_installed = oc_check.map(|o| o.status.success()).unwrap_or(false);

    if !already_installed {
        let mut npm_args = vec!["install".to_string(), "-g".to_string(), "openclaw".to_string()];
        if let Some(ref reg) = registry {
            npm_args.push(format!("--registry={}", reg));
        }
        let npm_result = std::process::Command::new("npm")
            .args(&npm_args)
            .env("PATH", &path)
            .output()
            .map_err(|e| format!("Failed to run npm: {}", e))?;
        if !npm_result.status.success() {
            let stderr = String::from_utf8_lossy(&npm_result.stderr);
            return Ok(InstallResult {
                success: false,
                token: String::new(),
                config_dir: String::new(),
                error: format!("npm install failed: {}", stderr),
            });
        }
    }

    // Step 2: Create directory structure
    let state_dir = config_dir.join("state");
    let agent_auth_dir = state_dir.join("agents").join("main").join("agent");
    let workspace_dir = config_dir.join("workspace");
    std::fs::create_dir_all(&agent_auth_dir)
        .map_err(|e| format!("Failed to create config dirs: {}", e))?;
    std::fs::create_dir_all(&workspace_dir)
        .map_err(|e| format!("Failed to create workspace: {}", e))?;

    // Step 3: Generate random token
    let token: String = (0..48)
        .map(|_| {
            let idx = (rand::random::<u8>() % 16) as usize;
            "0123456789abcdef".chars().nth(idx).unwrap()
        })
        .collect();

    // Step 4: Write auth-profiles.json
    let auth_profile_key = format!("{}:default", provider);
    let auth_profiles = serde_json::json!({
        "version": 1,
        "profiles": {
            &auth_profile_key: {
                "type": "api_key",
                "provider": &provider,
                "key": &api_key,
            }
        },
        "lastGood": {
            &provider: &auth_profile_key,
        }
    });
    std::fs::write(
        agent_auth_dir.join("auth-profiles.json"),
        serde_json::to_string_pretty(&auth_profiles).unwrap(),
    ).map_err(|e| format!("Failed to write auth-profiles: {}", e))?;

    // Step 5: Write openclaw.json
    let default_base_url = match provider.as_str() {
        "deepseek" => "https://api.deepseek.com/v1",
        "openai" => "https://api.openai.com/v1",
        "anthropic" => "https://api.anthropic.com",
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai",
        "moonshot" => "https://api.moonshot.cn/v1",
        "qwen" => "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "zhipu" => "https://open.bigmodel.cn/api/paas/v4",
        "openrouter" => "https://openrouter.ai/api/v1",
        _ => "https://api.deepseek.com/v1",
    };
    let effective_base_url = base_url.as_deref().unwrap_or(default_base_url);
    let api_type = if provider == "anthropic" { "anthropic" } else { "openai-completions" };
    let model_id = if model.is_empty() {
        match provider.as_str() {
            "deepseek" => "deepseek-chat",
            "openai" => "gpt-4o",
            "anthropic" => "claude-sonnet-4-20250514",
            "gemini" => "gemini-2.5-flash",
            "moonshot" => "kimi-k2.5",
            "qwen" => "qwen-max",
            "zhipu" => "glm-4",
            "openrouter" => "auto",
            _ => "deepseek-chat",
        }
    } else {
        &model
    };

    let config = serde_json::json!({
        "meta": { "lastTouchedVersion": "agentos-local-install" },
        "auth": {
            "profiles": {
                &auth_profile_key: { "provider": &provider, "mode": "api_key" }
            }
        },
        "models": {
            "mode": "merge",
            "providers": {
                &provider: {
                    "baseUrl": effective_base_url,
                    "api": api_type,
                    "models": [{
                        "id": model_id,
                        "name": model_id,
                        "reasoning": false,
                        "input": ["text"],
                        "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                        "contextWindow": 128000,
                        "maxTokens": 8192,
                    }]
                }
            }
        },
        "agents": {
            "defaults": {
                "model": { "primary": format!("{}/{}", provider, model_id) },
                "workspace": workspace_dir.to_string_lossy(),
                "maxConcurrent": 2,
                "subagents": { "maxConcurrent": 4 },
            }
        },
        "commands": { "native": "auto", "nativeSkills": "auto" },
        "gateway": {
            "port": port,
            "mode": "local",
            "bind": "loopback",
            "auth": { "mode": "token", "token": &token },
        },
        "skills": { "install": { "nodeManager": "npm" } },
    });
    std::fs::write(
        config_dir.join("openclaw.json"),
        serde_json::to_string_pretty(&config).unwrap(),
    ).map_err(|e| format!("Failed to write openclaw.json: {}", e))?;

    Ok(InstallResult {
        success: true,
        token: token.clone(),
        config_dir: config_dir.to_string_lossy().to_string(),
        error: String::new(),
    })
}

#[tauri::command]
async fn start_local_openclaw(
    state: tauri::State<'_, AppState>,
    port: Option<u16>,
    user_id: Option<String>,
) -> Result<String, String> {
    let port = port.unwrap_or(18789);
    let mut pm = state.process_manager.lock().await;

    if pm.is_running(OPENCLAW_PROCESS_NAME) {
        return Ok("already_running".to_string());
    }

    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = if let Some(ref uid) = user_id {
        home.join(".agentos").join("openclaw").join("users").join(uid)
    } else {
        home.join(".agentos").join("openclaw")
    };
    let config_path = config_dir.join("openclaw.json");
    let state_dir = config_dir.join("state");

    if !config_path.exists() {
        return Err("OpenClaw not installed. Run install first.".to_string());
    }

    let mut envs = HashMap::new();
    envs.insert("OPENCLAW_CONFIG_PATH".to_string(), config_path.to_string_lossy().to_string());
    envs.insert("OPENCLAW_STATE_DIR".to_string(), state_dir.to_string_lossy().to_string());
    envs.insert("PATH".to_string(), extended_path());

    let _pid = pm.spawn_with_env(
        OPENCLAW_PROCESS_NAME,
        "openclaw",
        &["gateway".to_string()],
        Some(&envs),
    ).map_err(|e| format!("Failed to start OpenClaw: {}", e))?;

    // Drop the lock before polling
    drop(pm);

    // Health check: poll until ready
    let url = format!("http://127.0.0.1:{}/health", port);
    let client = reqwest::Client::new();
    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        if let Ok(resp) = client.get(&url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                println!("[Tauri] Local OpenClaw started on port {}", port);
                return Ok("started".to_string());
            }
        }
    }

    // Timed out — check if process still alive
    let pm = state.process_manager.lock().await;
    if pm.is_running(OPENCLAW_PROCESS_NAME) {
        // Process alive but health check failed
        Ok("started_no_health".to_string())
    } else {
        Err("OpenClaw process exited before becoming ready".to_string())
    }
}

#[tauri::command]
async fn stop_local_openclaw(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // First try to kill via process manager (app-managed process)
    let mut pm = state.process_manager.lock().await;
    let _ = pm.kill(OPENCLAW_PROCESS_NAME);
    drop(pm);

    // Also find and kill any process listening on port 18789 (handles
    // externally-started gateway processes not tracked by process manager)
    if let Ok(output) = std::process::Command::new("lsof")
        .args(&["-ti", ":18789"])
        .output()
    {
        let pids = String::from_utf8_lossy(&output.stdout);
        for pid_str in pids.split_whitespace() {
            if let Ok(_pid) = pid_str.parse::<u32>() {
                let _ = std::process::Command::new("kill")
                    .arg(pid_str.trim())
                    .output();
            }
        }
    }

    Ok(())
}

#[derive(Serialize)]
struct LocalOpenclawStatus {
    running: bool,
    pid: Option<u32>,
    port: u16,
    version: String,
}

#[tauri::command]
async fn get_local_openclaw_status(
    state: tauri::State<'_, AppState>,
    port: Option<u16>,
) -> Result<LocalOpenclawStatus, String> {
    let port = port.unwrap_or(18789);
    let pm = state.process_manager.lock().await;
    let mut running = pm.is_running(OPENCLAW_PROCESS_NAME);
    let mut pid = if running {
        pm.list().into_iter().find(|(n, _)| n == OPENCLAW_PROCESS_NAME).and_then(|(_, info)| info.1)
    } else {
        None
    };

    // Also check if any process is listening on the port (catches externally-started gateways)
    if !running {
        if let Ok(output) = std::process::Command::new("lsof")
            .args(&["-ti", &format!(":{}", port)])
            .output()
        {
            let pids_str = String::from_utf8_lossy(&output.stdout);
            if let Some(first_pid) = pids_str.split_whitespace().next() {
                if let Ok(p) = first_pid.parse::<u32>() {
                    running = true;
                    pid = Some(p);
                }
            }
        }
    }

    let oc_output = std::process::Command::new("openclaw")
        .arg("--version")
        .env("PATH", &extended_path())
        .output();
    let version = match oc_output {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        _ => String::new(),
    };

    Ok(LocalOpenclawStatus { running, pid, port, version })
}

#[tauri::command]
async fn update_local_openclaw_config(
    provider: String,
    api_key: String,
    model: String,
    base_url: Option<String>,
    user_id: Option<String>,
) -> Result<(), String> {
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = if let Some(ref uid) = user_id {
        home.join(".agentos").join("openclaw").join("users").join(uid)
    } else {
        home.join(".agentos").join("openclaw")
    };
    let config_path = config_dir.join("openclaw.json");
    let agent_auth_dir = config_dir.join("state").join("agents").join("main").join("agent");

    if !config_path.exists() {
        return Err("OpenClaw not installed".to_string());
    }

    // Read existing config to preserve token/port
    let existing_str = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let mut config: serde_json::Value = serde_json::from_str(&existing_str)
        .map_err(|e| format!("Failed to parse config: {}", e))?;

    // Update model/provider in config
    let default_base_url = match provider.as_str() {
        "deepseek" => "https://api.deepseek.com/v1",
        "openai" => "https://api.openai.com/v1",
        "anthropic" => "https://api.anthropic.com",
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai",
        "moonshot" => "https://api.moonshot.cn/v1",
        "qwen" => "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "zhipu" => "https://open.bigmodel.cn/api/paas/v4",
        "openrouter" => "https://openrouter.ai/api/v1",
        _ => "https://api.deepseek.com/v1",
    };
    let effective_base_url = base_url.as_deref().unwrap_or(default_base_url);
    let api_type = if provider == "anthropic" { "anthropic" } else { "openai-completions" };
    let model_id = if model.is_empty() {
        match provider.as_str() {
            "deepseek" => "deepseek-chat",
            "openai" => "gpt-4o",
            "anthropic" => "claude-sonnet-4-20250514",
            "gemini" => "gemini-2.5-flash",
            "moonshot" => "kimi-k2.5",
            "qwen" => "qwen-max",
            "zhipu" => "glm-4",
            "openrouter" => "auto",
            _ => "deepseek-chat",
        }
    } else {
        &model
    };
    let auth_profile_key = format!("{}:default", provider);

    config["auth"]["profiles"] = serde_json::json!({
        &auth_profile_key: { "provider": &provider, "mode": "api_key" }
    });
    config["models"]["providers"] = serde_json::json!({
        &provider: {
            "baseUrl": effective_base_url,
            "api": api_type,
            "models": [{
                "id": model_id,
                "name": model_id,
                "reasoning": false,
                "input": ["text"],
                "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0 },
                "contextWindow": 128000,
                "maxTokens": 8192,
            }]
        }
    });
    config["agents"]["defaults"]["model"]["primary"] = serde_json::json!(format!("{}/{}", provider, model_id));

    std::fs::write(
        &config_path,
        serde_json::to_string_pretty(&config).unwrap(),
    ).map_err(|e| format!("Failed to write config: {}", e))?;

    // Update auth-profiles.json
    let auth_profiles = serde_json::json!({
        "version": 1,
        "profiles": {
            &auth_profile_key: {
                "type": "api_key",
                "provider": &provider,
                "key": &api_key,
            }
        },
        "lastGood": {
            &provider: &auth_profile_key,
        }
    });
    std::fs::write(
        agent_auth_dir.join("auth-profiles.json"),
        serde_json::to_string_pretty(&auth_profiles).unwrap(),
    ).map_err(|e| format!("Failed to write auth-profiles: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn check_local_openclaw_installed(user_id: String) -> Result<bool, String> {
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_path = home.join(".agentos").join("openclaw").join("users").join(&user_id).join("openclaw.json");
    Ok(config_path.exists())
}

#[tauri::command]
async fn upgrade_openclaw(registry: Option<String>) -> Result<String, String> {
    let path = extended_path();
    let mut args = vec!["update".to_string(), "-g".to_string(), "openclaw".to_string()];
    if let Some(ref reg) = registry {
        args.push(format!("--registry={}", reg));
    }
    let output = std::process::Command::new("npm")
        .args(&args)
        .env("PATH", &path)
        .output()
        .map_err(|e| format!("Failed to run npm: {}", e))?;

    if output.status.success() {
        // Get new version
        let ver_output = std::process::Command::new("openclaw")
            .arg("--version")
            .env("PATH", &path)
            .output();
        let ver = match ver_output {
            Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).trim().to_string(),
            _ => "unknown".to_string(),
        };
        Ok(ver)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("npm update failed: {}", stderr))
    }
}

// ── Local CoPaw management commands ──

const COPAW_PROCESS_NAME: &str = "local-copaw";

/// Build an extended PATH for Python (Homebrew, conda, pyenv, system).
fn python_extended_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let mut path = extended_path(); // start with Node paths too
    let extra = [
        &format!("{}/miniconda3/bin", home),
        &format!("{}/anaconda3/bin", home),
        &format!("{}/.pyenv/shims", home),
        &format!("{}/.local/bin", home),
        "/usr/local/bin",
        "/opt/homebrew/bin",
    ];
    for p in extra {
        if !path.contains(p) {
            path = format!("{}:{}", p, path);
        }
    }
    path
}

#[derive(Serialize)]
struct CopawPrerequisiteStatus {
    python_installed: bool,
    python_version: String,
    pip_installed: bool,
}

#[tauri::command]
async fn check_copaw_prerequisites() -> Result<CopawPrerequisiteStatus, String> {
    let path = python_extended_path();

    let python_output = std::process::Command::new("python3")
        .arg("--version")
        .env("PATH", &path)
        .output();
    let (python_installed, python_version) = match python_output {
        Ok(out) if out.status.success() => {
            // "Python 3.x.y"
            let ver = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let ver_str = ver.strip_prefix("Python ").unwrap_or(&ver);
            let major_minor: Vec<u32> = ver_str
                .split('.')
                .take(2)
                .filter_map(|s| s.parse().ok())
                .collect();
            let ok = major_minor.len() == 2 && (major_minor[0] > 3 || (major_minor[0] == 3 && major_minor[1] >= 8));
            (ok, ver_str.to_string())
        }
        _ => (false, String::new()),
    };

    let pip_output = std::process::Command::new("pip3")
        .arg("--version")
        .env("PATH", &path)
        .output();
    let pip_installed = pip_output.map(|o| o.status.success()).unwrap_or(false);

    Ok(CopawPrerequisiteStatus {
        python_installed,
        python_version,
        pip_installed,
    })
}

#[derive(Serialize)]
struct CopawInstallResult {
    success: bool,
    config_dir: String,
    error: String,
}

#[tauri::command]
async fn install_copaw(
    app_handle: tauri::AppHandle,
    provider: String,
    api_key: String,
    model: String,
    port: Option<u16>,
    base_url: Option<String>,
) -> Result<CopawInstallResult, String> {
    let port = port.unwrap_or(8088);
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = home.join(".agentos").join("copaw");
    let path = python_extended_path();

    // Step 1: Create directory
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    // Step 2: Copy server.py from Tauri resources
    let resource_path = app_handle.path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;
    let src_server = resource_path.join("copaw").join("server.py");
    let src_reqs = resource_path.join("copaw").join("requirements.txt");

    // Fallback: check in src-tauri/resources for dev mode
    let src_server = if src_server.exists() {
        src_server
    } else {
        let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("copaw")
            .join("server.py");
        if dev_path.exists() { dev_path } else {
            return Ok(CopawInstallResult {
                success: false,
                config_dir: String::new(),
                error: "CoPaw server.py not found in resources".to_string(),
            });
        }
    };
    let src_reqs = if src_reqs.exists() {
        src_reqs
    } else {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("copaw")
            .join("requirements.txt")
    };

    std::fs::copy(&src_server, config_dir.join("server.py"))
        .map_err(|e| format!("Failed to copy server.py: {}", e))?;
    if src_reqs.exists() {
        std::fs::copy(&src_reqs, config_dir.join("requirements.txt"))
            .map_err(|e| format!("Failed to copy requirements.txt: {}", e))?;
    }

    // Step 3: pip install requirements
    let reqs_path = config_dir.join("requirements.txt");
    if reqs_path.exists() {
        let pip_result = std::process::Command::new("pip3")
            .args(&["install", "-r", &reqs_path.to_string_lossy()])
            .env("PATH", &path)
            .output()
            .map_err(|e| format!("Failed to run pip3: {}", e))?;
        if !pip_result.status.success() {
            let stderr = String::from_utf8_lossy(&pip_result.stderr);
            return Ok(CopawInstallResult {
                success: false,
                config_dir: String::new(),
                error: format!("pip install failed: {}", stderr),
            });
        }
    }

    // Step 4: Determine base URL from provider
    let default_base_url = match provider.as_str() {
        "deepseek" => "https://api.deepseek.com/v1",
        "openai" => "https://api.openai.com/v1",
        "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai",
        "moonshot" => "https://api.moonshot.cn/v1",
        "qwen" => "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "zhipu" => "https://open.bigmodel.cn/api/paas/v4",
        "openrouter" => "https://openrouter.ai/api/v1",
        _ => "https://api.deepseek.com/v1",
    };
    let effective_base_url = base_url.as_deref().unwrap_or(default_base_url);

    let default_model = match provider.as_str() {
        "deepseek" => "deepseek-chat",
        "openai" => "gpt-4o",
        "gemini" => "gemini-2.5-flash",
        "moonshot" => "kimi-k2.5",
        "qwen" => "qwen-max",
        "zhipu" => "glm-4",
        "openrouter" => "auto",
        _ => "deepseek-chat",
    };
    let effective_model = if model.is_empty() { default_model } else { &model };

    // Step 5: Write .env file
    let env_content = format!(
        "LLM_API_KEY={}\nLLM_BASE_URL={}\nLLM_MODEL={}\nCOPAW_PORT={}\nCOPAW_HOST=127.0.0.1\n",
        api_key, effective_base_url, effective_model, port
    );
    std::fs::write(config_dir.join(".env"), &env_content)
        .map_err(|e| format!("Failed to write .env: {}", e))?;

    Ok(CopawInstallResult {
        success: true,
        config_dir: config_dir.to_string_lossy().to_string(),
        error: String::new(),
    })
}

#[tauri::command]
async fn start_local_copaw(
    state: tauri::State<'_, AppState>,
    port: Option<u16>,
) -> Result<String, String> {
    let port = port.unwrap_or(8088);
    let mut pm = state.process_manager.lock().await;

    if pm.is_running(COPAW_PROCESS_NAME) {
        return Ok("already_running".to_string());
    }

    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = home.join(".agentos").join("copaw");
    let server_path = config_dir.join("server.py");

    if !server_path.exists() {
        return Err("CoPaw not installed. Run install first.".to_string());
    }

    let mut envs = HashMap::new();
    envs.insert("PATH".to_string(), python_extended_path());

    let _pid = pm.spawn_with_env(
        COPAW_PROCESS_NAME,
        "python3",
        &[server_path.to_string_lossy().to_string()],
        Some(&envs),
    ).map_err(|e| format!("Failed to start CoPaw: {}", e))?;

    // Drop the lock before polling
    drop(pm);

    // Health check: poll until ready
    let url = format!("http://127.0.0.1:{}/health", port);
    let client = reqwest::Client::new();
    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(1000)).await;
        if let Ok(resp) = client.get(&url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                println!("[Tauri] Local CoPaw started on port {}", port);
                return Ok("started".to_string());
            }
        }
    }

    // Timed out — check if process still alive
    let pm = state.process_manager.lock().await;
    if pm.is_running(COPAW_PROCESS_NAME) {
        Ok("started_no_health".to_string())
    } else {
        Err("CoPaw process exited before becoming ready".to_string())
    }
}

#[tauri::command]
async fn stop_local_copaw(
    state: tauri::State<'_, AppState>,
    port: Option<u16>,
) -> Result<(), String> {
    let port = port.unwrap_or(8088);
    let mut pm = state.process_manager.lock().await;
    let _ = pm.kill(COPAW_PROCESS_NAME);
    drop(pm);

    // Also kill any process listening on the port
    if let Ok(output) = std::process::Command::new("lsof")
        .args(&["-ti", &format!(":{}", port)])
        .output()
    {
        let pids = String::from_utf8_lossy(&output.stdout);
        for pid_str in pids.split_whitespace() {
            if pid_str.parse::<u32>().is_ok() {
                let _ = std::process::Command::new("kill")
                    .arg(pid_str.trim())
                    .output();
            }
        }
    }

    Ok(())
}

#[derive(Serialize)]
struct LocalCopawStatus {
    running: bool,
    pid: Option<u32>,
    port: u16,
}

#[tauri::command]
async fn get_local_copaw_status(
    state: tauri::State<'_, AppState>,
    port: Option<u16>,
) -> Result<LocalCopawStatus, String> {
    let port = port.unwrap_or(8088);
    let pm = state.process_manager.lock().await;
    let mut running = pm.is_running(COPAW_PROCESS_NAME);
    let mut pid = if running {
        pm.list().into_iter().find(|(n, _)| n == COPAW_PROCESS_NAME).and_then(|(_, info)| info.1)
    } else {
        None
    };

    // Also check if any process is listening on the port
    if !running {
        if let Ok(output) = std::process::Command::new("lsof")
            .args(&["-ti", &format!(":{}", port)])
            .output()
        {
            let pids_str = String::from_utf8_lossy(&output.stdout);
            if let Some(first_pid) = pids_str.split_whitespace().next() {
                if let Ok(p) = first_pid.parse::<u32>() {
                    running = true;
                    pid = Some(p);
                }
            }
        }
    }

    Ok(LocalCopawStatus { running, pid, port })
}

#[tauri::command]
async fn check_local_copaw_installed() -> Result<bool, String> {
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let env_path = home.join(".agentos").join("copaw").join(".env");
    Ok(env_path.exists())
}

// ── ClawHub skill management commands (desktop deploy mode) ──

#[derive(Serialize, Deserialize)]
struct ClawHubSkill {
    name: String,
    slug: String,
    description: String,
    author: String,
    version: String,
}

/// Search or explore ClawHub marketplace skills via the clawhub CLI.
/// Empty query = explore (list all); non-empty = search.
#[tauri::command]
async fn clawhub_search(query: String, _user_id: String) -> Result<Vec<ClawHubSkill>, String> {
    let path = extended_path();

    let output = if query.trim().is_empty() {
        std::process::Command::new("clawhub")
            .args(["explore", "--limit", "100"])
            .env("PATH", &path)
            .output()
            .map_err(|e| format!("Failed to run clawhub: {}", e))?
    } else {
        std::process::Command::new("clawhub")
            .args(["search", &query, "--limit", "30"])
            .env("PATH", &path)
            .output()
            .map_err(|e| format!("Failed to run clawhub: {}", e))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("clawhub failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let skills = parse_clawhub_output(&stdout);
    Ok(skills)
}

/// Parse clawhub CLI output into structured skill list.
fn parse_clawhub_output(output: &str) -> Vec<ClawHubSkill> {
    if output.trim().is_empty() {
        return vec![];
    }

    // Try JSON first
    if let Ok(parsed) = serde_json::from_str::<Vec<Value>>(output) {
        return parsed
            .iter()
            .filter_map(|item| {
                let slug = item["slug"]
                    .as_str()
                    .or_else(|| item["name"].as_str())?
                    .to_string();
                Some(ClawHubSkill {
                    name: item["name"]
                        .as_str()
                        .unwrap_or(&slug)
                        .to_string(),
                    slug: slug.clone(),
                    description: item["description"].as_str().unwrap_or("").to_string(),
                    author: item["author"].as_str().unwrap_or("ClawHub").to_string(),
                    version: item["version"].as_str().unwrap_or("1.0.0").to_string(),
                })
            })
            .collect();
    }

    // Parse line-by-line text output
    let slug_re = regex::Regex::new(r"^[a-z0-9][a-z0-9-]*$").unwrap();
    let mut skills = vec![];

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with('-') {
            continue;
        }

        // Split on 2+ whitespace
        let parts: Vec<&str> = trimmed.split("  ").filter(|s| !s.is_empty()).map(|s| s.trim()).collect();
        if parts.len() < 2 {
            continue;
        }

        let first = parts[0];
        // Try "slug vX.Y.Z" format
        let slug_version_re = regex::Regex::new(r"^([a-z0-9][a-z0-9-]*)\s+v(\d+\.\d+\.\d+)$").unwrap();
        let (slug, version) = if let Some(caps) = slug_version_re.captures(first) {
            (caps[1].to_string(), caps[2].to_string())
        } else if slug_re.is_match(first) {
            let ver = parts.get(1)
                .and_then(|p| p.strip_prefix('v'))
                .and_then(|v| if v.contains('.') { Some(v.to_string()) } else { None })
                .unwrap_or_else(|| "1.0.0".to_string());
            (first.to_string(), ver)
        } else {
            continue;
        };

        // Collect description from remaining parts (skip version/time fields)
        let desc_parts: Vec<&str> = parts[1..].iter()
            .filter(|p| {
                let p = p.trim();
                if p.starts_with('v') && p[1..].contains('.') { return false; }
                if p.ends_with(" ago") || p == "just now" { return false; }
                true
            })
            .copied()
            .collect();

        skills.push(ClawHubSkill {
            name: slug.clone(),
            slug,
            description: desc_parts.join(" "),
            author: "ClawHub".to_string(),
            version,
        });
    }

    skills
}

/// Install a ClawHub skill into the user's local workspace.
#[tauri::command]
async fn clawhub_install(slug: String, user_id: String) -> Result<(), String> {
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let workspace = home
        .join(".agentos")
        .join("openclaw")
        .join("users")
        .join(&user_id)
        .join("workspace");
    let path = extended_path();

    let output = std::process::Command::new("clawhub")
        .args([
            "install",
            &slug,
            "--workdir",
            workspace.to_str().ok_or("Invalid workspace path")?,
            "--force",
            "--no-input",
        ])
        .env("PATH", &path)
        .output()
        .map_err(|e| format!("Failed to run clawhub install: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("clawhub install failed: {}", stderr));
    }

    println!("[Tauri] clawhub_install: installed '{}' for user '{}'", slug, user_id);
    Ok(())
}

/// Uninstall a ClawHub skill by removing its directory from the workspace.
#[tauri::command]
async fn clawhub_uninstall(slug: String, user_id: String) -> Result<(), String> {
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let skill_dir = home
        .join(".agentos")
        .join("openclaw")
        .join("users")
        .join(&user_id)
        .join("workspace")
        .join("skills")
        .join(&slug);

    if skill_dir.exists() {
        std::fs::remove_dir_all(&skill_dir)
            .map_err(|e| format!("Failed to remove skill directory: {}", e))?;
        println!("[Tauri] clawhub_uninstall: removed '{}' for user '{}'", slug, user_id);
    } else {
        println!("[Tauri] clawhub_uninstall: skill dir not found for '{}'", slug);
    }

    Ok(())
}

/// Import a skill from a local directory into the workspace.
/// If source_path contains SKILL.md, copy the whole directory.
/// If source_path IS a SKILL.md file, use its parent directory name.
#[tauri::command]
async fn import_skill_local(source_path: String, user_id: String) -> Result<String, String> {
    let source = std::path::PathBuf::from(&source_path);
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let skills_dir = home
        .join(".agentos")
        .join("openclaw")
        .join("users")
        .join(&user_id)
        .join("workspace")
        .join("skills");

    std::fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    let (src_dir, skill_name) = if source.is_dir() {
        // Directory containing SKILL.md
        let name = source
            .file_name()
            .ok_or("Invalid directory name")?
            .to_string_lossy()
            .to_string();
        (source.clone(), name)
    } else if source.is_file() {
        // Single SKILL.md file — use parent dir name
        let parent = source.parent().ok_or("Cannot find parent directory")?;
        let name = parent
            .file_name()
            .ok_or("Invalid parent directory name")?
            .to_string_lossy()
            .to_string();
        (parent.to_path_buf(), name)
    } else {
        return Err("Source path does not exist".to_string());
    };

    let dest = skills_dir.join(&skill_name);
    if dest.exists() {
        std::fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to clean existing skill dir: {}", e))?;
    }

    // Recursive copy
    copy_dir_recursive(&src_dir, &dest)
        .map_err(|e| format!("Failed to copy skill: {}", e))?;

    println!("[Tauri] import_skill_local: imported '{}' for user '{}'", skill_name, user_id);
    Ok(skill_name)
}

/// Recursively copy a directory.
fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
fn frontend_log(msg: String) {
    println!("[Frontend] {}", msg);
}

// ── MCP Bridge commands ──

/// Start the local MCP bridge process. Reads ~/.agentos/mcp-config.json,
/// spawns node mcp-bridge.mjs, discovers tools, and returns them.
#[tauri::command]
async fn start_mcp_bridge(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Value>, String> {
    let mut pm = state.process_manager.lock().await;

    // Kill existing bridge if running
    let _ = pm.kill("mcp-bridge");

    // Find the mcp-bridge.mjs script relative to the app binary
    // In dev: src-tauri/scripts/mcp-bridge.mjs
    // In prod: bundled alongside the binary
    let script_path = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Cannot find exe parent dir")?
        .join("scripts")
        .join("mcp-bridge.mjs");

    // Fallback: check in the source tree (for dev mode)
    let script_path = if script_path.exists() {
        script_path
    } else {
        let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("scripts")
            .join("mcp-bridge.mjs");
        if dev_path.exists() {
            dev_path
        } else {
            return Err("MCP bridge script not found".to_string());
        }
    };

    // Check if MCP config exists
    let config_path = dirs_next::home_dir()
        .unwrap_or_default()
        .join(".agentos")
        .join("mcp-config.json");

    if !config_path.exists() {
        return Ok(vec![]); // No MCP config, return empty tools
    }

    // Spawn the bridge process
    let mut envs = HashMap::new();
    envs.insert("PATH".to_string(), extended_path());
    let _pid = pm.spawn_with_env(
        "mcp-bridge",
        "node",
        &[
            script_path.to_string_lossy().to_string(),
            config_path.to_string_lossy().to_string(),
        ],
        Some(&envs),
    ).map_err(|e| format!("Failed to start MCP bridge: {}", e))?;

    // Wait for the bridge to print its port (poll logs)
    let mut port: u16 = 0;
    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if let Ok(logs) = pm.get_logs("mcp-bridge", 20) {
            for line in &logs {
                if let Some(p) = line.strip_prefix("MCP_BRIDGE_PORT=") {
                    if let Ok(parsed) = p.trim().parse::<u16>() {
                        port = parsed;
                        break;
                    }
                }
            }
        }
        if port > 0 { break; }
    }

    if port == 0 {
        let _ = pm.kill("mcp-bridge");
        return Err("MCP bridge failed to start (no port detected)".to_string());
    }

    // Store port for skill_executor to use
    skill_executor::set_mcp_bridge_port(port);
    println!("[Tauri] MCP bridge started on port {}", port);

    // Discover tools via HTTP
    let tools = discover_mcp_tools_http(port).await?;
    Ok(tools)
}

/// Stop the MCP bridge process.
#[tauri::command]
async fn stop_mcp_bridge(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    skill_executor::set_mcp_bridge_port(0);
    let mut pm = state.process_manager.lock().await;
    let _ = pm.kill("mcp-bridge");
    Ok(())
}

/// Fetch discovered tools from the running MCP bridge.
async fn discover_mcp_tools_http(port: u16) -> Result<Vec<Value>, String> {
    let url = format!("http://127.0.0.1:{}/tools", port);
    let client = reqwest::Client::new();
    let resp = client.get(&url)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch MCP tools: {}", e))?;

    let body: Value = resp.json().await.map_err(|e| format!("Invalid MCP tools response: {}", e))?;
    let tools = body["tools"].as_array().cloned().unwrap_or_default();
    println!("[Tauri] Discovered {} MCP tools", tools.len());
    Ok(tools)
}

/// Generic HTTP proxy — bypasses webview fetch restrictions.
#[tauri::command]
async fn http_fetch(
    url: String,
    method: String,
    body: Option<String>,
    auth_token: Option<String>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };
    req = req.header("Content-Type", "application/json");
    if let Some(token) = auth_token {
        req = req.header("Authorization", format!("Bearer {}", token));
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

// ── Shared types for Tauri command arguments ──

#[derive(Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// ── App setup ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Build tray menu
            let show = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let hide = MenuItemBuilder::with_id("hide", "Hide Window").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show)
                .item(&hide)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::new()
                .tooltip("AgentOS Desktop")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.hide();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Initialize state
            app.manage(AppState {
                ws_client: Arc::new(Mutex::new(WsClient::new())),
                process_manager: Arc::new(Mutex::new(ProcessManager::new())),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_server,
            disconnect_server,
            send_message,
            stop_generation,
            get_connection_status,
            launch_agent,
            stop_agent,
            list_agents,
            get_agent_logs,
            frontend_log,
            http_fetch,
            request_skill_list,
            toggle_skill,
            install_skill,
            uninstall_skill,
            request_skill_library,
            request_skill_config,
            set_skill_config,
            start_mcp_bridge,
            stop_mcp_bridge,
            check_openclaw_prerequisites,
            install_openclaw,
            start_local_openclaw,
            stop_local_openclaw,
            get_local_openclaw_status,
            update_local_openclaw_config,
            check_local_openclaw_installed,
            upgrade_openclaw,
            check_copaw_prerequisites,
            install_copaw,
            start_local_copaw,
            stop_local_copaw,
            get_local_copaw_status,
            check_local_copaw_installed,
            clawhub_search,
            clawhub_install,
            clawhub_uninstall,
            import_skill_local,
        ])
        .on_window_event(|window, event| {
            // Minimize to tray instead of closing
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
