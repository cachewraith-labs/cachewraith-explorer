//! User preferences, persisted as JSON in `$XDG_CONFIG_HOME/cachewraith-explorer`.

use std::fs::{self, DirBuilder, OpenOptions};
use std::io::Write;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::desktop::entry;
use crate::error::{AppError, AppResult};
use crate::fs::paths;
use crate::jobs::ArchiveFormat;
use crate::launcher;

const MAX_PINNED: usize = 64;
const DEFAULT_THEME_COLOR: &str = "#c07d73";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    #[default]
    Grid,
    List,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SortKey {
    #[default]
    Name,
    Size,
    Modified,
    Kind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum SortDirection {
    #[default]
    Asc,
    Desc,
}

/// Where the app's colors come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeSource {
    /// The Material You palette generated from the wallpaper (illogical-impulse).
    #[default]
    Wallpaper,
    /// A palette generated in the app from `theme_color`.
    Color,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    /// Follow the desktop's light/dark preference.
    #[default]
    System,
    Dark,
    Light,
}

/// How folders without a custom icon look.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum FolderIconStyle {
    /// The design's folder glyph, tinted with the theme.
    #[default]
    Theme,
    /// Material Icon Theme folders by name (`src`, `node_modules`…), like VS Code.
    Material,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
#[expect(
    clippy::struct_excessive_bools,
    reason = "independent on/off preferences, not a state machine"
)]
pub struct Settings {
    pub view_mode: ViewMode,
    pub show_hidden: bool,
    pub sort_key: SortKey,
    pub sort_direction: SortDirection,
    pub folders_first: bool,
    pub sidebar_collapsed: bool,
    pub preview_open: bool,
    pub pinned: Vec<String>,
    /// Terminal program name (looked up on `PATH`). `None` = auto-detect.
    pub terminal: Option<String>,
    pub theme_source: ThemeSource,
    /// Seed color (`#rrggbb`) used when `theme_source` is `Color`.
    pub theme_color: String,
    /// Light or dark scheme for `Color` themes; the wallpaper palette brings its own.
    pub theme_mode: ThemeMode,
    pub reduce_motion: bool,
    pub folder_icon_style: FolderIconStyle,
    /// Ask before moving items to Trash.
    pub confirm_trash: bool,
    /// The folder handler this app replaced, so the user can switch back.
    pub previous_file_manager: Option<String>,
    /// The one-time "make this your default file manager?" prompt was answered.
    pub default_prompt_dismissed: bool,
    /// The format "Compress" last used, offered first next time.
    pub archive_format: ArchiveFormat,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            view_mode: ViewMode::Grid,
            show_hidden: false,
            sort_key: SortKey::Name,
            sort_direction: SortDirection::Asc,
            folders_first: true,
            sidebar_collapsed: false,
            preview_open: true,
            pinned: Vec::new(),
            terminal: None,
            theme_source: ThemeSource::Wallpaper,
            theme_color: DEFAULT_THEME_COLOR.to_owned(),
            theme_mode: ThemeMode::System,
            reduce_motion: false,
            folder_icon_style: FolderIconStyle::Theme,
            confirm_trash: false,
            previous_file_manager: None,
            default_prompt_dismissed: false,
            archive_format: ArchiveFormat::Zip,
        }
    }
}

impl Settings {
    /// Drops anything malformed instead of rejecting the whole file.
    fn sanitized(mut self) -> Self {
        let mut seen = std::collections::HashSet::new();
        self.pinned = self
            .pinned
            .into_iter()
            .filter_map(|p| paths::parse_absolute(&p).ok().map(|p| paths::display(&p)))
            .filter(|p| seen.insert(p.clone()))
            .take(MAX_PINNED)
            .collect();
        self.terminal = self.terminal.filter(|t| launcher::is_program_name(t));
        if !is_rgb_hex(&self.theme_color) {
            DEFAULT_THEME_COLOR.clone_into(&mut self.theme_color);
        }
        self.theme_color.make_ascii_lowercase();
        self.previous_file_manager = self
            .previous_file_manager
            .filter(|id| entry::is_valid_id(id));
        self
    }
}

fn is_rgb_hex(value: &str) -> bool {
    value
        .strip_prefix('#')
        .is_some_and(|hex| hex.len() == 6 && hex.bytes().all(|b| b.is_ascii_hexdigit()))
}

pub struct SettingsStore {
    path: Option<PathBuf>,
}

impl SettingsStore {
    pub fn new() -> Self {
        Self {
            path: dirs::config_dir().map(|dir| dir.join("cachewraith-explorer/settings.json")),
        }
    }

    pub fn load(&self) -> Settings {
        let Some(path) = &self.path else {
            return Settings::default();
        };
        match fs::read_to_string(path) {
            Ok(text) => serde_json::from_str::<Settings>(&text)
                .inspect_err(|err| log::warn!("ignoring unreadable settings file: {err}"))
                .unwrap_or_default()
                .sanitized(),
            Err(_) => Settings::default(),
        }
    }

    /// Writes atomically (temp file + rename) with 0600 permissions.
    pub fn save(&self, settings: Settings) -> AppResult<Settings> {
        let settings = settings.sanitized();
        let path = self
            .path
            .as_ref()
            .ok_or_else(|| AppError::invalid("No config directory"))?;
        let dir = path
            .parent()
            .ok_or_else(|| AppError::invalid("Invalid config path"))?;
        DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)
            .map_err(|e| AppError::io(dir, e))?;

        let json =
            serde_json::to_vec_pretty(&settings).map_err(|e| AppError::invalid(e.to_string()))?;
        let temp = path.with_extension("json.tmp");
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temp)
            .map_err(|e| AppError::io(&temp, e))?;
        file.write_all(&json)
            .and_then(|()| file.sync_all())
            .map_err(|e| AppError::io(&temp, e))?;
        fs::rename(&temp, path).map_err(|e| AppError::io(path, e))?;
        Ok(settings)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_pinned_and_terminal() {
        let settings = Settings {
            pinned: vec![
                "/a".into(),
                "relative".into(),
                "/a".into(),
                "/b/../c".into(),
            ],
            terminal: Some("kitty --hold; rm -rf ~".into()),
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(settings.pinned, ["/a", "/c"]);
        assert_eq!(settings.terminal, None);
    }

    #[test]
    fn theme_color_must_be_rgb_hex() {
        let bad = Settings {
            theme_color: "red; --x: url(evil)".into(),
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(bad.theme_color, DEFAULT_THEME_COLOR);
        let good = Settings {
            theme_color: "#4F8BFF".into(),
            ..Settings::default()
        }
        .sanitized();
        assert_eq!(good.theme_color, "#4f8bff");
    }

    #[test]
    fn unknown_or_missing_fields_fall_back_to_defaults() {
        let settings: Settings = serde_json::from_str(r#"{"showHidden":true,"future":1}"#).unwrap();
        assert!(settings.show_hidden);
        assert!(settings.folders_first);
    }
}
