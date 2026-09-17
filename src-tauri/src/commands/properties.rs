use tauri::State;
use tauri::ipc::Channel;

use crate::commands::blocking;
use crate::error::{AppError, AppResult};
use crate::fs::paths;
use crate::fs::properties::{self, Properties};
use crate::fs::usage::{self, UsageEvent};
use crate::state::AppState;

const MAX_USAGE_ROOTS: usize = 10_000;

#[tauri::command]
pub async fn path_properties(path: String) -> AppResult<Properties> {
    let path = paths::parse_absolute(&path)?;
    blocking(move || properties::read(&path)).await
}

/// Starts counting the total size of `paths`; progress arrives on `on_event`.
#[tauri::command]
pub fn start_folder_usage(
    state: State<'_, AppState>,
    paths: Vec<String>,
    on_event: Channel<UsageEvent>,
) -> AppResult<u64> {
    if paths.is_empty() || paths.len() > MAX_USAGE_ROOTS {
        return Err(AppError::invalid("Choose between 1 and 10,000 items"));
    }
    let roots = paths::parse_all(&paths)?;
    Ok(state.tasks.spawn("usage", move |cancelled| {
        usage::measure(&roots, cancelled, &|event| on_event.send(event).is_ok());
    }))
}

#[tauri::command]
pub fn cancel_folder_usage(state: State<'_, AppState>, id: u64) {
    state.tasks.cancel(id);
}
