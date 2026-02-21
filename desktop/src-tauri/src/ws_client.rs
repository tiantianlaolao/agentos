use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::ipc::Channel;
use tokio::sync::{Mutex, oneshot};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use crate::ChatMessage;

type WsSink = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    Message,
>;

/// Result of the initial connection handshake
#[derive(Debug, Clone, serde::Serialize)]
pub struct ConnectResult {
    pub session_id: String,
    pub device_id: String,
    pub skills: Vec<String>,
}

pub struct WsClient {
    sink: Option<Arc<Mutex<WsSink>>>,
    connected: bool,
    session_id: Option<String>,
    read_handle: Option<tokio::task::JoinHandle<()>>,
}

impl WsClient {
    pub fn new() -> Self {
        Self {
            sink: None,
            connected: false,
            session_id: None,
            read_handle: None,
        }
    }

    pub fn is_connected(&self) -> bool {
        self.connected
    }

    pub async fn connect(
        &mut self,
        url: &str,
        mode: &str,
        auth_token: Option<String>,
        api_key: Option<String>,
        model: Option<String>,
        copaw_url: Option<String>,
        copaw_token: Option<String>,
        openclaw_hosted: Option<bool>,
        channel: Channel<Value>,
    ) -> Result<ConnectResult, Box<dyn std::error::Error + Send + Sync>> {
        self.disconnect().await;

        println!("[WsClient] Connecting to: {}", url);
        let (ws_stream, _) = connect_async(url).await?;
        println!("[WsClient] WebSocket TCP connected");
        let (write, read) = ws_stream.split();

        let sink = Arc::new(Mutex::new(write));
        self.sink = Some(sink.clone());

        let device_id = format!("desktop-{}", uuid::Uuid::new_v4());
        let connect_msg = json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "type": "connect",
            "timestamp": chrono_timestamp(),
            "payload": {
                "mode": mode,
                "deviceId": device_id,
                "authToken": auth_token,
                "apiKey": api_key,
                "model": model,
                "copawUrl": copaw_url,
                "copawToken": copaw_token,
                "openclawHosted": openclaw_hosted,
            }
        });

        // Oneshot channel for the initial "connected" response
        let (tx, rx) = oneshot::channel::<Result<Value, String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));

        // Spawn read loop — uses IPC Channel instead of Tauri events
        let sink_clone = sink.clone();
        let tx_clone = tx.clone();
        let handle = tokio::spawn(async move {
            Self::read_loop(read, channel, sink_clone, tx_clone).await;
        });
        self.read_handle = Some(handle);

        // Send the CONNECT message
        {
            let mut s = sink.lock().await;
            s.send(Message::Text(connect_msg.to_string())).await?;
            println!("[WsClient] CONNECT message sent (mode: {})", mode);
        }

        // Wait for server response (15s timeout)
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(15),
            rx,
        ).await;

        match result {
            Ok(Ok(Ok(payload))) => {
                let session_id = payload["sessionId"].as_str().unwrap_or("").to_string();
                let skills: Vec<String> = payload["skills"]
                    .as_array()
                    .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                    .unwrap_or_default();

                self.connected = true;
                self.session_id = Some(session_id.clone());
                println!("[WsClient] Connected! sessionId={}, skills={:?}", session_id, skills);

                Ok(ConnectResult { session_id, device_id, skills })
            }
            Ok(Ok(Err(err_msg))) => {
                println!("[WsClient] Server rejected: {}", err_msg);
                self.disconnect().await;
                Err(err_msg.into())
            }
            Ok(Err(_)) => {
                println!("[WsClient] Connection channel dropped");
                self.disconnect().await;
                Err("Connection failed: server closed connection".into())
            }
            Err(_) => {
                println!("[WsClient] Connection timeout (15s)");
                self.disconnect().await;
                Err("Connection timeout: server did not respond within 15 seconds".into())
            }
        }
    }

    async fn read_loop(
        mut read: futures_util::stream::SplitStream<
            tokio_tungstenite::WebSocketStream<
                tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
            >,
        >,
        channel: Channel<Value>,
        sink: Arc<Mutex<WsSink>>,
        connect_tx: Arc<Mutex<Option<oneshot::Sender<Result<Value, String>>>>>,
    ) {
        println!("[WsClient] Read loop started");
        while let Some(msg) = read.next().await {
            match msg {
                Ok(Message::Text(text)) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                        let msg_type = parsed["type"].as_str().unwrap_or("");
                        match msg_type {
                            "connected" => {
                                println!("[WsClient] Server confirmed connection");
                                let mut guard = connect_tx.lock().await;
                                if let Some(tx) = guard.take() {
                                    let _ = tx.send(Ok(parsed["payload"].clone()));
                                }
                            }
                            "error" => {
                                let payload = &parsed["payload"];
                                let err = payload["message"].as_str().unwrap_or("Unknown error");
                                println!("[WsClient] Server error: {}", err);
                                // During handshake → oneshot; after → channel
                                let mut guard = connect_tx.lock().await;
                                if let Some(tx) = guard.take() {
                                    let _ = tx.send(Err(err.to_string()));
                                } else {
                                    let _ = channel.send(json!({"type": "error", "payload": payload}));
                                }
                            }
                            "chat.chunk" => {
                                let _ = channel.send(json!({"type": "chat.chunk", "payload": &parsed["payload"]}));
                            }
                            "chat.done" => {
                                let _ = channel.send(json!({"type": "chat.done", "payload": &parsed["payload"]}));
                            }
                            "skill.start" => {
                                let _ = channel.send(json!({"type": "skill.start", "payload": &parsed["payload"]}));
                            }
                            "skill.result" => {
                                let _ = channel.send(json!({"type": "skill.result", "payload": &parsed["payload"]}));
                            }
                            "push.message" => {
                                let _ = channel.send(json!({"type": "push.message", "payload": &parsed["payload"]}));
                            }
                            "skill.list.response" => {
                                let _ = channel.send(json!({"type": "skill.list.response", "payload": &parsed["payload"]}));
                            }
                            "ping" => {
                                let pong = json!({
                                    "id": uuid::Uuid::new_v4().to_string(),
                                    "type": "pong",
                                    "timestamp": chrono_timestamp()
                                });
                                if let Ok(mut s) = sink.try_lock() {
                                    let _ = s.send(Message::Text(pong.to_string())).await;
                                }
                            }
                            _ => {}
                        }
                    }
                }
                Ok(Message::Close(frame)) => {
                    println!("[WsClient] Close frame: {:?}", frame);
                    let _ = channel.send(json!({"type": "disconnected", "payload": {"reason": "server_close"}}));
                    return;
                }
                Err(e) => {
                    println!("[WsClient] Read error: {:?}", e);
                    let _ = channel.send(json!({"type": "disconnected", "payload": {"reason": format!("error: {}", e)}}));
                    return;
                }
                _ => {}
            }
        }
        println!("[WsClient] Stream ended");
        let _ = channel.send(json!({"type": "disconnected", "payload": {"reason": "stream_ended"}}));
    }

    pub async fn send_chat(
        &self,
        conversation_id: &str,
        content: &str,
        history: &[ChatMessage],
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let sink = self.sink.as_ref().ok_or("Not connected")?;

        let history_json: Vec<Value> = history
            .iter()
            .map(|m| json!({"role": m.role, "content": m.content}))
            .collect();

        let msg = json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "type": "chat.send",
            "timestamp": chrono_timestamp(),
            "payload": {
                "conversationId": conversation_id,
                "content": content,
                "history": history_json
            }
        });

        let mut s = sink.lock().await;
        s.send(Message::Text(msg.to_string())).await?;
        Ok(())
    }

    pub async fn stop_chat(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let sink = self.sink.as_ref().ok_or("Not connected")?;
        let msg = json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "type": "chat.stop",
            "timestamp": chrono_timestamp(),
            "payload": {}
        });
        let mut s = sink.lock().await;
        s.send(Message::Text(msg.to_string())).await?;
        Ok(())
    }

    pub async fn send_skill_list_request(&self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let sink = self.sink.as_ref().ok_or("Not connected")?;
        let msg = json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "type": "skill.list.request",
            "timestamp": chrono_timestamp(),
            "payload": {}
        });
        let mut s = sink.lock().await;
        s.send(Message::Text(msg.to_string())).await?;
        Ok(())
    }

    pub async fn send_skill_toggle(
        &self,
        name: &str,
        enabled: bool,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let sink = self.sink.as_ref().ok_or("Not connected")?;
        let msg = json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "type": "skill.toggle",
            "timestamp": chrono_timestamp(),
            "payload": {
                "skillName": name,
                "enabled": enabled
            }
        });
        let mut s = sink.lock().await;
        s.send(Message::Text(msg.to_string())).await?;
        Ok(())
    }

    pub async fn disconnect(&mut self) {
        println!("[WsClient] Disconnecting...");
        if let Some(handle) = self.read_handle.take() {
            handle.abort();
        }
        if let Some(sink) = self.sink.take() {
            if let Ok(mut s) = sink.try_lock() {
                let _ = s.close().await;
            }
        }
        self.connected = false;
        self.session_id = None;
    }
}

fn chrono_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
