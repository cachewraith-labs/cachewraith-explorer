// Every command the frontend may call is declared here. Tauri turns this list into
// per-command permissions, and `capabilities/default.json` grants them explicitly, so a
// command that is not in both places cannot be invoked from the webview.
const COMMANDS: &[&str] = &[
    // filesystem
    "list_dir",
    "stat_path",
    "child_count",
    "create_dir",
    "rename_path",
    "list_folder_icons",
    "set_folder_icon",
    "get_places",
    "path_properties",
    "start_folder_usage",
    "cancel_folder_usage",
    "initial_location",
    // drives
    "list_drives",
    // desktop integration
    "desktop_info",
    "default_app_status",
    "make_default_app",
    "restore_default_app",
    // updates
    "check_update",
    // jobs
    "enqueue_job",
    "pause_job",
    "resume_job",
    "cancel_job",
    "list_jobs",
    // trash
    "list_trash",
    "restore_trash",
    "purge_trash",
    "empty_trash",
    // search
    "start_search",
    "cancel_search",
    // watcher
    "watch_dirs",
    // theme
    "get_theme",
    // settings
    "load_settings",
    "save_settings",
    // launcher
    "open_path",
    "open_terminal",
];

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
