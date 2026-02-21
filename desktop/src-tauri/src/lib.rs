mod ws_client;
mod process_manager;

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
    on_event: Channel<Value>,
) -> Result<ConnectResult, String> {
    println!("[Tauri] connect_server called (mode: {})", mode);
    let mut client = state.ws_client.lock().await;
    let result = client
        .connect(&url, &mode, auth_token, api_key, model, copaw_url, copaw_token, openclaw_hosted, on_event)
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
fn frontend_log(msg: String) {
    println!("[Frontend] {}", msg);
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
