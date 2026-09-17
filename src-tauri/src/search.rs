//! Recursive filename search, streamed back in batches and cancellable.

use std::collections::VecDeque;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::fs::Entry;

const MAX_RESULTS: usize = 5_000;
const BATCH_SIZE: usize = 64;
const BATCH_INTERVAL: Duration = Duration::from_millis(120);
/// Virtual filesystems: huge, slow, and never what someone searching for a file wants.
const SKIPPED_ROOTS: &[&str] = &["/proc", "/sys", "/dev", "/run/user"];

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SearchEvent {
    Batch {
        entries: Vec<Entry>,
    },
    #[serde(rename_all = "camelCase")]
    Done {
        truncated: bool,
        scanned: u64,
    },
}

pub struct SearchQuery {
    pub root: PathBuf,
    pub terms: Vec<String>,
    pub include_hidden: bool,
}

impl SearchQuery {
    pub fn new(root: PathBuf, text: &str, include_hidden: bool) -> Self {
        Self {
            root,
            terms: text.split_whitespace().map(str::to_lowercase).collect(),
            include_hidden,
        }
    }

    fn matches(&self, name: &str) -> bool {
        let name = name.to_lowercase();
        self.terms.iter().all(|term| name.contains(term))
    }
}

/// Walks `query.root` breadth-first, emitting batches of matches. Stops when `cancelled`
/// is set or `emit` returns `false` (the receiver is gone).
pub fn run(query: &SearchQuery, cancelled: &AtomicBool, emit: &dyn Fn(SearchEvent) -> bool) {
    let mut queue = VecDeque::from([query.root.clone()]);
    let mut batch = Vec::new();
    let mut found = 0usize;
    let mut scanned = 0u64;
    let mut last_flush = Instant::now();

    'walk: while let Some(dir) = queue.pop_front() {
        let Ok(read) = fs::read_dir(&dir) else {
            continue;
        };
        for item in read.filter_map(Result::ok) {
            if cancelled.load(Ordering::Relaxed) {
                return;
            }
            scanned += 1;
            let name = item.file_name().to_string_lossy().into_owned();
            if !query.include_hidden && name.starts_with('.') {
                continue;
            }
            let path = item.path();
            // `file_type` does not follow symlinks, so linked folders are never descended
            // into and cycles are impossible.
            if item.file_type().is_ok_and(|t| t.is_dir())
                && !SKIPPED_ROOTS.iter().any(|root| path.as_os_str() == *root)
            {
                queue.push_back(path.clone());
            }
            if query.matches(&name)
                && let Ok(entry) = Entry::read(&path)
            {
                batch.push(entry);
                found += 1;
                if found >= MAX_RESULTS {
                    break 'walk;
                }
            }
            if batch.len() >= BATCH_SIZE
                || (!batch.is_empty() && last_flush.elapsed() >= BATCH_INTERVAL)
            {
                if !emit(SearchEvent::Batch {
                    entries: std::mem::take(&mut batch),
                }) {
                    return;
                }
                last_flush = Instant::now();
            }
        }
    }
    if !batch.is_empty() && !emit(SearchEvent::Batch { entries: batch }) {
        return;
    }
    emit(SearchEvent::Done {
        truncated: found >= MAX_RESULTS,
        scanned,
    });
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::channel;

    use super::*;

    #[test]
    fn finds_nested_matches_and_skips_hidden() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("a/b")).unwrap();
        fs::create_dir(root.path().join(".secret")).unwrap();
        fs::write(root.path().join("a/b/Invoice 2026.pdf"), b"").unwrap();
        fs::write(root.path().join(".secret/invoice.pdf"), b"").unwrap();

        let (tx, rx) = channel();
        let query = SearchQuery::new(root.path().to_path_buf(), "invoice PDF", false);
        run(&query, &AtomicBool::new(false), &move |event| {
            tx.send(event).is_ok()
        });

        let mut names = Vec::new();
        for event in &rx {
            match event {
                SearchEvent::Batch { entries } => names.extend(entries.into_iter().map(|e| e.name)),
                SearchEvent::Done { truncated, .. } => {
                    assert!(!truncated);
                    break;
                }
            }
        }
        assert_eq!(names, ["Invoice 2026.pdf"]);
    }
}
