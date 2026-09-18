//! The app's service container. Tauri manages exactly one `AppState`, and every command
//! receives it by reference — no statics, no globals.

use std::sync::Arc;

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use crate::background::BackgroundTasks;
use crate::desktop::file_manager1::FileManagerService;
use crate::events;
use crate::folder_icons::FolderIconStore;
use crate::fs::{PathChange, PathChangeSink};
use crate::jobs::{JobManager, JobSnapshot, Sink};
use crate::settings::SettingsStore;
use crate::theme::{self, ThemeWatcher};
use crate::watcher::DirWatcher;

pub struct AppState {
    pub jobs: JobManager,
    pub folder_icons: Arc<FolderIconStore>,
    pub tasks: BackgroundTasks,
    pub settings: SettingsStore,
    pub watcher: Option<DirWatcher>,
    pub initial_location: Option<String>,
    /// Folders other apps asked to show (over D-Bus), until the UI takes them.
    pub open_requests: Arc<Mutex<Vec<String>>>,
    pub file_manager: FileManagerService,
    _theme_watcher: Option<ThemeWatcher>,
}

impl AppState {
    pub fn new(app: &AppHandle, initial_location: Option<String>) -> Self {
        let jobs_app = app.clone();
        let sink: Sink = Arc::new(move |snapshot: &JobSnapshot| {
            let _ = jobs_app.emit(events::JOBS_UPDATED, snapshot);
        });

        let folder_icons = Arc::new(FolderIconStore::new());
        let on_path_change: PathChangeSink = {
            let icons = Arc::clone(&folder_icons);
            let app = app.clone();
            Arc::new(move |change: &PathChange| notify_path_change(&app, &icons, change))
        };

        let fs_app = app.clone();
        let watcher = DirWatcher::new(move |dirs| {
            let _ = fs_app.emit(events::FS_CHANGED, dirs);
        })
        .inspect_err(|err| log::warn!("file watching disabled: {err}"))
        .ok();

        let theme_app = app.clone();
        let theme_watcher = theme::palette_path().and_then(|path| {
            ThemeWatcher::start(path, move |palette| {
                let _ = theme_app.emit(events::THEME_CHANGED, palette);
            })
        });

        let open_requests = Arc::new(Mutex::new(Vec::new()));
        let file_manager = {
            let queue = Arc::clone(&open_requests);
            let app = app.clone();
            FileManagerService::new(Arc::new(move |uris: Vec<String>| {
                let dirs: Vec<String> = uris
                    .iter()
                    .filter_map(|uri| crate::resolve_launch_arg(uri))
                    .collect();
                if dirs.is_empty() {
                    return;
                }
                queue.lock().extend(dirs);
                let _ = app.emit(events::OPEN_REQUESTED, ());
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }))
        };

        Self {
            jobs: JobManager::new(sink, on_path_change),
            folder_icons,
            tasks: BackgroundTasks::default(),
            settings: SettingsStore::new(),
            watcher,
            initial_location,
            open_requests,
            file_manager,
            _theme_watcher: theme_watcher,
        }
    }
}

/// Keeps path-keyed data in step with a move or delete, and tells the UI if it changed.
pub fn notify_path_change(app: &AppHandle, icons: &FolderIconStore, change: &PathChange) {
    if icons.apply(change) {
        let _ = app.emit(events::FOLDER_ICONS_CHANGED, icons.all());
    }
}
