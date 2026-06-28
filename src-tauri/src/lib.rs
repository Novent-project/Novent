use tauri::{Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;

struct BackendProcess(Mutex<Option<CommandChild>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(windows)]
            {
                let sidecar_command = app.shell()
                    .sidecar("backend")
                    .expect("Failed to create `backend` binary command.");

                let (_receiver, child) = sidecar_command
                    .spawn()
                    .expect("Failed to spawn backend sidecar");

                println!("Backend spawned. PID: {}", child.pid());
                app.manage(BackendProcess(Mutex::new(Some(child))));
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            #[cfg(windows)]
            {
                let state = app_handle.state::<BackendProcess>();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/T", "/PID", &child.pid().to_string()])
                        .status();
                }
            }
        }
    });
}