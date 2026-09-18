use serde::{Deserialize, Serialize};

pub use crate::jobs::archive::ArchiveFormat;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobKind {
    Copy,
    Move,
    Trash,
    Delete,
    /// Packs the sources into one archive in `destination`.
    Compress,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRequest {
    pub kind: JobKind,
    pub sources: Vec<String>,
    /// Target directory; required for copy, move and compress.
    pub destination: Option<String>,
    /// Archive format; required for compress.
    #[serde(default)]
    pub format: Option<ArchiveFormat>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Paused,
    Completed,
    Failed,
    Cancelled,
}

impl JobStatus {
    pub fn is_finished(self) -> bool {
        matches!(self, Self::Completed | Self::Failed | Self::Cancelled)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSnapshot {
    pub id: u64,
    pub kind: JobKind,
    pub status: JobStatus,
    pub sources: Vec<String>,
    pub destination: Option<String>,
    pub format: Option<ArchiveFormat>,
    pub bytes_total: u64,
    pub bytes_done: u64,
    pub items_total: u64,
    pub items_done: u64,
    pub bytes_per_second: u64,
    /// The item being processed right now.
    pub current: Option<String>,
    pub error: Option<String>,
}
