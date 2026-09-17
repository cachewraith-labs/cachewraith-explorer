//! Watches the folders open in any tab (non-recursively) and reports which ones changed.

use std::collections::{BTreeSet, HashSet};
use std::path::PathBuf;
use std::time::Duration;

use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{DebounceEventResult, Debouncer, RecommendedCache, new_debouncer};
use parking_lot::Mutex;

use crate::fs::paths;

const DEBOUNCE: Duration = Duration::from_millis(250);

pub struct DirWatcher {
    inner: Mutex<Inner>,
}

struct Inner {
    debouncer: Debouncer<RecommendedWatcher, RecommendedCache>,
    watched: HashSet<PathBuf>,
}

impl DirWatcher {
    /// `on_change` receives each changed directory once per debounce window.
    pub fn new(
        on_change: impl Fn(Vec<String>) + Send + 'static,
    ) -> notify_debouncer_full::notify::Result<Self> {
        let debouncer = new_debouncer(DEBOUNCE, None, move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let mut dirs = BTreeSet::new();
            for path in events.iter().flat_map(|event| event.paths.iter()) {
                // A child changed → its folder; a watched folder itself changed → itself.
                dirs.insert(paths::display(path));
                if let Some(parent) = path.parent() {
                    dirs.insert(paths::display(parent));
                }
            }
            if !dirs.is_empty() {
                on_change(dirs.into_iter().collect());
            }
        })?;
        Ok(Self {
            inner: Mutex::new(Inner {
                debouncer,
                watched: HashSet::new(),
            }),
        })
    }

    /// Replaces the watched set. Folders that cannot be watched (gone, no permission) are
    /// skipped; the listing itself reports those errors.
    pub fn set(&self, dirs: Vec<PathBuf>) {
        let wanted: HashSet<PathBuf> = dirs.into_iter().collect();
        let mut inner = self.inner.lock();
        let stale: Vec<PathBuf> = inner.watched.difference(&wanted).cloned().collect();
        for dir in stale {
            let _ = inner.debouncer.unwatch(&dir);
            inner.watched.remove(&dir);
        }
        let fresh: Vec<PathBuf> = wanted.difference(&inner.watched).cloned().collect();
        for dir in fresh {
            if inner
                .debouncer
                .watch(&dir, RecursiveMode::NonRecursive)
                .is_ok()
            {
                inner.watched.insert(dir);
            }
        }
    }
}
