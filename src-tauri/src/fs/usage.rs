//! Total size of folders, counted in the background with live progress.

use std::collections::HashSet;
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(150);

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    /// Apparent size: the sum of file lengths.
    pub bytes: u64,
    /// Space actually allocated (sparse files use less, small files round up to blocks).
    pub disk_bytes: u64,
    pub files: u64,
    /// Folders inside the measured items (the items themselves are not counted).
    pub folders: u64,
    /// Entries that could not be read; the totals are then a lower bound.
    pub unreadable: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UsageEvent {
    Progress { usage: Usage },
    Done { usage: Usage },
}

/// Measures `roots` like `du -x`: symlinks are not followed, hard-linked files count once,
/// and other filesystems mounted inside (e.g. `/proc` under `/`, a drive under home) are
/// skipped. Stops when `cancelled` is set or `emit` returns `false`.
pub fn measure(roots: &[PathBuf], cancelled: &AtomicBool, emit: &dyn Fn(UsageEvent) -> bool) {
    let mut usage = Usage::default();
    let mut seen_links = HashSet::new();
    let mut last_progress = Instant::now();
    // (path, device of the root it belongs to; None for the root itself)
    let mut stack: Vec<(PathBuf, Option<u64>)> =
        roots.iter().map(|root| (root.clone(), None)).collect();

    while let Some((path, root_device)) = stack.pop() {
        if cancelled.load(Ordering::Relaxed) {
            return;
        }
        let Ok(meta) = fs::symlink_metadata(&path) else {
            usage.unreadable += 1;
            continue;
        };
        let device = root_device.unwrap_or(meta.dev());
        if meta.dev() != device {
            continue;
        }

        if meta.is_dir() {
            if root_device.is_some() {
                usage.folders += 1;
            }
            match fs::read_dir(&path) {
                Ok(children) => {
                    for child in children.filter_map(Result::ok) {
                        stack.push((child.path(), Some(device)));
                    }
                }
                Err(_) => usage.unreadable += 1,
            }
        } else if meta.nlink() <= 1 || seen_links.insert((meta.dev(), meta.ino())) {
            usage.files += 1;
            usage.bytes += meta.len();
            usage.disk_bytes += meta.blocks().saturating_mul(512);
        }

        if last_progress.elapsed() >= PROGRESS_INTERVAL {
            if !emit(UsageEvent::Progress { usage }) {
                return;
            }
            last_progress = Instant::now();
        }
    }
    emit(UsageEvent::Done { usage });
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    fn run(roots: &[PathBuf]) -> Usage {
        let result = Mutex::new(None);
        measure(roots, &AtomicBool::new(false), &|event| {
            if let UsageEvent::Done { usage } = event {
                *result.lock().unwrap() = Some(usage);
            }
            true
        });
        result
            .into_inner()
            .unwrap()
            .expect("measure always finishes")
    }

    #[test]
    fn counts_nested_files_once_and_skips_symlink_targets() {
        let root = tempfile::tempdir().unwrap();
        let project = root.path().join("project");
        fs::create_dir_all(project.join("src/deep")).unwrap();
        fs::write(project.join("a.bin"), vec![0u8; 1000]).unwrap();
        fs::write(project.join("src/deep/b.bin"), vec![0u8; 24]).unwrap();
        fs::hard_link(project.join("a.bin"), project.join("a-again.bin")).unwrap();
        std::os::unix::fs::symlink("/usr", project.join("usr-link")).unwrap();

        let usage = run(&[project]);
        assert_eq!(usage.folders, 2); // src, deep
        assert_eq!(usage.files, 3); // a.bin (once), b.bin, the symlink itself
        assert_eq!(usage.bytes, 1000 + 24 + "/usr".len() as u64);
        assert_eq!(usage.unreadable, 0);
    }

    #[test]
    fn measures_several_roots_together() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("x"), vec![0u8; 10]).unwrap();
        fs::write(root.path().join("y"), vec![0u8; 5]).unwrap();
        let usage = run(&[root.path().join("x"), root.path().join("y")]);
        assert_eq!((usage.files, usage.bytes), (2, 15));
    }

    #[test]
    fn stops_when_cancelled() {
        let root = tempfile::tempdir().unwrap();
        let finished = AtomicBool::new(false);
        measure(
            &[root.path().to_path_buf()],
            &AtomicBool::new(true),
            &|event| {
                finished.store(matches!(event, UsageEvent::Done { .. }), Ordering::SeqCst);
                true
            },
        );
        assert!(!finished.load(Ordering::SeqCst));
    }
}
