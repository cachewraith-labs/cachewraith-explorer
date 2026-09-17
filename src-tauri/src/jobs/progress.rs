use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::error::{AppError, AppResult};
use crate::fs::{PathChange, paths};
use crate::jobs::manager::{JobRecord, Sink};

/// Progress is published at most this often while bytes are flowing.
const EMIT_INTERVAL: Duration = Duration::from_millis(120);

/// Handed to the transfer code: updates the job's snapshot, honours pause/cancel, and
/// throttles events so a copy of 100k small files does not flood the UI.
pub struct RunContext {
    record: Arc<JobRecord>,
    sink: Sink,
    last_emit: Instant,
    speed: SpeedMeter,
    changes: Vec<PathChange>,
}

impl RunContext {
    pub fn new(record: Arc<JobRecord>, sink: Sink) -> Self {
        Self {
            record,
            sink,
            last_emit: Instant::now(),
            speed: SpeedMeter::new(0),
            changes: Vec::new(),
        }
    }

    /// Records a completed move or delete, published once the job ends.
    pub fn path_changed(&mut self, change: PathChange) {
        self.changes.push(change);
    }

    pub fn take_changes(&mut self) -> Vec<PathChange> {
        std::mem::take(&mut self.changes)
    }

    /// Call between units of work. Blocks while paused; errors once cancelled.
    pub fn checkpoint(&mut self) -> AppResult<()> {
        if self.record.control.wait_while_paused() {
            self.speed = SpeedMeter::new(self.record.snapshot.lock().bytes_done);
        }
        if self.record.control.is_cancelled() {
            return Err(AppError::Cancelled);
        }
        Ok(())
    }

    pub fn add_totals(&mut self, bytes: u64, items: u64) {
        {
            let mut snap = self.record.snapshot.lock();
            snap.bytes_total += bytes;
            snap.items_total += items;
        }
        self.emit();
    }

    pub fn add_bytes(&mut self, bytes: u64) {
        self.record.snapshot.lock().bytes_done += bytes;
        self.maybe_emit();
    }

    pub fn item_started(&mut self, path: &Path) {
        self.record.snapshot.lock().current = Some(paths::display(path));
    }

    pub fn item_done(&mut self) {
        self.record.snapshot.lock().items_done += 1;
        self.maybe_emit();
    }

    fn maybe_emit(&mut self) {
        if self.last_emit.elapsed() >= EMIT_INTERVAL {
            self.emit();
        }
    }

    fn emit(&mut self) {
        self.last_emit = Instant::now();
        let snapshot = {
            let mut snap = self.record.snapshot.lock();
            snap.bytes_per_second = self.speed.sample(snap.bytes_done);
            snap.clone()
        };
        (self.sink)(&snapshot);
    }
}

/// Exponentially smoothed bytes-per-second, so the ETA does not jitter.
struct SpeedMeter {
    last_bytes: u64,
    last_at: Instant,
    rate: f64,
}

impl SpeedMeter {
    fn new(bytes: u64) -> Self {
        Self {
            last_bytes: bytes,
            last_at: Instant::now(),
            rate: 0.0,
        }
    }

    fn sample(&mut self, bytes: u64) -> u64 {
        let elapsed = self.last_at.elapsed().as_secs_f64();
        if elapsed >= 0.1 {
            let instant = bytes.saturating_sub(self.last_bytes) as f64 / elapsed;
            self.rate = if self.rate == 0.0 {
                instant
            } else {
                self.rate * 0.7 + instant * 0.3
            };
            self.last_bytes = bytes;
            self.last_at = Instant::now();
        }
        self.rate as u64
    }
}
