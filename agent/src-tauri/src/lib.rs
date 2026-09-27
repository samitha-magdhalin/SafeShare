#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(target_os = "windows")]
mod windows_clipboard;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_notification::NotificationExt;

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
fn show_attention_notification(app: tauri::AppHandle) -> Result<(), String> {
    app.notification()
        .builder()
        .title("SafeShare")
        .body("Sensitive information detected\nReview this screenshot before sharing.")
        .show()
        .map_err(|_| "NOTIFICATION_FAILED".to_string())
}
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            read_clipboard_image_png,
            show_attention_notification
        ])
        .setup(|app| {
            let status = MenuItem::with_id(app, "status", "Status: Running", false, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&status, &quit])?;
            TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .expect("configured application icon")
                        .clone(),
                )
                .tooltip("SafeShare Agent")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;
            #[cfg(target_os = "windows")]
            windows_clipboard::start_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("SafeShare Agent failed to start");
}
