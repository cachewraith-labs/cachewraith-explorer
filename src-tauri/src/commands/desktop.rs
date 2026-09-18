use tauri::{AppHandle, Manager, State};

use crate::commands::blocking;
use crate::desktop::clipboard;
use crate::desktop::default_app::{self, DefaultAppStatus, FolderHandler};
use crate::desktop::environment::{self, DesktopInfo};
use crate::error::{AppError, AppResult};
use crate::fs::paths;
use crate::state::AppState;

/// More than anyone selects by hand; keeps one clipboard offer bounded.
const MAX_CLIPBOARD_PATHS: usize = 100_000;

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
pub async fn make_default_app(app: AppHandle) -> AppResult<MadeDefault> {
    let made = blocking(|| {
        let previous_id = default_app::make_default()?;
        Ok(MadeDefault {
            status: default_app::status(),
            previous_id,
        })
    })
    .await?;
    on_main_thread(&app, |state| state.file_manager.claim());
    Ok(made)
}

#[tauri::command]
pub async fn restore_default_app(app: AppHandle, id: String) -> AppResult<DefaultAppStatus> {
    let status = blocking(move || {
        default_app::restore(&id)?;
        Ok(default_app::status())
    })
    .await?;
    on_main_thread(&app, |state| state.file_manager.release());
    Ok(status)
}

/// Other installed apps that can open folders, for handing folders back.
#[tauri::command]
pub async fn folder_handlers() -> AppResult<Vec<FolderHandler>> {
    blocking(|| Ok(default_app::folder_handlers())).await
}

/// Folders other apps asked to show since the last call, oldest first.
#[tauri::command]
pub fn take_open_requests(state: State<'_, AppState>) -> Vec<String> {
    std::mem::take(&mut *state.open_requests.lock())
}

/// Puts files on the system clipboard as copied (`cut: false`) or cut files.
#[tauri::command]
pub async fn copy_files_to_clipboard(
    app: AppHandle,
    paths: Vec<String>,
    cut: bool,
) -> AppResult<()> {
    if paths.is_empty() || paths.len() > MAX_CLIPBOARD_PATHS {
        return Err(AppError::invalid("Nothing to copy"));
    }
    let paths = paths
        .iter()
        .map(|path| paths::parse_absolute(path))
        .collect::<AppResult<Vec<_>>>()?;
    let formats = clipboard::formats(&paths, cut);
    let (done, result) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = done.send(clipboard::publish(formats));
    })
    .map_err(|_| AppError::invalid("The clipboard is not available"))?;
    match result.await {
        Ok(true) => Ok(()),
        _ => Err(AppError::invalid("Another app is holding the clipboard")),
    }
}

fn on_main_thread(app: &AppHandle, work: impl FnOnce(&AppState) + Send + 'static) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || work(&handle.state::<AppState>()));
}
