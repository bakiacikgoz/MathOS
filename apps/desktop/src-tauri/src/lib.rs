mod host;

use host::{ExecResult, Host, HostInfo};
use std::time::Duration;
use tauri::{Manager, RunEvent, State};

#[tauri::command]
async fn mathos_exec(host: State<'_, Host>, cwd: String, args: Vec<String>) -> Result<ExecResult, String> {
    host.exec(cwd, args).await
}

#[tauri::command]
async fn mathos_secret_set(host: State<'_, Host>, secret_ref: String, value: String) -> Result<ExecResult, String> {
    host.secret_set(secret_ref, value).await
}

#[tauri::command]
async fn host_info(host: State<'_, Host>) -> Result<HostInfo, String> {
    Ok(host.info().await)
}

#[tauri::command]
async fn host_restart(host: State<'_, Host>) -> Result<(), String> {
    host.restart().await;
    Ok(())
}

/// Runs a MathOS setup that the host downloaded and checked against the release's SHA256SUMS, then closes the app.
#[tauri::command]
async fn install_update(app: tauri::AppHandle, host: State<'_, Host>, installer: String) -> Result<(), String> {
    run_installer(&app, &host, &installer).await
}

/// `/P` installs without questions over the same per-user installation, `/UPDATE` leaves the user's shortcuts and
/// WebView2 alone, and `/R` opens the new version when the setup is done.
#[cfg(target_os = "windows")]
async fn run_installer(app: &tauri::AppHandle, host: &Host, installer: &str) -> Result<(), String> {
    let path = std::path::PathBuf::from(installer);
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or_default();
    // Only a setup the host saved in its own update folder is run, never an arbitrary program.
    let folder = std::fs::canonicalize(std::env::temp_dir().join("MathOS-update")).ok();
    let parent = path.parent().and_then(|value| std::fs::canonicalize(value).ok());
    if !name.starts_with("MathOS-") || !name.ends_with("-windows-x64-setup.exe") || folder.is_none() || parent != folder || !path.is_file() {
        return Err(format!("UPDATE_INSTALLER_INVALID: {installer}"));
    }
    // The host keeps files of the installation open; stop it so the setup can replace them.
    host.stop().await;
    std::process::Command::new(&path)
        .args(["/P", "/R", "/UPDATE"])
        .spawn()
        .map_err(|error| format!("UPDATE_INSTALLER_START_FAILED: {error}"))?;
    app.exit(0);
    Ok(())
}

#[cfg(not(target_os = "windows"))]
async fn run_installer(_app: &tauri::AppHandle, _host: &Host, _installer: &str) -> Result<(), String> {
    Err("UPDATE_DESKTOP_PLATFORM_UNSUPPORTED: in-app updates are for the Windows desktop app".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Host::default())
        .invoke_handler(tauri::generate_handler![mathos_exec, mathos_secret_set, host_info, host_restart, install_update])
        .setup(|app| {
            // Windows: the native title bar ignores the app theme, so the app draws its own
            // caption row (src/components/WindowControls.tsx). The shadow keeps resize edges.
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                window.set_decorations(false)?;
                window.set_shadow(true)?;
            }
            // Load the host while the welcome screen is shown: a cold start (and, on Windows,
            // the first antivirus scan of the sidecar) otherwise lands on the first click.
            let warm = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                warm.state::<Host>().warm().await;
            });
            // The window starts hidden so the first frame is already themed; the
            // frontend shows it after mount. This is the safety net if it cannot.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(3)).await;
                if let Some(window) = handle.get_webview_window("main") {
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building MathOS desktop");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            let host = handle.state::<Host>();
            tauri::async_runtime::block_on(host.restart());
        }
    });
}
