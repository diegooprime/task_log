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
use objc2::MainThreadMarker;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy, NSEvent, NSScreen};

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

fn get_tasks_dir() -> Result<PathBuf, String> {
    home_dir()
        .map(|h| h.join(".tasks"))
        .ok_or_else(|| "Could not determine home directory".to_string())
}

fn get_state_file() -> Result<PathBuf, String> {
    Ok(get_tasks_dir()?.join("state.json"))
}

fn get_done_file() -> Result<PathBuf, String> {
    Ok(get_tasks_dir()?.join("done.md"))
}

fn ensure_tasks_dir() -> Result<(), String> {
    let dir = get_tasks_dir()?;
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn load_tasks() -> TaskState {
    let path = match get_state_file() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Warning: {}", e);
            return TaskState::default();
        }
    };

    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str(&content) {
                    Ok(state) => return state,
                    Err(e) => {
                        eprintln!("Warning: Failed to parse state file: {}. Starting fresh.", e);
                        // Backup the corrupted file
                        let backup_path = path.with_extension("json.corrupted");
                        let _ = fs::rename(&path, &backup_path);
                    }
                }
            }
            Err(e) => eprintln!("Warning: Failed to read state file: {}", e),
        }
    }
    TaskState::default()
}

fn save_tasks(state: &TaskState) -> Result<(), String> {
    ensure_tasks_dir()?;
    let path = get_state_file()?;
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn append_done(task: &Task) -> Result<(), String> {
    ensure_tasks_dir()?;
    let path = get_done_file()?;
    let date = Local::now().format("%Y-%m-%d").to_string();

    let mut content = format!("- {}: {}\n", date, task.text);

    // Include notes if any exist
    for note in &task.notes {
        let status = if note.completed { "✓" } else { "○" };
        content.push_str(&format!("  {} {}\n", status, note.text));
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;

    file.write_all(content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_tasks(state: tauri::State<AppState>) -> TaskState {
    state.tasks.lock().unwrap_or_else(|e| e.into_inner()).clone()
}

#[tauri::command]
fn save_state(new_state: TaskState, state: tauri::State<AppState>) -> Result<(), String> {
    let mut tasks = state.tasks.lock().unwrap_or_else(|e| e.into_inner());
    *tasks = new_state.clone();
    save_tasks(&tasks)
}

#[tauri::command]
fn complete_task(task: Task, _state: tauri::State<AppState>) -> Result<(), String> {
    append_done(&task)?;
    Ok(())
}

#[tauri::command]
fn hide_window(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn archive_done() -> Result<String, String> {
    let done_file = get_done_file()?;
    if !done_file.exists() {
        return Err("No completed tasks to archive".to_string());
    }

    let date = Local::now().format("%Y-%m-%d_%H%M%S").to_string();
    let archive_name = format!("done_{}.md", date);
    let archive_path = get_tasks_dir()?.join(&archive_name);

    fs::copy(&done_file, &archive_path).map_err(|e| e.to_string())?;
    fs::write(&done_file, "").map_err(|e| e.to_string())?;

    Ok(archive_name)
}

fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            #[cfg(target_os = "macos")]
            {
                let mtm = MainThreadMarker::new().unwrap();

                // Get mouse position (in screen coordinates, origin bottom-left)
                let mouse_pos = NSEvent::mouseLocation();
                let screens = NSScreen::screens(mtm);

                // Find which screen contains the mouse cursor
                for screen in screens.iter() {
                    let frame = screen.frame();

                    // Check if mouse is within this screen's bounds
                    if mouse_pos.x >= frame.origin.x
                        && mouse_pos.x < frame.origin.x + frame.size.width
                        && mouse_pos.y >= frame.origin.y
                        && mouse_pos.y < frame.origin.y + frame.size.height
                    {
                        let window_width = 400.0; // Fixed window width from tauri.conf.json

                        // Position at top-right of this screen
                        let x = frame.origin.x + frame.size.width - window_width;
                        let y = frame.origin.y + frame.size.height; // Top of screen in Cocoa coords

                        // Convert to Tauri coordinates (top-left origin)
                        if let Some(main_screen) = NSScreen::mainScreen(mtm) {
                            let main_height = main_screen.frame().size.height;
                            let flipped_y = main_height - y;
                            let _ = window.set_position(tauri::LogicalPosition::new(x, flipped_y));
                        }
                        break;
                    }
                }
            }

            #[cfg(not(target_os = "macos"))]
            {
                // Fallback for non-macOS: use primary monitor
                if let Ok(Some(monitor)) = window.primary_monitor() {
                    let screen_size = monitor.size();
                    let screen_position = monitor.position();
                    if let Ok(window_size) = window.outer_size() {
                        let x = screen_position.x + (screen_size.width as i32) - (window_size.width as i32);
                        let y = screen_position.y;
                        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
                    }
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
            archive_done,
        ])
        .setup(|app| {
            // Hide from dock on macOS
            #[cfg(target_os = "macos")]
            {
                let mtm = MainThreadMarker::new().unwrap();
                let ns_app = NSApplication::sharedApplication(mtm);
                ns_app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
            }

            // Create tray menu
            let archive_item = MenuItem::with_id(app, "archive", "Archive Completed", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&archive_item, &quit_item])?;

            // Calculate initial task count for tooltip
            let task_count = {
                let state = app.state::<AppState>();
                let tasks = state.tasks.lock().unwrap_or_else(|e| e.into_inner());
                tasks.current.len() + tasks.shelf.len()
            };
            let tooltip = format!("Task Log ({} tasks)", task_count);

            // Build tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip(&tooltip)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "archive" => {
                            let _ = archive_done();
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
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
