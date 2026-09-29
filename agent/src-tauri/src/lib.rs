#[cfg(target_os = "windows")]
mod windows_clipboard;

use std::{fs, io::ErrorKind, path::PathBuf, sync::Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State,
};
use tauri_plugin_notification::NotificationExt;

struct AgentMenu {
    review: Mutex<MenuItem<tauri::Wry>>,
    workspace: Mutex<MenuItem<tauri::Wry>>,
    policy: Mutex<MenuItem<tauri::Wry>>,
}
const MAX_POLICY_CACHE_BYTES: usize = 64 * 1024;

fn policy_cache_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("team-policy-cache.json"))
        .map_err(|_| "POLICY_CACHE_PATH_FAILED".to_string())
}

#[tauri::command]
fn read_clipboard_image_png() -> Result<Option<Vec<u8>>, String> {
    #[cfg(target_os = "windows")]
    { windows_clipboard::read_png().map_err(|_| "CLIPBOARD_IMAGE_READ_FAILED".to_string()) }
    #[cfg(not(target_os = "windows"))]
    { Ok(None) }
}

#[tauri::command]
fn write_clipboard_image_png(bytes: Vec<u8>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { windows_clipboard::write_png(&bytes).map_err(|_| "CLIPBOARD_IMAGE_WRITE_FAILED".to_string()) }
    #[cfg(not(target_os = "windows"))]
    { let _ = bytes; Err("CLIPBOARD_IMAGE_WRITE_UNSUPPORTED".to_string()) }
}

#[tauri::command]
fn show_attention_notification(app: tauri::AppHandle) -> Result<(), String> {
    app.notification().builder().title("SafeShare Agent").body("Sensitive information detected\nReview this screenshot before sharing.").show().map_err(|_| "NOTIFICATION_FAILED".to_string())
}

#[tauri::command]
fn set_review_available(state: State<'_, AgentMenu>, available: bool) -> Result<(), String> {
    state.review.lock().map_err(|_| "REVIEW_MENU_FAILED".to_string())?.set_enabled(available).map_err(|_| "REVIEW_MENU_FAILED".to_string())
}

#[tauri::command]
fn hide_review_window(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main").ok_or_else(|| "REVIEW_WINDOW_MISSING".to_string())?.hide().map_err(|_| "REVIEW_WINDOW_FAILED".to_string())
}

#[tauri::command]
fn read_team_policy_cache(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match fs::read(policy_cache_path(&app)?) {
        Ok(bytes) if bytes.len() <= MAX_POLICY_CACHE_BYTES => String::from_utf8(bytes).map(Some).map_err(|_| "POLICY_CACHE_INVALID".to_string()),
        Ok(_) => Err("POLICY_CACHE_TOO_LARGE".to_string()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
        Err(_) => Err("POLICY_CACHE_READ_FAILED".to_string()),
    }
}

#[tauri::command]
fn write_team_policy_cache(app: tauri::AppHandle, serialized: String) -> Result<(), String> {
    if serialized.len() > MAX_POLICY_CACHE_BYTES { return Err("POLICY_CACHE_TOO_LARGE".to_string()); }
    let path = policy_cache_path(&app)?;
    let directory = path.parent().ok_or_else(|| "POLICY_CACHE_PATH_FAILED".to_string())?;
    fs::create_dir_all(directory).map_err(|_| "POLICY_CACHE_WRITE_FAILED".to_string())?;
    fs::write(path, serialized.as_bytes()).map_err(|_| "POLICY_CACHE_WRITE_FAILED".to_string())
}

fn safe_tray_text(value: &str) -> bool { !value.is_empty() && value.len() <= 100 && !value.contains(['\r', '\n']) }

#[tauri::command]
fn set_company_status(state: State<'_, AgentMenu>, workspace: Option<String>, policy_version: Option<u64>, offline: bool) -> Result<(), String> {
    let workspace_label = match workspace {
        Some(value) if safe_tray_text(&value) => format!("Workspace: {value}"),
        Some(_) => return Err("TRAY_STATUS_INVALID".to_string()),
        None => "Workspace: Sign in required".to_string(),
    };
    let policy_label = match policy_version {
        Some(version) if version > 0 => format!("Policy: v{version}{}", if offline { " (offline)" } else { "" }),
        Some(_) => return Err("TRAY_STATUS_INVALID".to_string()),
        None => "Policy: unavailable".to_string(),
    };
    state.workspace.lock().map_err(|_| "TRAY_STATUS_FAILED".to_string())?.set_text(workspace_label).map_err(|_| "TRAY_STATUS_FAILED".to_string())?;
    state.policy.lock().map_err(|_| "TRAY_STATUS_FAILED".to_string())?.set_text(policy_label).map_err(|_| "TRAY_STATUS_FAILED".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            read_clipboard_image_png, write_clipboard_image_png, show_attention_notification,
            set_review_available, hide_review_window, read_team_policy_cache,
            write_team_policy_cache, set_company_status
        ])
        .setup(|app| {
            let status = MenuItem::with_id(app, "status", "Status: Running", false, None::<&str>)?;
            let workspace = MenuItem::with_id(app, "workspace", "Workspace: Sign in required", false, None::<&str>)?;
            let policy = MenuItem::with_id(app, "policy", "Policy: unavailable", false, None::<&str>)?;
            let review = MenuItem::with_id(app, "review", "Review latest screenshot", false, None::<&str>)?;
            let open = MenuItem::with_id(app, "open", "Open SafeShare Agent", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&status, &workspace, &policy, &review, &open, &quit])?;
            app.manage(AgentMenu { review: Mutex::new(review), workspace: Mutex::new(workspace), policy: Mutex::new(policy) });

            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("configured application icon").clone())
                .tooltip("SafeShare Agent")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "review" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show(); let _ = window.set_focus(); let _ = app.emit("open-review", ());
                        }
                    }
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            #[cfg(target_os = "windows")]
            windows_clipboard::start_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("SafeShare Agent failed to start");
}