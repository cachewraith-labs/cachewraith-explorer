//! Details for the Properties dialog that a directory listing does not carry.

use std::fs;
use std::io;
use std::os::unix::fs::MetadataExt;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rustix::fs::Access;
use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::fs::{Entry, paths};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Properties {
    pub entry: Entry,
    /// Birth time, where the filesystem records it (ext4, btrfs, xfs do).
    pub created: Option<i64>,
    pub accessed: Option<i64>,
    pub owner: String,
    pub group: String,
    /// What the current user may do, checked with `access(2)`.
    pub readable: bool,
    pub writable: bool,
    pub symlink_target: Option<String>,
}

pub fn read(path: &Path) -> AppResult<Properties> {
    let entry = Entry::read(path)?;
    // Describe a link by its target when it resolves, else by the link itself.
    let meta = fs::metadata(path)
        .or_else(|_| fs::symlink_metadata(path))
        .map_err(|e| AppError::io(path, e))?;
    Ok(Properties {
        created: millis(meta.created()),
        accessed: millis(meta.accessed()),
        owner: name_for_id("/etc/passwd", meta.uid()),
        group: name_for_id("/etc/group", meta.gid()),
        readable: rustix::fs::access(path, Access::READ_OK).is_ok(),
        writable: rustix::fs::access(path, Access::WRITE_OK).is_ok(),
        symlink_target: entry
            .is_symlink
            .then(|| fs::read_link(path).ok())
            .flatten()
            .map(|target| paths::display(&target)),
        entry,
    })
}

fn millis(time: io::Result<SystemTime>) -> Option<i64> {
    time.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .and_then(|d| i64::try_from(d.as_millis()).ok())
}

/// Resolves a uid/gid from `/etc/passwd` or `/etc/group` (`name:x:id:…`). Accounts that
/// only exist in LDAP or systemd-homed show as the number.
fn name_for_id(database: &str, id: u32) -> String {
    fs::read_to_string(database)
        .ok()
        .and_then(|text| find_name(&text, id))
        .unwrap_or_else(|| id.to_string())
}

fn find_name(text: &str, id: u32) -> Option<String> {
    text.lines().find_map(|line| {
        let mut fields = line.split(':');
        let name = fields.next()?;
        let parsed: u32 = fields.nth(1)?.parse().ok()?;
        (parsed == id && !name.is_empty()).then(|| name.to_owned())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_names_by_id() {
        let passwd = "root:x:0:0::/root:/bin/bash\n# comment\nme:x:1000:1000::/home/me:/bin/fish\n";
        assert_eq!(find_name(passwd, 1000).as_deref(), Some("me"));
        assert_eq!(find_name(passwd, 0).as_deref(), Some("root"));
        assert_eq!(find_name(passwd, 42), None);
    }

    #[test]
    fn reads_file_and_symlink_properties() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("notes.txt");
        fs::write(&file, b"hello").unwrap();
        std::os::unix::fs::symlink(&file, dir.path().join("link")).unwrap();

        let props = read(&file).unwrap();
        assert!(props.readable && props.writable);
        assert_eq!(props.entry.size, 5);
        assert!(props.accessed.is_some());

        let link = read(&dir.path().join("link")).unwrap();
        assert_eq!(
            link.symlink_target.as_deref(),
            Some(paths::display(&file).as_str())
        );
    }
}
