use std::sync::atomic::{AtomicBool, Ordering};

use parking_lot::{Condvar, Mutex};

/// Cancel and pause flags shared between the UI thread and a running job.
#[derive(Default)]
pub struct JobControl {
    cancelled: AtomicBool,
    paused: Mutex<bool>,
    wake: Condvar,
}

impl JobControl {
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        *self.paused.lock() = false;
        self.wake.notify_all();
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }

    pub fn set_paused(&self, paused: bool) {
        *self.paused.lock() = paused;
        if !paused {
            self.wake.notify_all();
        }
    }

    /// Blocks while paused. Returns `true` if it actually waited.
    pub fn wait_while_paused(&self) -> bool {
        let mut paused = self.paused.lock();
        let waited = *paused;
        while *paused && !self.is_cancelled() {
            self.wake.wait(&mut paused);
        }
        waited
    }
}
