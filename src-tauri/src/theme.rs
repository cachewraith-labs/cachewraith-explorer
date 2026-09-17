//! Follows the Material You palette that the illogical-impulse Quickshell config generates
//! from the wallpaper, so the app recolors itself when the wallpaper changes.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{DebounceEventResult, Debouncer, RecommendedCache, new_debouncer};

/// Material token name (`surface_container_high`) → `#rrggbb`.
pub type Palette = BTreeMap<String, String>;

const PALETTE_FILE: &str = "colors.json";

pub fn palette_path() -> Option<PathBuf> {
    dirs::state_dir().map(|dir| dir.join("quickshell/user/generated").join(PALETTE_FILE))
}

/// Reads and validates the palette. Only well-formed token names and hex colors pass, so
/// nothing from the file can inject arbitrary CSS when the frontend applies it.
pub fn read_palette(path: &Path) -> Option<Palette> {
    let text = fs::read_to_string(path).ok()?;
    let raw: BTreeMap<String, serde_json::Value> = serde_json::from_str(&text).ok()?;
    let palette: Palette = raw
        .into_iter()
        .filter_map(|(key, value)| {
            let color = value.as_str()?;
            (is_token_name(&key) && is_hex_color(color)).then(|| (key, color.to_ascii_lowercase()))
        })
        .collect();
    (!palette.is_empty()).then_some(palette)
}

fn is_token_name(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= 48
        && key
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

fn is_hex_color(value: &str) -> bool {
    value
        .strip_prefix('#')
        .is_some_and(|hex| matches!(hex.len(), 6 | 8) && hex.bytes().all(|b| b.is_ascii_hexdigit()))
}

/// Keeps a watch on the palette's folder (the generator replaces the file, so watching the
/// file itself would lose track of it after the first change).
pub struct ThemeWatcher {
    _debouncer: Debouncer<RecommendedWatcher, RecommendedCache>,
}

impl ThemeWatcher {
    pub fn start(path: PathBuf, on_change: impl Fn(Palette) + Send + 'static) -> Option<Self> {
        let folder = path.parent()?.to_path_buf();
        let mut debouncer = new_debouncer(
            Duration::from_millis(300),
            None,
            move |result: DebounceEventResult| {
                let touched = result.is_ok_and(|events| {
                    events
                        .iter()
                        .flat_map(|e| e.paths.iter())
                        .any(|p| p.file_name().is_some_and(|n| n == PALETTE_FILE))
                });
                if touched && let Some(palette) = read_palette(&path) {
                    on_change(palette);
                }
            },
        )
        .ok()?;
        debouncer.watch(&folder, RecursiveMode::NonRecursive).ok()?;
        Some(Self {
            _debouncer: debouncer,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_valid_tokens_and_colors() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(PALETTE_FILE);
        fs::write(
            &file,
            r##"{"primary":"#DFBFBB","surface":"#161312","bad key":"#000000","on_surface":"red; background:url(x)","count":3}"##,
        )
        .unwrap();
        let palette = read_palette(&file).unwrap();
        assert_eq!(palette.len(), 2);
        assert_eq!(palette["primary"], "#dfbfbb");
    }
}
