use crate::theme::{self, Palette};

/// The current wallpaper palette, or `None` to keep the built-in one.
#[tauri::command]
pub fn get_theme() -> Option<Palette> {
    theme::palette_path().and_then(|path| theme::read_palette(&path))
}
