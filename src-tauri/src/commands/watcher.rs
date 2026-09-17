use tauri::State;

use crate::error::{AppError, AppResult};
use crate::fs::paths;
use crate::state::AppState;

const MAX_WATCHED: usize = 64;

#[tauri::command]
pub fn watch_dirs(state: State<'_, AppState>, paths: Vec<String>) -> AppResult<()> {
    if paths.len() > MAX_WATCHED {
        return Err(AppError::invalid("Too many folders to watch"));
    }
    let dirs = paths::parse_all(&paths)?;
    if let Some(watcher) = &state.watcher {
        watcher.set(dirs);
    }
    Ok(())
}
