//! Custom folder icons, chosen by the user.
//!
//! Pattern: **Repository** over a small JSON file in `$XDG_DATA_HOME/cachewraith-explorer`,
//! keyed by absolute path. Considered and rejected: extended attributes (lost on FAT/exFAT,
//! NTFS and network mounts) and KDE-style `.directory` files (they litter user folders).
//! Paths are kept in sync when this app renames, moves or deletes a folder; see
//! [`FolderIconStore::apply`].

use std::collections::BTreeMap;
use std::fs::{self, DirBuilder, OpenOptions};
use std::io::Write;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

use parking_lot::Mutex;

use crate::error::{AppError, AppResult};
use crate::fs::{PathChange, paths};

const MAX_ENTRIES: usize = 10_000;
const MAX_ICON_NAME: usize = 64;

pub struct FolderIconStore {
    file: Option<PathBuf>,
    icons: Mutex<BTreeMap<String, String>>,
}

impl FolderIconStore {
    pub fn new() -> Self {
        let file = dirs::data_dir().map(|dir| dir.join("cachewraith-explorer/folder-icons.json"));
        Self::at(file)
    }

    fn at(file: Option<PathBuf>) -> Self {
        let icons = file
            .as_deref()
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|text| serde_json::from_str::<BTreeMap<String, String>>(&text).ok())
            .unwrap_or_default()
            .into_iter()
            .filter(|(path, icon)| paths::parse_absolute(path).is_ok() && is_icon_name(icon))
            .take(MAX_ENTRIES)
            .collect();
        Self {
            file,
            icons: Mutex::new(icons),
        }
    }

    pub fn all(&self) -> BTreeMap<String, String> {
        self.icons.lock().clone()
    }

    /// Sets (`Some`) or clears (`None`) the icon of one folder.
    pub fn set(&self, folder: &Path, icon: Option<&str>) -> AppResult<()> {
        let key = paths::display(folder);
        let mut icons = self.icons.lock();
        match icon {
            Some(name) if !is_icon_name(name) => return Err(AppError::invalid("Unknown icon")),
            Some(_) if !icons.contains_key(&key) && icons.len() >= MAX_ENTRIES => {
                return Err(AppError::invalid("Too many custom folder icons"));
            }
            Some(name) => {
                icons.insert(key, name.to_owned());
            }
            None => {
                icons.remove(&key);
            }
        }
        self.persist(&icons)
    }

    /// Re-keys or drops icons under a path that moved or was deleted. Returns whether
    /// anything changed.
    pub fn apply(&self, change: &PathChange) -> bool {
        let mut icons = self.icons.lock();
        let (root, replacement) = match change {
            PathChange::Moved { from, to } => (from, Some(to)),
            PathChange::Deleted(path) => (path, None),
        };
        let affected: Vec<String> = icons
            .keys()
            .filter(|key| Path::new(key).starts_with(root))
            .cloned()
            .collect();
        if affected.is_empty() {
            return false;
        }
        for key in affected {
            let Some(icon) = icons.remove(&key) else {
                continue;
            };
            if let Some(to) = replacement
                && let Ok(rest) = Path::new(&key).strip_prefix(root)
            {
                // `join("")` would add a trailing slash for the folder itself.
                let moved = if rest.as_os_str().is_empty() {
                    to.clone()
                } else {
                    to.join(rest)
                };
                icons.insert(paths::display(&moved), icon);
            }
        }
        if let Err(err) = self.persist(&icons) {
            log::warn!("could not save folder icons: {err}");
        }
        true
    }

    fn persist(&self, icons: &BTreeMap<String, String>) -> AppResult<()> {
        let Some(file) = &self.file else {
            return Ok(());
        };
        let dir = file
            .parent()
            .ok_or_else(|| AppError::invalid("Invalid data path"))?;
        DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)
            .map_err(|e| AppError::io(dir, e))?;
        let json =
            serde_json::to_vec_pretty(icons).map_err(|e| AppError::invalid(e.to_string()))?;
        let temp = file.with_extension("json.tmp");
        OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temp)
            .and_then(|mut out| out.write_all(&json))
            .map_err(|e| AppError::io(&temp, e))?;
        fs::rename(&temp, file).map_err(|e| AppError::io(file, e))
    }
}

/// Icon names from the icon theme: `folder-src`, `folder-node`, `folder-images`…
fn is_icon_name(name: &str) -> bool {
    name.len() <= MAX_ICON_NAME
        && name.starts_with("folder")
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, FolderIconStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = FolderIconStore::at(Some(dir.path().join("icons.json")));
        (dir, store)
    }

    #[test]
    fn sets_clears_and_persists() {
        let (dir, store) = store();
        store
            .set(Path::new("/home/me/src"), Some("folder-src"))
            .unwrap();
        let reloaded = FolderIconStore::at(Some(dir.path().join("icons.json")));
        assert_eq!(reloaded.all()["/home/me/src"], "folder-src");
        store.set(Path::new("/home/me/src"), None).unwrap();
        assert!(store.all().is_empty());
    }

    #[test]
    fn rejects_names_outside_the_folder_icon_set() {
        let (_dir, store) = store();
        for bad in ["../../x", "file", "folder src", "folder\"><script>"] {
            assert!(store.set(Path::new("/x"), Some(bad)).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn follows_moves_and_deletes_including_children() {
        let (_dir, store) = store();
        store.set(Path::new("/a/proj"), Some("folder-src")).unwrap();
        store
            .set(Path::new("/a/proj/docs"), Some("folder-docs"))
            .unwrap();
        store
            .set(Path::new("/a/project2"), Some("folder-app"))
            .unwrap();

        assert!(store.apply(&PathChange::Moved {
            from: "/a/proj".into(),
            to: "/b/renamed".into(),
        }));
        let all = store.all();
        assert_eq!(all["/b/renamed"], "folder-src");
        assert_eq!(all["/b/renamed/docs"], "folder-docs");
        // A sibling that merely shares a name prefix is untouched.
        assert_eq!(all["/a/project2"], "folder-app");

        assert!(store.apply(&PathChange::Deleted("/b/renamed".into())));
        assert_eq!(store.all().len(), 1);
        assert!(!store.apply(&PathChange::Deleted("/nothing".into())));
    }
}
