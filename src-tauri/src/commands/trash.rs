use crate::commands::blocking;
use crate::error::AppResult;
use crate::fs::Entry;
use crate::trash;

#[tauri::command]
pub async fn list_trash() -> AppResult<Vec<Entry>> {
    blocking(trash::list).await
}

#[tauri::command]
pub async fn restore_trash(ids: Vec<String>) -> AppResult<()> {
    blocking(move || trash::restore(&ids)).await
}

#[tauri::command]
pub async fn purge_trash(ids: Vec<String>) -> AppResult<()> {
    blocking(move || trash::purge(&ids)).await
}

#[tauri::command]
pub async fn empty_trash() -> AppResult<()> {
    blocking(trash::empty).await
}
