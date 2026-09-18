//! "Use as default file manager": which app opens folders (`inode/directory`), and
//! switching it to this app or back. Switching also installs or removes the D-Bus
//! activation file for `org.freedesktop.FileManager1` (see [`file_manager1`]).
//!
//! Works on any freedesktop desktop: `xdg-mime` when it is installed, otherwise the
//! `mimeapps.list` file every desktop reads. External programs get argv, never a shell.

use std::env;
use std::fs::{self, DirBuilder};
use std::os::unix::fs::DirBuilderExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;

use crate::desktop::{entry, file_manager1};
use crate::error::{AppError, AppResult};

const FOLDER_MIME: &str = "inode/directory";
pub const OUR_ID: &str = "cachewraith-explorer.desktop";
const ICON_NAME: &str = "cachewraith-explorer";
const ICON_PNG: &[u8] = include_bytes!("../../icons/128x128@2x.png");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DefaultAppStatus {
    pub is_default: bool,
    /// Desktop entry id of the current folder handler, if any.
    pub current_id: Option<String>,
    /// Its display name, e.g. "Files" or "Dolphin".
    pub current_name: Option<String>,
}

pub fn status() -> DefaultAppStatus {
    let current_id = query_default();
    let current_name = current_id
        .as_deref()
        .and_then(entry::find)
        .and_then(|path| entry::read_name(&path));
    DefaultAppStatus {
        is_default: current_id.as_deref() == Some(OUR_ID),
        current_id,
        current_name,
    }
}

/// Makes this app open folders. Returns the handler it replaced, so it can be restored.
pub fn make_default() -> AppResult<Option<String>> {
    let previous = query_default().filter(|id| id != OUR_ID);
    ensure_desktop_entry()?;
    set_handler(OUR_ID)?;
    file_manager1::install_activation_file(&launch_path()?)?;
    Ok(previous)
}

/// Hands folders back to another installed app.
pub fn restore(id: &str) -> AppResult<()> {
    if !entry::is_valid_id(id) || entry::find(id).is_none() {
        return Err(AppError::invalid("That app is no longer installed"));
    }
    set_handler(id)?;
    file_manager1::remove_activation_file()
}

/// An installed app that can open folders, offered when handing folders back.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderHandler {
    pub id: String,
    pub name: String,
}

/// Every other installed app that declares `inode/directory`, real file managers first
/// (`Categories=…FileManager`), then by name. Hidden entries (`NoDisplay`, `Hidden`) are
/// skipped; for duplicate ids the XDG-precedence winner counts.
pub fn folder_handlers() -> Vec<FolderHandler> {
    let mut seen = std::collections::HashSet::new();
    let mut found: Vec<(bool, FolderHandler)> = Vec::new();
    for dir in entry::application_dirs() {
        let Ok(files) = fs::read_dir(&dir) else {
            continue;
        };
        for file in files.flatten() {
            let Some(id) = file.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            if !entry::is_valid_id(&id) || id == OUR_ID || !seen.insert(id.clone()) {
                continue;
            }
            let path = file.path();
            let is_true = |key| entry::read_key(&path, key).is_some_and(|v| v == "true");
            let handles_folders = entry::read_key(&path, "MimeType")
                .is_some_and(|types| types.split(';').any(|t| t.trim() == FOLDER_MIME));
            if !handles_folders || is_true("NoDisplay") || is_true("Hidden") {
                continue;
            }
            let file_manager = entry::read_key(&path, "Categories")
                .is_some_and(|c| c.split(';').any(|c| c == "FileManager"));
            let name = entry::read_name(&path)
                .unwrap_or_else(|| id.trim_end_matches(".desktop").to_owned());
            found.push((file_manager, FolderHandler { id, name }));
        }
    }
    found.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| a.1.name.to_lowercase().cmp(&b.1.name.to_lowercase()))
    });
    found.into_iter().map(|(_, handler)| handler).collect()
}

fn query_default() -> Option<String> {
    let from_xdg = Command::new("xdg-mime")
        .args(["query", "default", FOLDER_MIME])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .ok()
        .filter(|out| out.status.success())
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_owned());
    from_xdg
        .or_else(|| {
            let text = fs::read_to_string(mimeapps_path()?).ok()?;
            read_default(&text, FOLDER_MIME)
        })
        .filter(|id| entry::is_valid_id(id))
}

fn set_handler(id: &str) -> AppResult<()> {
    let via_xdg = Command::new("xdg-mime")
        .args(["default", id, FOLDER_MIME])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success());
    // Trust but verify: some desktops' xdg-mime backends silently do nothing.
    if via_xdg && query_default().as_deref() == Some(id) {
        return Ok(());
    }
    let path = mimeapps_path().ok_or_else(|| AppError::invalid("No config directory"))?;
    let text = fs::read_to_string(&path).unwrap_or_default();
    write_atomically(&path, with_default(&text, FOLDER_MIME, id).as_bytes())
}

/// Makes sure a desktop entry named [`OUR_ID`] launches *this* binary, writing a per-user
/// one when the installed entry is missing or points elsewhere (`AppImage`, dev build).
fn ensure_desktop_entry() -> AppResult<()> {
    let exe = launch_path()?;
    if let Some(existing) = entry::find(OUR_ID)
        && entry::read_program(&existing).is_some_and(|program| resolves_to(&program, &exe))
    {
        return Ok(());
    }

    let data = dirs::data_dir().ok_or_else(|| AppError::invalid("No data directory"))?;
    let exec = exe
        .to_str()
        .and_then(entry::quote_exec_arg)
        .ok_or_else(|| AppError::invalid("The app's path cannot be used in a desktop entry"))?;

    let icon = data
        .join("icons/hicolor/256x256/apps")
        .join(format!("{ICON_NAME}.png"));
    if !icon.exists() {
        create_dir(icon.parent().unwrap_or(&data))?;
        write_atomically(&icon, ICON_PNG)?;
    }

    let applications = data.join("applications");
    create_dir(&applications)?;
    let contents = format!(
        "[Desktop Entry]\n\
         Type=Application\n\
         Name=Files\n\
         GenericName=File Manager\n\
         Comment=Browse and manage your files\n\
         Exec={exec} %U\n\
         Icon={ICON_NAME}\n\
         Terminal=false\n\
         Categories=System;FileTools;FileManager;Utility;\n\
         MimeType={FOLDER_MIME};\n\
         StartupWMClass=cachewraith-explorer\n"
    );
    write_atomically(&applications.join(OUR_ID), contents.as_bytes())?;

    // Refresh the desktop's cache if the tool exists; the entry works without it.
    let _ = Command::new("update-desktop-database")
        .arg(&applications)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    Ok(())
}

/// Keeps the D-Bus activation file pointing at this binary while this app is the folder
/// handler; also repairs installs made before the file existed. Blocking.
pub fn ensure_activation_file() -> AppResult<()> {
    file_manager1::install_activation_file(&launch_path()?)
}

/// An `AppImage` runs from a temporary mount; its stable location is in `$APPIMAGE`.
fn launch_path() -> AppResult<PathBuf> {
    if let Some(appimage) = env::var_os("APPIMAGE")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute() && p.is_file())
    {
        return Ok(appimage);
    }
    env::current_exe().map_err(|e| AppError::io("current executable", e))
}

fn resolves_to(program: &str, exe: &Path) -> bool {
    let candidate = if Path::new(program).is_absolute() {
        Some(PathBuf::from(program))
    } else {
        env::var_os("PATH").and_then(|path| {
            env::split_paths(&path)
                .map(|dir| dir.join(program))
                .find(|p| p.is_file())
        })
    };
    match (
        candidate.and_then(|p| fs::canonicalize(p).ok()),
        fs::canonicalize(exe),
    ) {
        (Some(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn mimeapps_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("mimeapps.list"))
}

fn create_dir(dir: &Path) -> AppResult<()> {
    DirBuilder::new()
        .recursive(true)
        .mode(0o755)
        .create(dir)
        .map_err(|e| AppError::io(dir, e))
}

fn write_atomically(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let temp = path.with_extension("tmp-cachewraith");
    fs::write(&temp, bytes).map_err(|e| AppError::io(&temp, e))?;
    fs::rename(&temp, path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        AppError::io(path, e)
    })
}

const DEFAULTS_GROUP: &str = "[Default Applications]";

/// The first id listed for `mime` under `[Default Applications]`.
fn read_default(text: &str, mime: &str) -> Option<String> {
    let mut in_group = false;
    for line in text.lines().map(str::trim) {
        if line.starts_with('[') {
            in_group = line == DEFAULTS_GROUP;
        } else if in_group
            && let Some((key, value)) = line.split_once('=')
            && key.trim() == mime
        {
            return value
                .split(';')
                .map(str::trim)
                .find(|id| !id.is_empty())
                .map(str::to_owned);
        }
    }
    None
}

/// Returns `text` with `mime=id;` under `[Default Applications]`, replacing an existing
/// line or adding the group, and leaving every other line untouched.
fn with_default(text: &str, mime: &str, id: &str) -> String {
    let line = format!("{mime}={id};");
    let mut out: Vec<String> = Vec::new();
    let mut in_group = false;
    let mut group_seen = false;
    let mut written = false;

    for raw in text.lines() {
        let trimmed = raw.trim();
        if trimmed.starts_with('[') {
            if in_group && !written {
                out.push(line.clone());
                written = true;
            }
            in_group = trimmed == DEFAULTS_GROUP;
            group_seen |= in_group;
        } else if in_group
            && trimmed
                .split_once('=')
                .is_some_and(|(key, _)| key.trim() == mime)
        {
            if !written {
                out.push(line.clone());
                written = true;
            }
            continue;
        }
        out.push(raw.to_owned());
    }
    if !written {
        if !group_seen {
            if out.last().is_some_and(|l| !l.trim().is_empty()) {
                out.push(String::new());
            }
            out.push(DEFAULTS_GROUP.to_owned());
        }
        out.push(line);
    }
    let mut result = out.join("\n");
    result.push('\n');
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_group_when_missing() {
        let text = "[Added Associations]\ntext/plain=gedit.desktop;\n";
        let updated = with_default(text, FOLDER_MIME, OUR_ID);
        assert_eq!(
            updated,
            "[Added Associations]\ntext/plain=gedit.desktop;\n\n[Default Applications]\ninode/directory=cachewraith-explorer.desktop;\n"
        );
        assert_eq!(read_default(&updated, FOLDER_MIME).as_deref(), Some(OUR_ID));
    }

    #[test]
    fn replaces_existing_line_and_keeps_others() {
        let text = "[Default Applications]\ntext/html=firefox.desktop\ninode/directory=org.gnome.Nautilus.desktop;\n[Removed Associations]\n";
        let updated = with_default(text, FOLDER_MIME, OUR_ID);
        assert!(updated.contains("text/html=firefox.desktop"));
        assert!(!updated.contains("Nautilus"));
        assert!(updated.contains("[Removed Associations]"));
        assert_eq!(read_default(&updated, FOLDER_MIME).as_deref(), Some(OUR_ID));
    }

    #[test]
    fn inserts_into_group_that_lacks_the_mime() {
        let text = "[Default Applications]\ntext/html=firefox.desktop\n[Other]\nx=y\n";
        let updated = with_default(text, FOLDER_MIME, "thunar.desktop");
        assert_eq!(
            updated,
            "[Default Applications]\ntext/html=firefox.desktop\ninode/directory=thunar.desktop;\n[Other]\nx=y\n"
        );
    }

    #[test]
    fn restore_refuses_unknown_or_invalid_ids() {
        assert!(restore("../../evil.desktop").is_err());
        assert!(restore("definitely-not-installed-app-xyz.desktop").is_err());
    }
}
