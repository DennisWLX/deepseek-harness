use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::Deserialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::async_runtime::spawn;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use url::Url;

const SIDECAR_NAME: &str = "dsh-desktop-runtime";
const MAIN_WINDOW: &str = "main";
const TOKEN_LENGTH_BYTES: usize = 32;
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Default)]
struct DesktopRuntime {
    child: Option<CommandChild>,
    monitor: Option<tauri::async_runtime::JoinHandle<()>>,
    shutdown_started: bool,
    log_path: Option<PathBuf>,
    allowed_origin: Option<String>,
}

#[derive(Default)]
struct DesktopState(Mutex<DesktopRuntime>);

#[derive(Deserialize)]
struct ControlEvent {
    #[serde(rename = "type")]
    kind: String,
    url: Option<String>,
    message: Option<String>,
}

fn token() -> String {
    let mut bytes = [0_u8; TOKEN_LENGTH_BYTES];
    rand::thread_rng().fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn safe_url(value: &str) -> Result<Url, Box<dyn std::error::Error>> {
    let url = Url::parse(value)?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") || url.port().is_none() {
        return Err("sidecar URL must use an explicit 127.0.0.1 HTTP port".into());
    }
    Ok(url)
}

fn append_log(path: &Path, line: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

fn workspace_dir(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = app
        .path()
        .home_dir()?
        .join("DeepSeek Harness Workspaces")
        .join("Default");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn log_path(app: &AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let dir = app.path().app_log_dir()?;
    fs::create_dir_all(&dir)?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    Ok(dir.join(format!("dsh-desktop-{stamp}.log")))
}

fn loader_script(token: &str, log_path: &Path) -> String {
    let token_json = serde_json::to_string(token).expect("token JSON cannot fail");
    let log_json =
        serde_json::to_string(&log_path.to_string_lossy()).expect("path JSON cannot fail");
    format!(
    "window.__DSH_DESKTOP_ACCESS_TOKEN__={token_json};window.__DSH_DESKTOP_LOADER__={{logPath:{log_json}}};"
  )
}

fn local_error_url(message: &str) -> String {
    let encoded = url::form_urlencoded::byte_serialize(message.as_bytes()).collect::<String>();
    format!("tauri://localhost/index.html?state=fatal&message={encoded}")
}

async fn request_shutdown(app: AppHandle) {
    let state = app.state::<DesktopState>();
    let mut runtime = state.0.lock().await;
    if runtime.shutdown_started {
        return;
    }
    runtime.shutdown_started = true;
    if let Some(child) = runtime.child.as_mut() {
        let _ = child.write(b"{\"type\":\"shutdown\"}\n");
    }
    let child = runtime.child.take();
    let monitor = runtime.monitor.take();
    drop(runtime);
    if let Some(child) = child {
        let _ = tokio::time::timeout(SHUTDOWN_TIMEOUT, async {
            loop {
                tokio::task::yield_now().await;
            }
        })
        .await;
        let _ = child.kill();
    }
    if let Some(monitor) = monitor {
        monitor.abort();
        let _ = monitor.await;
    }
    app.exit(0);
}

#[tauri::command]
async fn show_log_path(app: AppHandle, state: State<'_, DesktopState>) -> Result<String, String> {
    let path = {
        let runtime = state.0.lock().await;
        runtime.log_path.clone()
    };
    let path = path.ok_or("日志路径尚未准备好")?;
    app.opener()
        .open_path(path.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn is_external_url(url: &Url) -> bool {
    url.scheme() == "http" || url.scheme() == "https"
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![show_log_path])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let token = token();
            let workspace = workspace_dir(&app_handle)?;
            let log_path = log_path(&app_handle)?;
            {
                let state: State<'_, DesktopState> = app.state();
                let mut runtime = state.0.blocking_lock();
                runtime.log_path = Some(log_path.clone());
            }

            let allowed_origin = Arc::new(Mutex::new(None::<String>));
            let navigation_origin = allowed_origin.clone();
            let navigation_app = app_handle.clone();
            let window =
                WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
                    .title("DeepSeek Harness")
                    .inner_size(1200.0, 800.0)
                    .min_inner_size(900.0, 600.0)
                    .initialization_script(&loader_script(&token, &log_path))
                    .on_navigation(move |url| {
                        if url.scheme() == "tauri" {
                            return true;
                        }
                        let current = url.origin().ascii_serialization();
                        let allowed = navigation_origin.blocking_lock();
                        if allowed.as_deref() == Some(current.as_str()) {
                            return true;
                        }
                        if is_external_url(url) {
                            let _ = navigation_app.opener().open_url(url.as_str(), None::<&str>);
                        }
                        false
                    })
                    .build()?;

            let event_window = window.clone();
            event_window.clone().on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let app = event_window.app_handle().clone();
                    spawn(async move { request_shutdown(app).await });
                }
            });

            let (mut events, child) = app_handle
                .shell()
                .sidecar(SIDECAR_NAME)?
                .args(["--desktop-token", &token])
                .current_dir(workspace)
                .env("DSH_DESKTOP_ACCESS_TOKEN", token.clone())
                .spawn()?;
            let app_for_reader = app_handle.clone();
            let ready_log_path = log_path.clone();
            let monitor = spawn(async move {
                while let Some(event) = events.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let line = String::from_utf8_lossy(&bytes);
                            append_log(&ready_log_path, &line);
                            let Ok(event) = serde_json::from_str::<ControlEvent>(&line) else {
                                continue;
                            };
                            match event.kind.as_str() {
                                "ready" => {
                                    let Some(raw) = event.url else { continue };
                                    let Ok(url) = safe_url(&raw) else { continue };
                                    let origin = url.origin().ascii_serialization();
                                    *allowed_origin.lock().await = Some(origin);
                                    if let Some(window) =
                                        app_for_reader.get_webview_window(MAIN_WINDOW)
                                    {
                                        let _ = window.navigate(url);
                                    }
                                }
                                "fatal" => {
                                    let message = event
                                        .message
                                        .unwrap_or_else(|| "桌面运行时启动失败".into());
                                    if let Some(window) =
                                        app_for_reader.get_webview_window(MAIN_WINDOW)
                                    {
                                        let _ = window.navigate(
                                            Url::parse(&local_error_url(&message))
                                                .expect("local URL is valid"),
                                        );
                                    }
                                    return;
                                }
                                _ => {}
                            }
                        }
                        CommandEvent::Stderr(bytes) => {
                            append_log(&ready_log_path, &String::from_utf8_lossy(&bytes));
                        }
                        CommandEvent::Error(message) => append_log(&ready_log_path, &message),
                        CommandEvent::Terminated(_) => return,
                        _ => {}
                    }
                }
            });

            {
                let state: State<'_, DesktopState> = app.state();
                let mut runtime = state.0.blocking_lock();
                runtime.child = Some(child);
                runtime.monitor = Some(monitor);
                runtime.allowed_origin = None;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build DeepSeek Harness desktop app")
        .run(|_app, _event| {});
}
