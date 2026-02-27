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
    openclaw_hosted: Option<bool>,
    copaw_hosted: Option<bool>,
    on_event: Channel<Value>,
) -> Result<ConnectResult, String> {
    println!("[Tauri] connect_server called (mode: {})", mode);
    let mut client = state.ws_client.lock().await;
    let result = client
        .connect(&url, &mode, auth_token, api_key, model, copaw_url, copaw_token, openclaw_hosted, copaw_hosted, on_event)
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

#[tauri::command]
async fn check_openclaw_prerequisites() -> Result<PrerequisiteStatus, String> {
    let node_output = std::process::Command::new("node")
        .arg("--version")
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
        .output();
    let npm_installed = npm_output.map(|o| o.status.success()).unwrap_or(false);

    let oc_output = std::process::Command::new("openclaw")
        .arg("--version")
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
) -> Result<InstallResult, String> {
    let port = port.unwrap_or(18789);
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = home.join(".agentos").join("openclaw");

    // Step 1: npm install -g openclaw (skip if already installed)
    let oc_check = std::process::Command::new("openclaw")
        .arg("--version")
        .output();
    let already_installed = oc_check.map(|o| o.status.success()).unwrap_or(false);

    if !already_installed {
        let mut npm_args = vec!["install".to_string(), "-g".to_string(), "openclaw".to_string()];
        if let Some(ref reg) = registry {
            npm_args.push(format!("--registry={}", reg));
        }
        let npm_result = std::process::Command::new("npm")
            .args(&npm_args)
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
    let base_url = match provider.as_str() {
        "deepseek" => "https://api.deepseek.com/v1",
        "openai" => "https://api.openai.com/v1",
        "anthropic" => "https://api.anthropic.com",
        "moonshot" => "https://api.moonshot.cn/v1",
        _ => "https://api.deepseek.com/v1",
    };
    let api_type = if provider == "anthropic" { "anthropic" } else { "openai-completions" };
    let model_id = if model.is_empty() {
        match provider.as_str() {
            "deepseek" => "deepseek-chat",
            "openai" => "gpt-4o",
            "anthropic" => "claude-sonnet-4-20250514",
            "moonshot" => "moonshot-v1-auto",
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
                    "baseUrl": base_url,
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
) -> Result<String, String> {
    let port = port.unwrap_or(18789);
    let mut pm = state.process_manager.lock().await;

    if pm.is_running(OPENCLAW_PROCESS_NAME) {
        return Ok("already_running".to_string());
    }

    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = home.join(".agentos").join("openclaw");
    let config_path = config_dir.join("openclaw.json");
    let state_dir = config_dir.join("state");

    if !config_path.exists() {
        return Err("OpenClaw not installed. Run install first.".to_string());
    }

    let mut envs = HashMap::new();
    envs.insert("OPENCLAW_CONFIG_PATH".to_string(), config_path.to_string_lossy().to_string());
    envs.insert("OPENCLAW_STATE_DIR".to_string(), state_dir.to_string_lossy().to_string());

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
    let mut pm = state.process_manager.lock().await;
    pm.kill(OPENCLAW_PROCESS_NAME).map_err(|e| e.to_string())
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
    let running = pm.is_running(OPENCLAW_PROCESS_NAME);
    let pid = if running {
        pm.list().into_iter().find(|(n, _)| n == OPENCLAW_PROCESS_NAME).and_then(|(_, info)| info.1)
    } else {
        None
    };

    let oc_output = std::process::Command::new("openclaw")
        .arg("--version")
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
) -> Result<(), String> {
    let home = dirs_next::home_dir().ok_or("Cannot find home directory")?;
    let config_dir = home.join(".agentos").join("openclaw");
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
    let base_url = match provider.as_str() {
        "deepseek" => "https://api.deepseek.com/v1",
        "openai" => "https://api.openai.com/v1",
        "anthropic" => "https://api.anthropic.com",
        "moonshot" => "https://api.moonshot.cn/v1",
        _ => "https://api.deepseek.com/v1",
    };
    let api_type = if provider == "anthropic" { "anthropic" } else { "openai-completions" };
    let model_id = if model.is_empty() {
        match provider.as_str() {
            "deepseek" => "deepseek-chat",
            "openai" => "gpt-4o",
            "anthropic" => "claude-sonnet-4-20250514",
            "moonshot" => "moonshot-v1-auto",
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
            "baseUrl": base_url,
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
async fn upgrade_openclaw(registry: Option<String>) -> Result<String, String> {
    let mut args = vec!["update".to_string(), "-g".to_string(), "openclaw".to_string()];
    if let Some(ref reg) = registry {
        args.push(format!("--registry={}", reg));
    }
    let output = std::process::Command::new("npm")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run npm: {}", e))?;

    if output.status.success() {
        // Get new version
        let ver_output = std::process::Command::new("openclaw")
            .arg("--version")
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
    let _pid = pm.spawn(
        "mcp-bridge",
        "node",
        &[
            script_path.to_string_lossy().to_string(),
            config_path.to_string_lossy().to_string(),
        ],
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
            upgrade_openclaw,
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
