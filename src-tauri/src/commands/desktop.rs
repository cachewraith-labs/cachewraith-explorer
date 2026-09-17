use crate::commands::blocking;
use crate::desktop::default_app::{self, DefaultAppStatus};
use crate::desktop::environment::{self, DesktopInfo};
use crate::error::AppResult;

#[tauri::command]
pub fn desktop_info() -> DesktopInfo {
    environment::detect()
}

#[tauri::command]
pub async fn default_app_status() -> AppResult<DefaultAppStatus> {
    blocking(|| Ok(default_app::status())).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MadeDefault {
    pub status: DefaultAppStatus,
    /// The handler that was replaced; the frontend keeps it in settings.
    pub previous_id: Option<String>,
}

#[tauri::command]
pub async fn make_default_app() -> AppResult<MadeDefault> {
    blocking(|| {
        let previous_id = default_app::make_default()?;
        Ok(MadeDefault {
            status: default_app::status(),
            previous_id,
        })
    })
    .await
}

#[tauri::command]
pub async fn restore_default_app(id: String) -> AppResult<DefaultAppStatus> {
    blocking(move || {
        default_app::restore(&id)?;
        Ok(default_app::status())
    })
    .await
}
