use std::fs::{self, Metadata};
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::fs::paths;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Dir,
    File,
    /// Sockets, FIFOs, devices, and symlinks whose target is gone.
    Other,
}

/// One row in a listing, as the frontend sees it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub kind: EntryKind,
    pub is_symlink: bool,
    pub is_hidden: bool,
    /// Bytes for files; 0 for directories (their size is not computed on listing).
    pub size: u64,
    /// Milliseconds since the Unix epoch.
    pub modified: Option<i64>,
    /// Unix permission bits (`0o644`).
    pub mode: u32,
    /// Lowercased extension without the dot, files only.
    pub extension: Option<String>,
    /// Set only for entries listed from the trash.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trash_id: Option<String>,
}

impl Entry {
    /// Reads one path. Symlinks are described by their target, but flagged, and a broken
    /// link is still listed (as `Other`) instead of failing the whole directory.
    pub fn read(path: &Path) -> AppResult<Self> {
        let link_meta = fs::symlink_metadata(path).map_err(|e| AppError::io(path, e))?;
        let is_symlink = link_meta.file_type().is_symlink();
        let meta = if is_symlink {
            fs::metadata(path).unwrap_or(link_meta)
        } else {
            link_meta
        };
        let name = path.file_name().map_or_else(
            || paths::display(path),
            |n| n.to_string_lossy().into_owned(),
        );
        Ok(Self::from_metadata(
            name,
            paths::display(path),
            is_symlink,
            &meta,
        ))
    }

    pub fn from_metadata(name: String, path: String, is_symlink: bool, meta: &Metadata) -> Self {
        let kind = if meta.is_dir() {
            EntryKind::Dir
        } else if meta.is_file() {
            EntryKind::File
        } else {
            EntryKind::Other
        };
        let extension = (kind == EntryKind::File)
            .then(|| Path::new(&name).extension())
            .flatten()
            .map(|ext| ext.to_string_lossy().to_lowercase());
        Self {
            is_hidden: name.starts_with('.'),
            size: if kind == EntryKind::File {
                meta.len()
            } else {
                0
            },
            modified: meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .and_then(|d| i64::try_from(d.as_millis()).ok()),
            mode: meta.mode() & 0o7777,
            name,
            path,
            kind,
            is_symlink,
            extension,
            trash_id: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_files_dirs_and_broken_links() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("Report.PDF");
        fs::write(&file, b"hello").unwrap();
        fs::create_dir(dir.path().join(".hidden")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("gone"), dir.path().join("dangling")).unwrap();

        let entry = Entry::read(&file).unwrap();
        assert_eq!(entry.kind, EntryKind::File);
        assert_eq!(entry.size, 5);
        assert_eq!(entry.extension.as_deref(), Some("pdf"));

        let hidden = Entry::read(&dir.path().join(".hidden")).unwrap();
        assert!(hidden.is_hidden);
        assert_eq!(hidden.kind, EntryKind::Dir);

        let dangling = Entry::read(&dir.path().join("dangling")).unwrap();
        assert!(dangling.is_symlink);
        assert_eq!(dangling.kind, EntryKind::Other);
    }
}
