use crate::commands::blocking;
use crate::drives::{self, Drive};
use crate::error::AppResult;

#[tauri::command]
pub async fn list_drives() -> AppResult<Vec<Drive>> {
    blocking(drives::list).await
}
