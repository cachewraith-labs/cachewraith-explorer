use std::collections::BTreeMap;

use tauri::{AppHandle, Emitter, State};

use crate::error::AppResult;
use crate::events;
use crate::fs::paths;
use crate::state::AppState;

/// Every custom folder icon: absolute path → icon name.
#[tauri::command]
pub fn list_folder_icons(state: State<'_, AppState>) -> BTreeMap<String, String> {
    state.folder_icons.all()
}

/// Sets a folder's icon, or restores the default with `icon: null`.
#[tauri::command]
pub fn set_folder_icon(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    icon: Option<String>,
) -> AppResult<()> {
    let folder = paths::parse_absolute(&path)?;
    state.folder_icons.set(&folder, icon.as_deref())?;
    let _ = app.emit(events::FOLDER_ICONS_CHANGED, state.folder_icons.all());
    Ok(())
}
