// Hide the extra console window on Windows release builds; a no-op on Linux.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    work_around_webkit_dmabuf();
    cachewraith_explorer_lib::run();
}

/// `WebKitGTK`'s DMABUF renderer aborts with "Error 71 (Protocol error) dispatching to
/// Wayland display" on some Wayland setups (NVIDIA in particular, on Hyprland, GNOME and
/// KDE alike). Turning it off costs nothing visible for this app. X11 sessions are left
/// alone, and a value the user already set is respected.
fn work_around_webkit_dmabuf() {
    const VAR: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";
    if std::env::var_os("WAYLAND_DISPLAY").is_some() && std::env::var_os(VAR).is_none() {
        #[expect(
            unsafe_code,
            reason = "set_var is unsafe in edition 2024 because of threads"
        )]
        // SAFETY: this runs first thing in `main`, before Tauri, GTK or any other thread
        // starts, so nothing can read the environment concurrently.
        unsafe {
            std::env::set_var(VAR, "1");
        }
    }
}
