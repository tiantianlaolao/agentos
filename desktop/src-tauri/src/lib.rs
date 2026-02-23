mod ws_client;
mod process_manager;
mod skill_executor;

use serde::{Deserialize, Serialize};
use serde_json::Value;
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
            start_mcp_bridge,
            stop_mcp_bridge,
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
