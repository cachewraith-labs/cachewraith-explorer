use tauri::{AppHandle, State};

use crate::commands::blocking;
use crate::error::AppResult;
use crate::fs::ops::{self, Listing};
use crate::fs::places::{self, Place};
use crate::fs::{Entry, PathChange, paths};
use crate::state::{self, AppState};

const CHILD_COUNT_CAP: usize = 100_000;

#[tauri::command]
pub async fn list_dir(path: String) -> AppResult<Listing> {
    let dir = paths::parse_absolute(&path)?;
    blocking(move || ops::list_dir(&dir)).await
}

#[tauri::command]
pub async fn stat_path(path: String) -> AppResult<Entry> {
    let path = paths::parse_absolute(&path)?;
    blocking(move || Entry::read(&path)).await
}

#[tauri::command]
pub async fn child_count(path: String) -> AppResult<usize> {
    let dir = paths::parse_absolute(&path)?;
    blocking(move || ops::child_count(&dir, CHILD_COUNT_CAP)).await
}

#[tauri::command]
pub async fn create_dir(parent: String, name: String) -> AppResult<Entry> {
    let parent = paths::parse_absolute(&parent)?;
    blocking(move || ops::create_dir(&parent, &name)).await
}

#[tauri::command]
pub async fn rename_path(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    new_name: String,
) -> AppResult<Entry> {
    let from = paths::parse_absolute(&path)?;
    let source = from.clone();
    let renamed = blocking(move || ops::rename(&source, &new_name)).await?;
    let change = PathChange::Moved {
        from,
        to: paths::parse_absolute(&renamed.path)?,
    };
    state::notify_path_change(&app, &state.folder_icons, &change);
    Ok(renamed)
}

#[tauri::command]
pub async fn get_places() -> AppResult<Vec<Place>> {
    blocking(|| Ok(places::standard_places())).await
}

#[tauri::command]
pub fn initial_location(state: State<'_, AppState>) -> Option<String> {
    state.initial_location.clone()
}
