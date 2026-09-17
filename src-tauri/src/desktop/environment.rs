use std::env;

use serde::Serialize;

/// Compositors that manage window placement themselves and draw no title bars. On these the
/// window stays frameless; everywhere else the app draws its own window buttons.
const TILING: &[&str] = &[
    "hyprland",
    "sway",
    "i3",
    "niri",
    "river",
    "bspwm",
    "dwm",
    "qtile",
    "awesome",
    "xmonad",
    "herbstluftwm",
    "leftwm",
    "cosmic-comp",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInfo {
    /// e.g. "GNOME", "KDE", "Hyprland"; empty when unknown.
    pub name: String,
    pub wayland: bool,
    /// Draw minimize / maximize / close in the app.
    pub window_controls: bool,
}

pub fn detect() -> DesktopInfo {
    let current = env::var("XDG_CURRENT_DESKTOP")
        .or_else(|_| env::var("XDG_SESSION_DESKTOP"))
        .or_else(|_| env::var("DESKTOP_SESSION"))
        .unwrap_or_default();
    from_values(&current, env::var_os("WAYLAND_DISPLAY").is_some())
}

fn from_values(current_desktop: &str, wayland: bool) -> DesktopInfo {
    // XDG_CURRENT_DESKTOP is a colon-separated list, e.g. "ubuntu:GNOME".
    let names: Vec<&str> = current_desktop
        .split(':')
        .filter(|n| !n.is_empty())
        .collect();
    let tiling = names
        .iter()
        .any(|name| TILING.contains(&name.to_ascii_lowercase().as_str()));
    DesktopInfo {
        name: names.last().copied().unwrap_or_default().to_owned(),
        wayland,
        window_controls: !tiling,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiling_compositors_hide_window_controls() {
        assert!(!from_values("Hyprland", true).window_controls);
        assert!(!from_values("sway", true).window_controls);
    }

    #[test]
    fn stacking_desktops_and_unknown_show_them() {
        let ubuntu = from_values("ubuntu:GNOME", true);
        assert!(ubuntu.window_controls);
        assert_eq!(ubuntu.name, "GNOME");
        assert!(from_values("KDE", false).window_controls);
        assert!(from_values("", false).window_controls);
    }
}
