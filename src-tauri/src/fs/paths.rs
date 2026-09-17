//! Validation for every path and file name that crosses the IPC boundary.
//!
//! The webview is treated as untrusted input: paths must be absolute and free of NUL
//! bytes, and are normalized lexically so `..` cannot smuggle a different target past a
//! later check. Names must be a single path component.

use std::ffi::OsStr;
use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppResult};

/// Linux `NAME_MAX` for ext4, btrfs, xfs and most others.
const NAME_MAX_BYTES: usize = 255;

/// Parses a path from the frontend into an absolute, lexically normalized `PathBuf`.
pub fn parse_absolute(raw: &str) -> AppResult<PathBuf> {
    if raw.is_empty() || raw.contains('\0') {
        return Err(AppError::invalid("Invalid path"));
    }
    let path = Path::new(raw);
    if !path.is_absolute() {
        return Err(AppError::invalid(format!("Path must be absolute: {raw}")));
    }
    Ok(normalize(path))
}

pub fn parse_all(raw: &[String]) -> AppResult<Vec<PathBuf>> {
    raw.iter().map(|p| parse_absolute(p)).collect()
}

/// Resolves `.` and `..` without touching the filesystem (so symlinks are not followed).
pub fn normalize(path: &Path) -> PathBuf {
    let mut out = PathBuf::from("/");
    for component in path.components() {
        match component {
            Component::Normal(part) => out.push(part),
            Component::ParentDir => {
                out.pop();
            }
            Component::RootDir | Component::CurDir | Component::Prefix(_) => {}
        }
    }
    out
}

/// Checks that `name` is usable as one file name inside a directory.
pub fn validate_name(name: &str) -> AppResult<&str> {
    if name.trim().is_empty() {
        return Err(AppError::invalid("Name cannot be empty"));
    }
    if name == "." || name == ".." {
        return Err(AppError::invalid("Name cannot be \".\" or \"..\""));
    }
    if name.contains('/') || name.contains('\0') {
        return Err(AppError::invalid("Name cannot contain \"/\""));
    }
    if name.len() > NAME_MAX_BYTES {
        return Err(AppError::invalid("Name is too long"));
    }
    Ok(name)
}

/// Returns `dir/name`, or `dir/name (2)`, `dir/name (3)`… for the first one that does not
/// exist yet. The extension stays at the end: `photo (2).jpg`.
///
/// This only picks a candidate; callers still create it with a no-overwrite primitive, so
/// a race can fail loudly but never clobber a file.
pub fn unique_destination(dir: &Path, name: &OsStr) -> PathBuf {
    let first = dir.join(name);
    if first.symlink_metadata().is_err() {
        return first;
    }
    let as_path = Path::new(name);
    let (stem, ext) = match (as_path.file_stem(), as_path.extension()) {
        // Dotfiles like `.bashrc` have a stem and no extension, which is what we want.
        (Some(stem), ext) => (stem.to_string_lossy(), ext.map(|e| e.to_string_lossy())),
        (None, _) => (name.to_string_lossy(), None),
    };
    let mut n: u64 = 2;
    loop {
        let candidate = match &ext {
            Some(ext) => dir.join(format!("{stem} ({n}).{ext}")),
            None => dir.join(format!("{stem} ({n})")),
        };
        if candidate.symlink_metadata().is_err() {
            return candidate;
        }
        n += 1;
    }
}

pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_empty_and_nul_paths() {
        assert!(parse_absolute("").is_err());
        assert!(parse_absolute("relative/dir").is_err());
        assert!(parse_absolute("/tmp/a\0b").is_err());
    }

    #[test]
    fn normalizes_dot_segments_lexically() {
        assert_eq!(
            parse_absolute("/home/u/./a/../b").unwrap(),
            PathBuf::from("/home/u/b")
        );
        assert_eq!(parse_absolute("/../../etc").unwrap(), PathBuf::from("/etc"));
    }

    #[test]
    fn validates_names() {
        assert!(validate_name("notes.txt").is_ok());
        assert!(validate_name(".config").is_ok());
        for bad in ["", "   ", ".", "..", "a/b", "a\0b"] {
            assert!(validate_name(bad).is_err(), "{bad:?} should be rejected");
        }
        assert!(validate_name(&"x".repeat(256)).is_err());
    }

    #[test]
    fn picks_unique_destination_keeping_extension() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("photo.jpg"), b"").unwrap();
        std::fs::write(dir.path().join("photo (2).jpg"), b"").unwrap();
        std::fs::create_dir(dir.path().join("folder")).unwrap();

        let photo = unique_destination(dir.path(), OsStr::new("photo.jpg"));
        assert_eq!(photo.file_name().unwrap(), "photo (3).jpg");
        let folder = unique_destination(dir.path(), OsStr::new("folder"));
        assert_eq!(folder.file_name().unwrap(), "folder (2)");
        let free = unique_destination(dir.path(), OsStr::new("new.txt"));
        assert_eq!(free.file_name().unwrap(), "new.txt");
    }
}
