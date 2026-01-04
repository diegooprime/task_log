use chrono::Local;
use dirs::home_dir;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
use cocoa::appkit::{NSApp, NSApplication, NSApplicationActivationPolicy};

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Note {
    pub text: String,
    #[serde(default)]
    pub completed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct Task {
    pub text: String,
    #[serde(default)]
    pub notes: Vec<Note>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct TaskState {
    pub current: Vec<Task>,
    pub shelf: Vec<Task>,
}

pub struct AppState {
    pub tasks: Mutex<TaskState>,
}

fn get_tasks_dir() -> PathBuf {
    home_dir().unwrap().join(".tasks")
}

fn get_state_file() -> PathBuf {
    get_tasks_dir().join("state.json")
}

fn get_done_file() -> PathBuf {
    get_tasks_dir().join("done.md")
}

fn ensure_tasks_dir() -> Result<(), String> {
    let dir = get_tasks_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn load_tasks() -> TaskState {
    let path = get_state_file();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(state) = serde_json::from_str(&content) {
                return state;
            }
        }
    }
    TaskState::default()
}

fn save_tasks(state: &TaskState) -> Result<(), String> {
    ensure_tasks_dir()?;
    let path = get_state_file();
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn append_done(task: &str) -> Result<(), String> {
    ensure_tasks_dir()?;
    let path = get_done_file();
    let date = Local::now().format("%Y-%m-%d").to_string();
    let line = format!("- {}: {}\n", date, task);

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;

    file.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_tasks(state: tauri::State<AppState>) -> TaskState {
    state.tasks.lock().unwrap().clone()
}

#[tauri::command]
fn save_state(new_state: TaskState, state: tauri::State<AppState>) -> Result<(), String> {
    let mut tasks = state.tasks.lock().unwrap();
    *tasks = new_state.clone();
    save_tasks(&tasks)
}

#[tauri::command]
fn complete_task(task: String, _state: tauri::State<AppState>) -> Result<(), String> {
    append_done(&task)?;
    Ok(())
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            // Position window at top right corner of the screen
            if let Ok(Some(monitor)) = window.primary_monitor() {
                let screen_size = monitor.size();
                let screen_position = monitor.position();
                if let Ok(window_size) = window.outer_size() {
                    let x = screen_position.x + (screen_size.width as i32) - (window_size.width as i32);
                    let y = screen_position.y;
                    let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                }
            }
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_state = load_tasks();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            tasks: Mutex::new(initial_state),
        })
        .invoke_handler(tauri::generate_handler![
            get_tasks,
            save_state,
            complete_task,
            hide_window,
        ])
        .setup(|app| {
            // Hide from dock on macOS
            #[cfg(target_os = "macos")]
            unsafe {
                let ns_app = NSApp();
                ns_app.setActivationPolicy_(NSApplicationActivationPolicy::NSApplicationActivationPolicyAccessory);
            }

            // Create tray menu
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_item])?;

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // Register global shortcut: Hyper + = (Cmd+Ctrl+Alt+Shift + =)
            let shortcut = Shortcut::new(
                Some(Modifiers::SUPER | Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT),
                Code::Equal,
            );

            let app_handle = app.handle().clone();
            app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                // Only toggle on key press, not release
                if event.state == ShortcutState::Pressed {
                    toggle_window(&app_handle);
                }
            })?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
