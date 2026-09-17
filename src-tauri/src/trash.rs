//! The freedesktop trash (`~/.local/share/Trash`), listed as ordinary entries so the
//! normal views can show it.

use std::collections::HashSet;
use std::path::Path;

use trash::os_limited;
use trash::{TrashItem, TrashItemSize};

use crate::error::AppResult;
use crate::fs::{Entry, EntryKind, paths};

pub fn list() -> AppResult<Vec<Entry>> {
    let mut items = os_limited::list()?;
    items.sort_by_key(|item| std::cmp::Reverse(item.time_deleted));
    Ok(items.iter().map(to_entry).collect())
}

pub fn restore(ids: &[String]) -> AppResult<()> {
    let items = select(ids)?;
    if !items.is_empty() {
        os_limited::restore_all(items)?;
    }
    Ok(())
}

pub fn purge(ids: &[String]) -> AppResult<()> {
    let items = select(ids)?;
    if !items.is_empty() {
        os_limited::purge_all(items)?;
    }
    Ok(())
}

pub fn empty() -> AppResult<()> {
    let items = os_limited::list()?;
    if !items.is_empty() {
        os_limited::purge_all(items)?;
    }
    Ok(())
}

/// Resolves ids against a fresh listing, so only items that really are in the trash can
/// be restored or purged.
fn select(ids: &[String]) -> AppResult<Vec<TrashItem>> {
    let wanted: HashSet<&str> = ids.iter().map(String::as_str).collect();
    Ok(os_limited::list()?
        .into_iter()
        .filter(|item| wanted.contains(item.id.to_string_lossy().as_ref()))
        .collect())
}

fn to_entry(item: &TrashItem) -> Entry {
    let name = item.name.to_string_lossy().into_owned();
    let (kind, size) = match os_limited::metadata(item).map(|m| m.size) {
        Ok(TrashItemSize::Bytes(bytes)) => (EntryKind::File, bytes),
        Ok(TrashItemSize::Entries(_)) => (EntryKind::Dir, 0),
        Err(_) => (EntryKind::Other, 0),
    };
    Entry {
        extension: (kind == EntryKind::File)
            .then(|| Path::new(&name).extension())
            .flatten()
            .map(|e| e.to_string_lossy().to_lowercase()),
        is_hidden: name.starts_with('.'),
        path: paths::display(&item.original_path()),
        name,
        kind,
        is_symlink: false,
        size,
        modified: Some(item.time_deleted.saturating_mul(1000)),
        mode: 0,
        trash_id: Some(item.id.to_string_lossy().into_owned()),
    }
}
