//! The IPC surface: thin handlers that validate input, then delegate to a module.
//! Every handler here must also be listed in `build.rs` and granted in
//! `capabilities/default.json`.

pub mod desktop;
pub mod drives;
pub mod folder_icons;
pub mod fs;
pub mod jobs;
pub mod launcher;
pub mod properties;
pub mod search;
pub mod settings;
pub mod theme;
pub mod trash;
pub mod updates;
pub mod watcher;

use crate::error::{AppError, AppResult};

/// Runs blocking filesystem work off the async runtime's worker threads.
pub(crate) async fn blocking<T, F>(work: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|_| AppError::invalid("A background task stopped unexpectedly"))?
}
