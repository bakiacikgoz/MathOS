//! Supervises the long-lived MathOS host process (`apps/desktop/host/host.ts`).
//!
//! The host speaks newline-delimited JSON on stdio. Requests carry an id, the
//! workspace directory and CLI arguments; responses carry the exit code and the
//! captured output. The process is started lazily, restarted if it dies, and
//! killed together with the app.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};

const PROTOCOL: &str = "mathos.desktop-host.v1";
/// Research runs can legitimately take a long time; this only guards against a wedged host.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
    pub ms: u64,
}

#[derive(Deserialize)]
struct HostLine {
    protocol: Option<String>,
    id: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
    code: Option<i32>,
    stdout: Option<String>,
    stderr: Option<String>,
    ms: Option<u64>,
    version: Option<String>,
}

type Pending = Arc<std::sync::Mutex<HashMap<String, oneshot::Sender<ExecResult>>>>;

struct Running {
    child: Child,
    stdin: ChildStdin,
    pending: Pending,
}

#[derive(Default)]
pub struct Host {
    running: Mutex<Option<Running>>,
    next_id: AtomicU64,
    version: Arc<std::sync::Mutex<Option<String>>>,
}

#[derive(Serialize)]
pub struct HostInfo {
    pub running: bool,
    pub version: Option<String>,
    pub source: String,
}

impl Host {
    pub async fn exec(&self, cwd: String, args: Vec<String>) -> Result<ExecResult, String> {
        self.send(serde_json::json!({ "cwd": cwd, "args": args })).await
    }

    /// Stores a provider key in the OS secret store. The value is written only to the host's
    /// stdin; the host never echoes it and it never appears in a command line.
    pub async fn secret_set(&self, secret_ref: String, value: String) -> Result<ExecResult, String> {
        self.send(serde_json::json!({ "op": "secret-set", "ref": secret_ref, "value": value })).await
    }

    async fn send(&self, mut message: serde_json::Value) -> Result<ExecResult, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed).to_string();
        message["id"] = serde_json::Value::String(id.clone());
        let line = serde_json::to_string(&message).map_err(|e| e.to_string())?;
        let (tx, rx) = oneshot::channel();
        {
            let mut guard = self.running.lock().await;
            let alive = match guard.as_mut() {
                Some(running) => matches!(running.child.try_wait(), Ok(None)),
                None => false,
            };
            if !alive {
                *guard = Some(self.spawn()?);
            }
            let running = guard.as_mut().expect("host running");
            running.pending.lock().unwrap().insert(id.clone(), tx);
            let write = async {
                running.stdin.write_all(line.as_bytes()).await?;
                running.stdin.write_all(b"\n").await?;
                running.stdin.flush().await
            };
            if let Err(error) = write.await {
                running.pending.lock().unwrap().remove(&id);
                *guard = None;
                return Err(format!("DESKTOP_HOST_UNAVAILABLE: {error}"));
            }
        }
        match tokio::time::timeout(REQUEST_TIMEOUT, rx).await {
            Ok(Ok(result)) => Ok(result),
            Ok(Err(_)) => Err("DESKTOP_HOST_EXITED: the MathOS host stopped while handling the request".into()),
            Err(_) => Err("DESKTOP_HOST_TIMEOUT: the MathOS host did not answer in time".into()),
        }
    }

    /// Starts the host ahead of the first request, so opening a workspace does not wait for it to load.
    pub async fn warm(&self) {
        let mut guard = self.running.lock().await;
        let alive = match guard.as_mut() {
            Some(running) => matches!(running.child.try_wait(), Ok(None)),
            None => false,
        };
        if !alive {
            match self.spawn() {
                Ok(running) => *guard = Some(running),
                Err(error) => eprintln!("[mathos-host] {error}"),
            }
        }
    }

    pub async fn info(&self) -> HostInfo {
        let mut guard = self.running.lock().await;
        let running = match guard.as_mut() {
            Some(running) => matches!(running.child.try_wait(), Ok(None)),
            None => false,
        };
        HostInfo {
            running,
            version: self.version.lock().unwrap().clone(),
            source: host_command().map(|(_, source)| source).unwrap_or_else(|e| e),
        }
    }

    pub async fn restart(&self) {
        if let Some(mut running) = self.running.lock().await.take() {
            let _ = running.child.start_kill();
        }
    }

    fn spawn(&self) -> Result<Running, String> {
        let (mut command, _) = host_command()?;
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        let mut child = command
            .spawn()
            .map_err(|e| format!("DESKTOP_HOST_SPAWN_FAILED: {e}"))?;
        let stdin = child.stdin.take().ok_or("DESKTOP_HOST_SPAWN_FAILED: stdin")?;
        let stdout = child.stdout.take().ok_or("DESKTOP_HOST_SPAWN_FAILED: stdout")?;
        let stderr = child.stderr.take().ok_or("DESKTOP_HOST_SPAWN_FAILED: stderr")?;
        let pending: Pending = Arc::default();

        let reader_pending = pending.clone();
        let version = self.version.clone();
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(row) = serde_json::from_str::<HostLine>(&line) else { continue };
                if row.protocol.as_deref() != Some(PROTOCOL) {
                    continue;
                }
                if row.kind.as_deref() == Some("ready") {
                    *version.lock().unwrap() = row.version;
                    continue;
                }
                let Some(id) = row.id else { continue };
                if let Some(tx) = reader_pending.lock().unwrap().remove(&id) {
                    let _ = tx.send(ExecResult {
                        code: row.code.unwrap_or(1),
                        stdout: row.stdout.unwrap_or_default(),
                        stderr: row.stderr.unwrap_or_default(),
                        ms: row.ms.unwrap_or(0),
                    });
                }
            }
            // Host exited: dropping the senders wakes every waiting request with an error.
            reader_pending.lock().unwrap().clear();
        });
        tauri::async_runtime::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[mathos-host] {line}");
            }
        });
        Ok(Running { child, stdin, pending })
    }
}

/// Resolution order: explicit override, bundled sidecar, then (debug builds only) the repo sources via Bun.
fn host_command() -> Result<(Command, String), String> {
    if let Ok(path) = std::env::var("MATHOS_DESKTOP_HOST") {
        if !path.is_empty() {
            return Ok((Command::new(&path), format!("env:{path}")));
        }
    }
    if let Some(sidecar) = sidecar_path().filter(|path| path.is_file()) {
        let label = format!("sidecar:{}", sidecar.display());
        return Ok((Command::new(sidecar), label));
    }
    #[cfg(debug_assertions)]
    {
        let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
        let script = repo.join("apps/desktop/host/host.ts");
        if script.is_file() {
            let bun = std::env::var("MATHOS_BUN").unwrap_or_else(|_| "bun".into());
            let mut command = Command::new(&bun);
            // Bun reads the repo bunfig.toml (Solid JSX preload) from the working directory.
            command.arg(&script).current_dir(&repo);
            return Ok((command, format!("dev:{bun} {}", script.display())));
        }
    }
    Err("DESKTOP_HOST_NOT_FOUND: set MATHOS_DESKTOP_HOST or reinstall MathOS".into())
}

fn sidecar_path() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.parent()?.join(format!("mathos-host{}", std::env::consts::EXE_SUFFIX)))
}
