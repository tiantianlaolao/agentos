use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex as StdMutex};

pub struct ProcessInfo {
    child: Child,
    status: ProcessStatus,
    logs: Arc<StdMutex<Vec<String>>>,
}

#[derive(Clone, Copy)]
#[allow(dead_code)]
pub enum ProcessStatus {
    Running,
    Stopped,
    Error,
}

impl std::fmt::Display for ProcessStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProcessStatus::Running => write!(f, "running"),
            ProcessStatus::Stopped => write!(f, "stopped"),
            ProcessStatus::Error => write!(f, "error"),
        }
    }
}

const MAX_LOG_LINES: usize = 1000;

pub struct ProcessManager {
    processes: HashMap<String, ProcessInfo>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: HashMap::new(),
        }
    }

    pub fn spawn(
        &mut self,
        name: &str,
        command: &str,
        args: &[String],
    ) -> Result<u32, Box<dyn std::error::Error + Send + Sync>> {
        self.spawn_with_env(name, command, args, None)
    }

    pub fn spawn_with_env(
        &mut self,
        name: &str,
        command: &str,
        args: &[String],
        envs: Option<&HashMap<String, String>>,
    ) -> Result<u32, Box<dyn std::error::Error + Send + Sync>> {
        // Kill existing process with the same name
        if self.processes.contains_key(name) {
            self.kill(name)?;
        }

        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(env_map) = envs {
            for (k, v) in env_map {
                cmd.env(k, v);
            }
        }
        let mut child = cmd.spawn()?;

        let pid = child.id();
        let logs = Arc::new(StdMutex::new(Vec::new()));

        // Capture stdout
        if let Some(stdout) = child.stdout.take() {
            let logs_clone = logs.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let mut log = logs_clone.lock().unwrap();
                        if log.len() >= MAX_LOG_LINES {
                            log.remove(0);
                        }
                        log.push(format!("[stdout] {}", line));
                    }
                }
            });
        }

        // Capture stderr
        if let Some(stderr) = child.stderr.take() {
            let logs_clone = logs.clone();
            std::thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        let mut log = logs_clone.lock().unwrap();
                        if log.len() >= MAX_LOG_LINES {
                            log.remove(0);
                        }
                        log.push(format!("[stderr] {}", line));
                    }
                }
            });
        }

        self.processes.insert(
            name.to_string(),
            ProcessInfo {
                child,
                status: ProcessStatus::Running,
                logs,
            },
        );

        Ok(pid)
    }

    pub fn is_running(&self, name: &str) -> bool {
        self.processes.contains_key(name)
    }

    pub fn kill(&mut self, name: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(mut info) = self.processes.remove(name) {
            let _ = info.child.kill();
            let _ = info.child.wait();
        }
        Ok(())
    }

    pub fn list(&self) -> Vec<(String, (ProcessStatus, Option<u32>))> {
        self.processes
            .iter()
            .map(|(name, info)| {
                (name.clone(), (info.status, Some(info.child.id())))
            })
            .collect()
    }

    pub fn get_logs(
        &self,
        name: &str,
        lines: usize,
    ) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
        let info = self
            .processes
            .get(name)
            .ok_or_else(|| format!("Agent '{}' not found", name))?;

        let log = info.logs.lock().unwrap();
        let start = if log.len() > lines {
            log.len() - lines
        } else {
            0
        };
        Ok(log[start..].to_vec())
    }
}

impl Drop for ProcessManager {
    fn drop(&mut self) {
        for (_, mut info) in self.processes.drain() {
            let _ = info.child.kill();
            let _ = info.child.wait();
        }
    }
}
