use tauri::State;

use crate::commands::blocking;
use crate::error::AppResult;
use crate::fs::paths;
use crate::launcher;
use crate::state::AppState;

#[tauri::command]
pub async fn open_path(path: String) -> AppResult<()> {
    let path = paths::parse_absolute(&path)?;
    blocking(move || launcher::open_path(&path)).await
}

#[tauri::command]
pub async fn open_terminal(state: State<'_, AppState>, dir: String) -> AppResult<()> {
    let dir = paths::parse_absolute(&dir)?;
    let preferred = state.settings.load().terminal;
    blocking(move || launcher::open_terminal(&dir, preferred.as_deref())).await
}
