use std::fs;
use std::path::{Path, PathBuf};

use rustix::fs::{CWD, RenameFlags, renameat_with};
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::fs::entry::Entry;
use crate::fs::paths;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub path: String,
    pub entries: Vec<Entry>,
}

/// Lists a directory. Hidden files are always included; the UI filters them so toggling
/// is instant. Entries that vanish between `readdir` and `stat` are skipped.
pub fn list_dir(dir: &Path) -> AppResult<Listing> {
    let read = fs::read_dir(dir).map_err(|e| AppError::io(dir, e))?;
    let entries = read
        .filter_map(Result::ok)
        .filter_map(|item| Entry::read(&item.path()).ok())
        .collect();
    Ok(Listing {
        path: paths::display(dir),
        entries,
    })
}

/// Number of direct children, for the preview panel. Stops counting at `cap`.
pub fn child_count(dir: &Path, cap: usize) -> AppResult<usize> {
    let read = fs::read_dir(dir).map_err(|e| AppError::io(dir, e))?;
    Ok(read.take(cap).count())
}

pub fn create_dir(parent: &Path, name: &str) -> AppResult<Entry> {
    let target = parent.join(paths::validate_name(name)?);
    // `create_dir` fails if anything already exists there, so nothing is overwritten.
    fs::create_dir(&target).map_err(|e| AppError::io(&target, e))?;
    Entry::read(&target)
}

/// Renames in place. Uses `renameat2(RENAME_NOREPLACE)`, so an existing file with the new
/// name is never replaced, even if it appears between a check and the rename.
pub fn rename(source: &Path, new_name: &str) -> AppResult<Entry> {
    let parent = source
        .parent()
        .ok_or_else(|| AppError::invalid("Cannot rename the root directory"))?;
    let target: PathBuf = parent.join(paths::validate_name(new_name)?);
    if target == source {
        return Entry::read(source);
    }
    renameat_with(CWD, source, CWD, &target, RenameFlags::NOREPLACE)
        .map_err(|errno| AppError::io(&target, errno.into()))?;
    Entry::read(&target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rename_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.txt");
        fs::write(&a, b"a").unwrap();
        fs::write(dir.path().join("b.txt"), b"b").unwrap();

        let err = rename(&a, "b.txt").unwrap_err();
        assert!(matches!(err, AppError::AlreadyExists { .. }));
        assert_eq!(fs::read(dir.path().join("b.txt")).unwrap(), b"b");

        let renamed = rename(&a, "c.txt").unwrap();
        assert_eq!(renamed.name, "c.txt");
        assert!(!a.exists());
    }

    #[test]
    fn create_dir_rejects_bad_names_and_existing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(create_dir(dir.path(), "../escape").is_err());
        create_dir(dir.path(), "new").unwrap();
        assert!(matches!(
            create_dir(dir.path(), "new").unwrap_err(),
            AppError::AlreadyExists { .. }
        ));
    }

    #[test]
    fn lists_including_hidden() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(".dot"), b"").unwrap();
        fs::write(dir.path().join("plain"), b"").unwrap();
        let listing = list_dir(dir.path()).unwrap();
        assert_eq!(listing.entries.len(), 2);
    }
}
