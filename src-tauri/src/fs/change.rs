use std::path::PathBuf;
use std::sync::Arc;

/// A path this app moved, renamed or permanently deleted. Anything that keeps data keyed
/// by path (custom folder icons, today) subscribes to these.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathChange {
    Moved { from: PathBuf, to: PathBuf },
    Deleted(PathBuf),
}

/// Receives path changes. Pattern: Observer, as a shared callback.
pub type PathChangeSink = Arc<dyn Fn(&PathChange) + Send + Sync>;
