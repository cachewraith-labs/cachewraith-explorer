use std::collections::HashMap;
use std::fs;
use std::os::unix::fs::MetadataExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::thread;

use parking_lot::Mutex;

use crate::error::{AppError, AppResult};
use crate::fs::{PathChangeSink, paths};
use crate::jobs::control::JobControl;
use crate::jobs::model::{JobKind, JobRequest, JobSnapshot, JobStatus};
use crate::jobs::progress::RunContext;
use crate::jobs::transfer;

/// Receives every snapshot change. In the app this emits a Tauri event.
pub type Sink = Arc<dyn Fn(&JobSnapshot) + Send + Sync>;

pub struct JobRecord {
    pub control: JobControl,
    pub snapshot: Mutex<JobSnapshot>,
    request_sources: Vec<PathBuf>,
    request_destination: Option<PathBuf>,
}

/// Two lanes, each a single worker thread with a FIFO queue:
/// - `bulk` moves bytes (copies, cross-device moves) — one at a time so parallel copies do
///   not fight over the same disk;
/// - `quick` does metadata-only work (trash, delete, same-device moves) so deleting a file
///   never waits behind a 40 GB copy.
pub struct JobManager {
    next_id: AtomicU64,
    jobs: Arc<Mutex<HashMap<u64, Arc<JobRecord>>>>,
    bulk: Sender<Arc<JobRecord>>,
    quick: Sender<Arc<JobRecord>>,
    sink: Sink,
}

impl JobManager {
    /// `sink` receives every snapshot; `on_path_change` every completed move or delete.
    pub fn new(sink: Sink, on_path_change: PathChangeSink) -> Self {
        let jobs = Arc::new(Mutex::new(HashMap::new()));
        Self {
            next_id: AtomicU64::new(1),
            bulk: spawn_lane(
                "jobs-bulk",
                Arc::clone(&jobs),
                Arc::clone(&sink),
                Arc::clone(&on_path_change),
            ),
            quick: spawn_lane(
                "jobs-quick",
                Arc::clone(&jobs),
                Arc::clone(&sink),
                on_path_change,
            ),
            jobs,
            sink,
        }
    }

    pub fn enqueue(&self, request: JobRequest) -> AppResult<JobSnapshot> {
        let sources = paths::parse_all(&request.sources)?;
        if sources.is_empty() {
            return Err(AppError::invalid("Nothing selected"));
        }
        let destination = request
            .destination
            .as_deref()
            .map(paths::parse_absolute)
            .transpose()?;
        validate(request.kind, &sources, destination.as_deref())?;

        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let snapshot = JobSnapshot {
            id,
            kind: request.kind,
            status: JobStatus::Queued,
            sources: request.sources,
            destination: request.destination,
            bytes_total: 0,
            bytes_done: 0,
            items_total: 0,
            items_done: 0,
            bytes_per_second: 0,
            current: None,
            error: None,
        };
        let quick = is_quick(request.kind, &sources, destination.as_deref());
        let record = Arc::new(JobRecord {
            control: JobControl::default(),
            snapshot: Mutex::new(snapshot.clone()),
            request_sources: sources,
            request_destination: destination,
        });
        self.jobs.lock().insert(id, Arc::clone(&record));
        (self.sink)(&snapshot);

        let lane = if quick { &self.quick } else { &self.bulk };
        lane.send(record)
            .map_err(|_| AppError::invalid("The job worker has stopped"))?;
        Ok(snapshot)
    }

    pub fn pause(&self, id: u64) {
        self.set_paused(id, true);
    }

    pub fn resume(&self, id: u64) {
        self.set_paused(id, false);
    }

    pub fn cancel(&self, id: u64) {
        if let Some(record) = self.jobs.lock().get(&id) {
            record.control.cancel();
        }
    }

    /// Jobs that are queued, running, or paused.
    pub fn list(&self) -> Vec<JobSnapshot> {
        let mut list: Vec<_> = self
            .jobs
            .lock()
            .values()
            .map(|r| r.snapshot.lock().clone())
            .collect();
        list.sort_by_key(|s| s.id);
        list
    }

    fn set_paused(&self, id: u64, paused: bool) {
        let Some(record) = self.jobs.lock().get(&id).cloned() else {
            return;
        };
        let snapshot = {
            let mut snap = record.snapshot.lock();
            if snap.status.is_finished() || snap.kind != JobKind::Copy && snap.kind != JobKind::Move
            {
                return;
            }
            if snap.status == JobStatus::Running || snap.status == JobStatus::Paused {
                snap.status = if paused {
                    JobStatus::Paused
                } else {
                    JobStatus::Running
                };
            }
            snap.clone()
        };
        record.control.set_paused(paused);
        (self.sink)(&snapshot);
    }
}

fn spawn_lane(
    name: &str,
    jobs: Arc<Mutex<HashMap<u64, Arc<JobRecord>>>>,
    sink: Sink,
    on_path_change: PathChangeSink,
) -> Sender<Arc<JobRecord>> {
    let (tx, rx) = mpsc::channel::<Arc<JobRecord>>();
    thread::Builder::new()
        .name(name.to_owned())
        .spawn(move || {
            for record in rx {
                run(&record, &sink, &on_path_change);
                let id = record.snapshot.lock().id;
                jobs.lock().remove(&id);
            }
        })
        .expect("failed to spawn job worker thread");
    tx
}

fn run(record: &Arc<JobRecord>, sink: &Sink, on_path_change: &PathChangeSink) {
    if record.control.is_cancelled() {
        finish(record, sink, Err(AppError::Cancelled));
        return;
    }
    let started = {
        let mut snap = record.snapshot.lock();
        snap.status = JobStatus::Running;
        snap.clone()
    };
    sink(&started);

    let mut ctx = RunContext::new(Arc::clone(record), Arc::clone(sink));
    let sources = &record.request_sources;
    let destination = record.request_destination.as_deref();
    let kind = record.snapshot.lock().kind;
    let result = match (kind, destination) {
        (JobKind::Copy, Some(dest)) => transfer::copy_into(sources, dest, &mut ctx),
        (JobKind::Move, Some(dest)) => transfer::move_into(sources, dest, &mut ctx),
        (JobKind::Trash, _) => transfer::trash(sources, &mut ctx),
        (JobKind::Delete, _) => transfer::delete(sources, &mut ctx),
        (JobKind::Copy | JobKind::Move, None) => Err(AppError::invalid("Missing destination")),
    };
    // Also after a failure or cancel: whatever did move, moved.
    for change in ctx.take_changes() {
        on_path_change(&change);
    }
    finish(record, sink, result);
}

fn finish(record: &JobRecord, sink: &Sink, result: AppResult<()>) {
    let snapshot = {
        let mut snap = record.snapshot.lock();
        snap.current = None;
        snap.bytes_per_second = 0;
        match result {
            Ok(()) => snap.status = JobStatus::Completed,
            Err(AppError::Cancelled) => snap.status = JobStatus::Cancelled,
            Err(err) => {
                log::warn!("job {} failed: {err}", snap.id);
                snap.status = JobStatus::Failed;
                snap.error = Some(err.to_string());
            }
        }
        snap.clone()
    };
    sink(&snapshot);
}

fn validate(kind: JobKind, sources: &[PathBuf], destination: Option<&Path>) -> AppResult<()> {
    let home = dirs::home_dir();
    for source in sources {
        if source == Path::new("/") || Some(source) == home.as_ref() {
            return Err(AppError::invalid(format!(
                "Refusing to modify {}",
                source.display()
            )));
        }
    }
    match (kind, destination) {
        (JobKind::Copy | JobKind::Move, None) => {
            Err(AppError::invalid("Choose a destination folder"))
        }
        _ => Ok(()),
    }
}

/// A job is quick when it only touches metadata.
fn is_quick(kind: JobKind, sources: &[PathBuf], destination: Option<&Path>) -> bool {
    match (kind, destination) {
        (JobKind::Trash | JobKind::Delete, _) => true,
        (JobKind::Move, Some(dest)) => {
            let Ok(dest_dev) = fs::metadata(dest).map(|m| m.dev()) else {
                return false;
            };
            sources
                .iter()
                .all(|s| fs::symlink_metadata(s).is_ok_and(|m| m.dev() == dest_dev))
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::{Receiver, channel};
    use std::time::Duration;

    use super::*;

    fn manager() -> (JobManager, Receiver<JobSnapshot>) {
        let (tx, rx) = channel();
        let tx = Mutex::new(tx);
        let sink: Sink = Arc::new(move |snap: &JobSnapshot| {
            let _ = tx.lock().send(snap.clone());
        });
        (JobManager::new(sink, Arc::new(|_| {})), rx)
    }

    fn wait_finished(rx: &Receiver<JobSnapshot>, id: u64) -> JobSnapshot {
        loop {
            let snap = rx
                .recv_timeout(Duration::from_secs(10))
                .expect("job did not finish");
            if snap.id == id && snap.status.is_finished() {
                return snap;
            }
        }
    }

    fn request(kind: JobKind, sources: &[&Path], destination: Option<&Path>) -> JobRequest {
        JobRequest {
            kind,
            sources: sources
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect(),
            destination: destination.map(|d| d.to_string_lossy().into_owned()),
        }
    }

    #[test]
    fn copies_tree_with_symlinks_and_renames_on_conflict() {
        let root = tempfile::tempdir().unwrap();
        let src = root.path().join("src");
        let dest = root.path().join("dest");
        fs::create_dir_all(src.join("nested")).unwrap();
        fs::create_dir(&dest).unwrap();
        fs::write(src.join("nested/big.bin"), vec![7u8; 3 * 1024 * 1024 + 11]).unwrap();
        std::os::unix::fs::symlink("nested/big.bin", src.join("link")).unwrap();
        fs::create_dir(dest.join("src")).unwrap(); // conflict

        let (jobs, rx) = manager();
        let snap = jobs
            .enqueue(request(JobKind::Copy, &[&src], Some(&dest)))
            .unwrap();
        let done = wait_finished(&rx, snap.id);

        assert_eq!(done.status, JobStatus::Completed, "{:?}", done.error);
        let copied = dest.join("src (2)");
        assert_eq!(
            fs::read(copied.join("nested/big.bin")).unwrap().len(),
            3 * 1024 * 1024 + 11
        );
        assert!(
            fs::symlink_metadata(copied.join("link"))
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(done.items_done, done.items_total);
        assert_eq!(done.bytes_done, done.bytes_total);
    }

    #[test]
    fn refuses_to_copy_a_folder_into_itself() {
        let root = tempfile::tempdir().unwrap();
        let inner = root.path().join("a/b");
        fs::create_dir_all(&inner).unwrap();

        let (jobs, rx) = manager();
        let snap = jobs
            .enqueue(request(
                JobKind::Copy,
                &[&root.path().join("a")],
                Some(&inner),
            ))
            .unwrap();
        let done = wait_finished(&rx, snap.id);
        assert_eq!(done.status, JobStatus::Failed);
        assert!(!inner.join("a").exists());
    }

    #[test]
    fn moves_within_a_device_and_deletes() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("file.txt");
        let dest = root.path().join("dest");
        fs::write(&file, b"x").unwrap();
        fs::create_dir(&dest).unwrap();

        let (jobs, rx) = manager();
        let moved = jobs
            .enqueue(request(JobKind::Move, &[&file], Some(&dest)))
            .unwrap();
        assert_eq!(wait_finished(&rx, moved.id).status, JobStatus::Completed);
        assert!(!file.exists());
        assert!(dest.join("file.txt").exists());

        let deleted = jobs
            .enqueue(request(JobKind::Delete, &[&dest], None))
            .unwrap();
        assert_eq!(wait_finished(&rx, deleted.id).status, JobStatus::Completed);
        assert!(!dest.exists());
    }

    #[test]
    fn rejects_dangerous_or_incomplete_requests() {
        let (jobs, _rx) = manager();
        assert!(
            jobs.enqueue(request(JobKind::Delete, &[Path::new("/")], None))
                .is_err()
        );
        assert!(
            jobs.enqueue(request(JobKind::Copy, &[Path::new("/tmp/x")], None))
                .is_err()
        );
        let relative = JobRequest {
            kind: JobKind::Trash,
            sources: vec!["relative".into()],
            destination: None,
        };
        assert!(jobs.enqueue(relative).is_err());
    }
}
