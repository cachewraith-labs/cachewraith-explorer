//! Long-running file operations.
//!
//! Pattern: **Command** + **Observer**. A `JobRequest` is a queued command; the
//! `JobManager` runs it on a worker lane and publishes every state change as a
//! `JobSnapshot` through a sink (the Tauri event bus in the app, a closure in tests).
//! The job kinds are a closed set, so they are an enum dispatched with `match`
//! rather than a trait-object hierarchy.

mod archive;
mod control;
mod manager;
mod model;
mod progress;
mod transfer;

pub use manager::{JobManager, Sink};
pub use model::{ArchiveFormat, JobRequest, JobSnapshot};
