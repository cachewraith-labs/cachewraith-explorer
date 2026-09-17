use tauri::State;
use tauri::ipc::Channel;

use crate::error::{AppError, AppResult};
use crate::fs::paths;
use crate::search::{self, SearchEvent, SearchQuery};
use crate::state::AppState;

const MAX_QUERY_LEN: usize = 256;

#[tauri::command]
pub fn start_search(
    state: State<'_, AppState>,
    root: String,
    query: String,
    include_hidden: bool,
    on_event: Channel<SearchEvent>,
) -> AppResult<u64> {
    let root = paths::parse_absolute(&root)?;
    if query.trim().is_empty() || query.len() > MAX_QUERY_LEN {
        return Err(AppError::invalid("Search text must be 1–256 characters"));
    }
    let query = SearchQuery::new(root, &query, include_hidden);
    Ok(state.tasks.spawn("search", move |cancelled| {
        search::run(&query, cancelled, &|event| on_event.send(event).is_ok());
    }))
}

#[tauri::command]
pub fn cancel_search(state: State<'_, AppState>, id: u64) {
    state.tasks.cancel(id);
}
