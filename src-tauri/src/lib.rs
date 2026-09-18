//! Cachewraith Explorer — backend.
//!
//! `commands` is the only module the webview can reach; everything below it is plain Rust
//! with its own tests.

mod background;
mod commands;
mod desktop;
mod drives;
mod error;
mod folder_icons;
mod fs;
mod jobs;
mod launcher;
mod search;
mod settings;
mod state;
mod theme;
mod thumbnails;
mod trash;
mod updater;
mod watcher;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::Manager;

use crate::state::AppState;
use crate::thumbnails::ThumbnailService;

/// Event names shared with `src/ipc/events.ts`.
pub mod events {
    pub const JOBS_UPDATED: &str = "jobs:updated";
    pub const FS_CHANGED: &str = "fs:changed";
    pub const THEME_CHANGED: &str = "theme:changed";
    pub const FOLDER_ICONS_CHANGED: &str = "folder-icons:changed";
    pub const OPEN_REQUESTED: &str = "open:requested";
}

pub fn run() {
    let _ = env_logger::Builder::new()
        .filter_level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Warn
        })
        .parse_env("EXPLORER_LOG")
        .try_init();

    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("update") {
        let options = updater::CliOptions {
            check_only: args.iter().any(|a| a == "--check"),
            force: args.iter().any(|a| a == "--force"),
        };
        std::process::exit(updater::run_cli(&options));
    }
    // A bus-started app waits for the request instead of opening a folder of its own.
    let first_arg = args
        .into_iter()
        .next()
        .filter(|arg| arg != desktop::file_manager1::ACTIVATION_FLAG);
    if let Some(code) = first_arg.as_deref().and_then(run_cli_flag) {
        std::process::exit(code);
    }
    let initial_location = first_arg.and_then(|arg| resolve_launch_arg(&arg));
    let thumbnails = Arc::new(ThumbnailService::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .register_asynchronous_uri_scheme_protocol(
            thumbnails::SCHEME,
            move |_ctx, request, responder| {
                let service = Arc::clone(&thumbnails);
                tauri::async_runtime::spawn(async move {
                    responder.respond(service.respond(request.uri()).await);
                });
            },
        )
        .setup(move |app| {
            app.manage(AppState::new(app.handle(), initial_location));
            claim_file_manager_service(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::fs::list_dir,
            commands::fs::stat_path,
            commands::fs::child_count,
            commands::fs::create_dir,
            commands::fs::rename_path,
            commands::folder_icons::list_folder_icons,
            commands::folder_icons::set_folder_icon,
            commands::fs::get_places,
            commands::properties::path_properties,
            commands::properties::start_folder_usage,
            commands::properties::cancel_folder_usage,
            commands::fs::initial_location,
            commands::drives::list_drives,
            commands::desktop::desktop_info,
            commands::updates::check_update,
            commands::desktop::default_app_status,
            commands::desktop::make_default_app,
            commands::desktop::restore_default_app,
            commands::desktop::take_open_requests,
            commands::desktop::folder_handlers,
            commands::desktop::copy_files_to_clipboard,
            commands::jobs::enqueue_job,
            commands::jobs::pause_job,
            commands::jobs::resume_job,
            commands::jobs::cancel_job,
            commands::jobs::list_jobs,
            commands::trash::list_trash,
            commands::trash::restore_trash,
            commands::trash::purge_trash,
            commands::trash::empty_trash,
            commands::search::start_search,
            commands::search::cancel_search,
            commands::watcher::watch_dirs,
            commands::theme::get_theme,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::launcher::open_path,
            commands::launcher::open_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cachewraith Explorer");
}

/// Serves `org.freedesktop.FileManager1` while this app is the default file manager, so
/// "Reveal in File Explorer" and similar actions in other apps open here.
fn claim_file_manager_service(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        if !desktop::default_app::status().is_default {
            return;
        }
        if let Err(err) = desktop::default_app::ensure_activation_file() {
            log::warn!("could not install the D-Bus activation file: {err}");
        }
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || handle.state::<AppState>().file_manager.claim());
    });
}

/// Non-GUI flags for scripts and packagers. Returns the exit code, or `None` for a normal
/// launch (a path, or nothing).
fn run_cli_flag(arg: &str) -> Option<i32> {
    use desktop::default_app;
    match arg {
        "--default-status" => {
            let status = default_app::status();
            println!("{}", status.current_id.as_deref().unwrap_or("(none)"));
            Some(i32::from(!status.is_default))
        }
        "--make-default" => Some(match default_app::make_default() {
            Ok(previous) => {
                // Remembered so Settings (or --restore-default) can switch back.
                if let Some(previous) = &previous {
                    let store = settings::SettingsStore::new();
                    let mut current = store.load();
                    current.previous_file_manager = Some(previous.clone());
                    let _ = store.save(current);
                }
                println!(
                    "Folders now open with {}{}",
                    default_app::OUR_ID,
                    previous.map(|p| format!(" (was {p})")).unwrap_or_default()
                );
                0
            }
            Err(err) => {
                eprintln!("Could not set the default file manager: {err}");
                2
            }
        }),
        "--restore-default" => {
            let remembered = settings::SettingsStore::new().load().previous_file_manager;
            let target = remembered
                .filter(|id| desktop::entry::find(id).is_some())
                .or_else(|| {
                    default_app::folder_handlers()
                        .into_iter()
                        .next()
                        .map(|h| h.id)
                });
            Some(
                match target.map(|id| default_app::restore(&id).map(|()| id)) {
                    Some(Ok(id)) => {
                        println!("Folders now open with {id}");
                        0
                    }
                    Some(Err(err)) => {
                        eprintln!("Could not switch the default file manager: {err}");
                        2
                    }
                    None => {
                        eprintln!("No other file manager is installed");
                        2
                    }
                },
            )
        }
        "--help" | "-h" => {
            println!(
                "Usage: cachewraith-explorer [FOLDER | file:// URI]\n       cachewraith-explorer update [--check] [--force]   update to the latest release\n       cachewraith-explorer --make-default     open folders with this app system-wide\n       cachewraith-explorer --restore-default  give folders back to the previous file manager\n       cachewraith-explorer --default-status   print the current folder handler (exit 0 if it is this app)"
            );
            Some(0)
        }
        _ => None,
    }
}

/// `cachewraith-explorer ~/storage` or `file:///home/me/storage` (what `xdg-open` passes).
/// A file opens its containing folder.
pub(crate) fn resolve_launch_arg(arg: &str) -> Option<String> {
    let raw = match arg.strip_prefix("file://") {
        Some(uri) => percent_encoding::percent_decode_str(uri)
            .decode_utf8()
            .ok()?
            .into_owned(),
        None => arg.to_owned(),
    };
    let path = if Path::new(&raw).is_absolute() {
        PathBuf::from(raw)
    } else {
        std::env::current_dir().ok()?.join(raw)
    };
    let path = fs::paths::normalize(&path);
    let dir = if path.is_dir() {
        path
    } else {
        path.parent()?.to_path_buf()
    };
    dir.is_dir().then(|| fs::paths::display(&dir))
}
