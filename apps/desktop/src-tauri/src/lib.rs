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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Host::default())
        .invoke_handler(tauri::generate_handler![mathos_exec, mathos_secret_set, host_info, host_restart])
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
