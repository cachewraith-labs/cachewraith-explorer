use tauri::State;

use crate::error::AppResult;
use crate::jobs::{JobRequest, JobSnapshot};
use crate::state::AppState;

#[tauri::command]
pub fn enqueue_job(state: State<'_, AppState>, request: JobRequest) -> AppResult<JobSnapshot> {
    state.jobs.enqueue(request)
}

#[tauri::command]
pub fn pause_job(state: State<'_, AppState>, id: u64) {
    state.jobs.pause(id);
}

#[tauri::command]
pub fn resume_job(state: State<'_, AppState>, id: u64) {
    state.jobs.resume(id);
}

#[tauri::command]
pub fn cancel_job(state: State<'_, AppState>, id: u64) {
    state.jobs.cancel(id);
}

#[tauri::command]
pub fn list_jobs(state: State<'_, AppState>) -> Vec<JobSnapshot> {
    state.jobs.list()
}
