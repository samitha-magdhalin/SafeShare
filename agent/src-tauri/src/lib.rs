#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "windows")]
mod windows_clipboard;

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State,
};
use tauri_plugin_notification::NotificationExt;

struct ReviewMenu(Mutex<MenuItem<tauri::Wry>>);

#[tauri::command]
fn read_clipboard_image_png() -> Result<Option<Vec<u8>>, String> {
    #[cfg(target_os = "windows")]
    {
        windows_clipboard::read_png().map_err(|_| "CLIPBOARD_IMAGE_READ_FAILED".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(None)
    }
}

#[tauri::command]
fn write_clipboard_image_png(bytes: Vec<u8>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        windows_clipboard::write_png(&bytes).map_err(|_| "CLIPBOARD_IMAGE_WRITE_FAILED".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = bytes;
        Err("CLIPBOARD_IMAGE_WRITE_UNSUPPORTED".to_string())
    }
}

#[tauri::command]
fn show_attention_notification(app: tauri::AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("SafeShare")
        .body("Sensitive information detected\nReview this screenshot before sharing.")
        .show()
        .map_err(|_| "NOTIFICATION_FAILED".to_string())
}

#[tauri::command]
fn set_review_available(state: State<'_, ReviewMenu>, available: bool) -> Result<(), String> {
    state
        .0
        .lock()
        .map_err(|_| "REVIEW_MENU_FAILED".to_string())?
        .set_enabled(available)
        .map_err(|_| "REVIEW_MENU_FAILED".to_string())
}

#[tauri::command]
fn hide_review_window(app: tauri::AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "REVIEW_WINDOW_MISSING".to_string())?
        .hide()
        .map_err(|_| "REVIEW_WINDOW_FAILED".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            read_clipboard_image_png,
            write_clipboard_image_png,
            show_attention_notification,
            set_review_available,
            hide_review_window
        ])
        .setup(|app| {
            let status = MenuItem::with_id(app, "status", "Status: Running", false, None::<&str>)?;
            let review = MenuItem::with_id(
                app,
                "review",
                "Review latest screenshot",
                false,
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&status, &review, &quit])?;
            app.manage(ReviewMenu(Mutex::new(review)));

            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .expect("configured application icon")
                        .clone(),
                )
                .tooltip("SafeShare Agent")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "review" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = app.emit("open-review", ());
                        }
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
