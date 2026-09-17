use std::path::PathBuf;

use serde::Serialize;

use crate::fs::paths;

/// A standard folder shown under "Places". `id` is stable and drives the icon and the
/// Alt+N shortcut on the frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub id: &'static str,
    pub label: String,
    pub path: String,
}

/// Home plus the XDG user directories that actually exist, in sidebar order.
pub fn standard_places() -> Vec<Place> {
    let candidates: [(&'static str, &str, Option<PathBuf>); 7] = [
        ("home", "Home", dirs::home_dir()),
        ("desktop", "Desktop", dirs::desktop_dir()),
        ("documents", "Documents", dirs::document_dir()),
        ("downloads", "Downloads", dirs::download_dir()),
        ("pictures", "Pictures", dirs::picture_dir()),
        ("music", "Music", dirs::audio_dir()),
        ("videos", "Videos", dirs::video_dir()),
    ];
    let home = dirs::home_dir();
    candidates
        .into_iter()
        .filter_map(|(id, label, dir)| {
            let dir = dir?;
            // An unset XDG dir falls back to $HOME; don't list Home twice.
            if id != "home" && Some(&dir) == home.as_ref() {
                return None;
            }
            dir.is_dir().then(|| Place {
                id,
                label: label.to_owned(),
                path: paths::display(&dir),
            })
        })
        .collect()
}
