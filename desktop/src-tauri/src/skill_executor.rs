//! Local Skill Executor — Whitelist-based command execution on desktop.
//!
//! Only pre-defined function names are allowed:
//! - `run_shell`: Execute a shell command
//! - `read_file`: Read a file's contents
//! - `write_file`: Write content to a file
//! - `list_directory`: List directory contents
//! - `call_mcp_tool`: Route a tool call to a local MCP bridge

use serde_json::{json, Value};
use std::path::Path;

/// Port of the running MCP bridge HTTP server (set after bridge starts).
static MCP_BRIDGE_PORT: std::sync::atomic::AtomicU16 = std::sync::atomic::AtomicU16::new(0);

/// Set the MCP bridge port (called from lib.rs after bridge starts).
pub fn set_mcp_bridge_port(port: u16) {
    MCP_BRIDGE_PORT.store(port, std::sync::atomic::Ordering::Relaxed);
}

/// Get the MCP bridge port (0 = not running).
pub fn get_mcp_bridge_port() -> u16 {
    MCP_BRIDGE_PORT.load(std::sync::atomic::Ordering::Relaxed)
}

/// Execute a local command by function name (whitelist approach).
pub async fn execute_local_command(
    function_name: &str,
    args: &Value,
) -> Result<Value, String> {
    match function_name {
        "run_shell" => run_shell(args).await,
        "read_file" => read_file(args),
        "write_file" => write_file(args),
        "list_directory" => list_directory(args),
        "call_mcp_tool" => call_mcp_tool(args).await,
        _ => Err(format!("Unknown function: {}", function_name)),
    }
}

/// Execute a shell command and return stdout/stderr.
async fn run_shell(args: &Value) -> Result<Value, String> {
    let command = args["command"]
        .as_str()
        .ok_or("Missing 'command' argument")?;

    let timeout_secs = args["timeout"].as_u64().unwrap_or(30);

    println!("[SkillExecutor] run_shell: {}", command);

    let child = tokio::process::Command::new(if cfg!(target_os = "windows") { "cmd" } else { "sh" })
        .args(if cfg!(target_os = "windows") { vec!["/C", command] } else { vec!["-c", command] })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| format!("Command timed out after {}s", timeout_secs))?
    .map_err(|e| format!("Command failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&result.stdout).to_string();
    let stderr = String::from_utf8_lossy(&result.stderr).to_string();

    Ok(json!({
        "exitCode": result.status.code().unwrap_or(-1),
        "stdout": stdout,
        "stderr": stderr,
    }))
}

/// Read a file's contents.
fn read_file(args: &Value) -> Result<Value, String> {
    let path = args["path"]
        .as_str()
        .ok_or("Missing 'path' argument")?;

    println!("[SkillExecutor] read_file: {}", path);

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    Ok(json!({
        "path": path,
        "content": content,
        "size": content.len(),
    }))
}

/// Write content to a file.
fn write_file(args: &Value) -> Result<Value, String> {
    let path = args["path"]
        .as_str()
        .ok_or("Missing 'path' argument")?;
    let content = args["content"]
        .as_str()
        .ok_or("Missing 'content' argument")?;

    println!("[SkillExecutor] write_file: {}", path);

    std::fs::write(path, content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(json!({
        "path": path,
        "bytesWritten": content.len(),
    }))
}

/// List directory contents.
fn list_directory(args: &Value) -> Result<Value, String> {
    let path = args["path"]
        .as_str()
        .ok_or("Missing 'path' argument")?;

    println!("[SkillExecutor] list_directory: {}", path);

    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let entries: Vec<Value> = std::fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let metadata = entry.metadata().ok()?;
            Some(json!({
                "name": entry.file_name().to_string_lossy(),
                "isDir": metadata.is_dir(),
                "size": metadata.len(),
            }))
        })
        .collect();

    Ok(json!({
        "path": path,
        "entries": entries,
        "count": entries.len(),
    }))
}

/// Route a tool call to the local MCP bridge HTTP server.
async fn call_mcp_tool(args: &Value) -> Result<Value, String> {
    let port = get_mcp_bridge_port();
    if port == 0 {
        return Err("MCP bridge is not running".to_string());
    }

    let server = args["server"]
        .as_str()
        .ok_or("Missing 'server' argument")?;
    let tool = args["tool"]
        .as_str()
        .ok_or("Missing 'tool' argument")?;
    let arguments = &args["arguments"];

    println!("[SkillExecutor] call_mcp_tool: {}/{}", server, tool);

    let url = format!("http://127.0.0.1:{}/call", port);
    let body = json!({
        "server": server,
        "tool": tool,
        "arguments": arguments,
    });

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .json(&body)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("MCP bridge request failed: {}", e))?;

    let text = resp.text().await.map_err(|e| format!("Failed to read MCP response: {}", e))?;
    let parsed: Value = serde_json::from_str(&text).unwrap_or(json!({"result": text}));

    Ok(parsed)
}
