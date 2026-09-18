//! Puts copied or cut files on the system clipboard, so they paste into other apps.
//!
//! One clipboard offer carries every format a Linux app looks for, because each reads a
//! different one: Chromium and Electron apps (VS Code) read `text/uri-list`; GNOME Files,
//! Nemo, Caja and Thunar read `x-special/gnome-copied-files`; Dolphin reads the uri list
//! plus `application/x-kde-cutselection`; chat apps and terminals take plain text paths.
//!
//! The offer is made through GTK (the webview's toolkit), which serves each format on
//! request for as long as this app owns the clipboard, on both X11 and Wayland.

use std::os::unix::ffi::OsStrExt;
use std::path::{Path, PathBuf};

use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, percent_encode};

/// RFC 3986 unreserved characters and `/` stay as they are in a `file://` URI.
const PATH_SEGMENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'/')
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');

/// Every clipboard target and its bytes, in order of preference.
pub fn formats(paths: &[PathBuf], cut: bool) -> Vec<(&'static str, Vec<u8>)> {
    let uris: Vec<String> = paths.iter().map(|path| file_uri(path)).collect();
    let text = paths
        .iter()
        .map(|path| path.to_string_lossy())
        .collect::<Vec<_>>()
        .join("\n");

    // RFC 2483: CRLF-terminated lines.
    let uri_list: String = uris.iter().flat_map(|uri| [uri.as_str(), "\r\n"]).collect();
    let gnome = std::iter::once(if cut { "cut" } else { "copy" })
        .chain(uris.iter().map(String::as_str))
        .collect::<Vec<_>>()
        .join("\n");

    vec![
        ("x-special/gnome-copied-files", gnome.into_bytes()),
        ("text/uri-list", uri_list.into_bytes()),
        (
            "application/x-kde-cutselection",
            if cut { b"1".to_vec() } else { b"0".to_vec() },
        ),
        ("text/plain;charset=utf-8", text.clone().into_bytes()),
        ("UTF8_STRING", text.clone().into_bytes()),
        ("text/plain", text.into_bytes()),
    ]
}

/// File names are bytes, not necessarily UTF-8, so they are percent-encoded byte by byte.
fn file_uri(path: &Path) -> String {
    format!(
        "file://{}",
        percent_encode(path.as_os_str().as_bytes(), PATH_SEGMENT)
    )
}

/// Owns the clipboard with `formats`. Must run on the GTK main thread.
pub fn publish(formats: Vec<(&'static str, Vec<u8>)>) -> bool {
    use gtk::{Clipboard, TargetEntry, TargetFlags, gdk};

    let targets: Vec<TargetEntry> = formats
        .iter()
        .enumerate()
        .map(|(index, (target, _))| TargetEntry::new(target, TargetFlags::empty(), index as u32))
        .collect();
    let clipboard = Clipboard::get(&gdk::SELECTION_CLIPBOARD);
    clipboard.set_with_data(&targets, move |_, selection, info| {
        if let Some((target, bytes)) = formats.get(info as usize) {
            selection.set(&gdk::Atom::intern(target), 8, bytes);
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lookup<'a>(formats: &'a [(&'static str, Vec<u8>)], target: &str) -> &'a str {
        let bytes = &formats.iter().find(|(t, _)| *t == target).unwrap().1;
        std::str::from_utf8(bytes).unwrap()
    }

    #[test]
    fn offers_uri_list_gnome_and_text_formats() {
        let paths = [
            PathBuf::from("/home/me/My Files/a#1.txt"),
            PathBuf::from("/tmp/ข.png"),
        ];
        let copy = formats(&paths, false);
        assert_eq!(
            lookup(&copy, "text/uri-list"),
            "file:///home/me/My%20Files/a%231.txt\r\nfile:///tmp/%E0%B8%82.png\r\n"
        );
        assert_eq!(
            lookup(&copy, "x-special/gnome-copied-files"),
            "copy\nfile:///home/me/My%20Files/a%231.txt\nfile:///tmp/%E0%B8%82.png"
        );
        assert_eq!(lookup(&copy, "application/x-kde-cutselection"), "0");
        assert_eq!(
            lookup(&copy, "text/plain"),
            "/home/me/My Files/a#1.txt\n/tmp/ข.png"
        );

        let cut = formats(&paths[..1], true);
        assert!(lookup(&cut, "x-special/gnome-copied-files").starts_with("cut\n"));
        assert_eq!(lookup(&cut, "application/x-kde-cutselection"), "1");
    }
}
