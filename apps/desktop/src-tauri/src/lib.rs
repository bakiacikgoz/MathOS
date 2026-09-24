mod host;

use host::{ExecResult, Host, HostInfo};
use std::time::Duration;
use tauri::{Manager, RunEvent, State};

#[tauri::command]
async fn mathos_exec(host: State<'_, Host>, cwd: String, args: Vec<String>) -> Result<ExecResult, String> {
    host.exec(cwd, args).await
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
        .manage(Host::default())
        .invoke_handler(tauri::generate_handler![mathos_exec, host_info, host_restart])
        .setup(|app| {
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
