use crate::commands::blocking;
use crate::error::AppResult;
use crate::updater::{self, UpdateStatus};

/// Compares this version with the latest GitHub release.
#[tauri::command]
pub async fn check_update() -> AppResult<UpdateStatus> {
    blocking(updater::check).await
}
