//! The app's service container. Tauri manages exactly one `AppState`, and every command
//! receives it by reference — no statics, no globals.

use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::background::BackgroundTasks;
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

        Self {
            jobs: JobManager::new(sink, on_path_change),
            folder_icons,
            tasks: BackgroundTasks::default(),
            settings: SettingsStore::new(),
            watcher,
            initial_location,
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
