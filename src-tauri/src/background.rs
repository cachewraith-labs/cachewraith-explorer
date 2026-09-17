//! Cancellable work on its own thread, addressed by id from the frontend. Shared by
//! recursive search and folder-size counting.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;

use parking_lot::Mutex;

#[derive(Default)]
pub struct BackgroundTasks {
    next_id: AtomicU64,
    active: Arc<Mutex<HashMap<u64, Arc<AtomicBool>>>>,
}

impl BackgroundTasks {
    /// Runs `work` on a new thread. `work` should poll the flag it receives and return
    /// soon after it becomes `true`. Returns the id to pass to [`Self::cancel`].
    pub fn spawn(&self, name: &str, work: impl FnOnce(&AtomicBool) + Send + 'static) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        let cancelled = Arc::new(AtomicBool::new(false));
        self.active.lock().insert(id, Arc::clone(&cancelled));
        let active = Arc::clone(&self.active);
        let started = thread::Builder::new()
            .name(format!("{name}-{id}"))
            .spawn(move || {
                work(&cancelled);
                active.lock().remove(&id);
            });
        if let Err(err) = started {
            log::error!("could not start {name} thread: {err}");
            self.active.lock().remove(&id);
        }
        id
    }

    pub fn cancel(&self, id: u64) {
        if let Some(flag) = self.active.lock().remove(&id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc::channel;
    use std::time::Duration;

    use super::*;

    #[test]
    fn cancel_reaches_the_running_task() {
        let tasks = BackgroundTasks::default();
        let (tx, rx) = channel();
        let id = tasks.spawn("test", move |cancelled| {
            while !cancelled.load(Ordering::SeqCst) {
                thread::sleep(Duration::from_millis(5));
            }
            tx.send(()).unwrap();
        });
        tasks.cancel(id);
        rx.recv_timeout(Duration::from_secs(5))
            .expect("task saw the cancel");
    }
}
