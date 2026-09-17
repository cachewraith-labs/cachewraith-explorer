//! Just enough of the freedesktop Desktop Entry spec: find `.desktop` files by id, read
//! their name and program, and write one safely.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

/// `org.gnome.Nautilus.desktop`, `thunar.desktop`… A single file name, nothing else.
pub fn is_valid_id(id: &str) -> bool {
    id.len() <= 255
        && id.ends_with(".desktop")
        && id.len() > ".desktop".len()
        && !id.starts_with(['.', '-'])
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b'+' | b' '))
}

/// `$XDG_DATA_HOME/applications` first, then each `$XDG_DATA_DIRS/applications`.
pub fn application_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = dirs::data_dir().into_iter().collect();
    let system = env::var("XDG_DATA_DIRS")
        .ok()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "/usr/local/share:/usr/share".to_owned());
    dirs.extend(env::split_paths(&system));
    dirs.into_iter()
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join("applications"))
        .collect()
}

/// The file that wins for `id`, following XDG precedence.
pub fn find(id: &str) -> Option<PathBuf> {
    if !is_valid_id(id) {
        return None;
    }
    application_dirs()
        .into_iter()
        .map(|dir| dir.join(id))
        .find(|path| path.is_file())
}

/// `Name=` from the `[Desktop Entry]` group (unlocalized).
pub fn read_name(path: &Path) -> Option<String> {
    read_key(path, "Name")
}

/// The program `Exec=` runs, with quoting removed.
pub fn read_program(path: &Path) -> Option<String> {
    // String-value escaping (`\\` → `\`) comes off first, then Exec quoting.
    read_key(path, "Exec").and_then(|exec| first_exec_word(&exec.replace("\\\\", "\\")))
}

fn read_key(path: &Path, key: &str) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let mut in_main_group = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_main_group = line == "[Desktop Entry]";
        } else if in_main_group
            && let Some((k, v)) = line.split_once('=')
            && k.trim() == key
        {
            return Some(v.trim().to_owned());
        }
    }
    None
}

fn first_exec_word(exec: &str) -> Option<String> {
    let exec = exec.trim_start();
    if let Some(rest) = exec.strip_prefix('"') {
        let mut out = String::new();
        let mut chars = rest.chars();
        while let Some(c) = chars.next() {
            match c {
                '\\' => out.push(chars.next()?),
                '"' => return Some(out),
                _ => out.push(c),
            }
        }
        None
    } else {
        exec.split_whitespace().next().map(str::to_owned)
    }
}

/// Quotes a program path for `Exec=`: inside double quotes, `"`, `` ` ``, `$` and `\` are
/// backslash-escaped, then every backslash is doubled again because `Exec` is a string
/// value. Paths with control characters are refused.
pub fn quote_exec_arg(arg: &str) -> Option<String> {
    if arg.chars().any(char::is_control) {
        return None;
    }
    let mut quoted = String::with_capacity(arg.len() + 2);
    quoted.push('"');
    for c in arg.chars() {
        if matches!(c, '"' | '`' | '$' | '\\') {
            quoted.push_str("\\\\");
        }
        quoted.push(c);
    }
    quoted.push('"');
    Some(quoted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_ids() {
        assert!(is_valid_id("org.gnome.Nautilus.desktop"));
        assert!(is_valid_id("Cachewraith Explorer.desktop"));
        for bad in [
            "",
            ".desktop",
            "../x.desktop",
            "a/b.desktop",
            "x.txt",
            "-x.desktop",
            "a\nb.desktop",
        ] {
            assert!(!is_valid_id(bad), "{bad:?}");
        }
    }

    #[test]
    fn reads_name_and_program_from_main_group() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("app.desktop");
        fs::write(
            &file,
            "[Desktop Entry]\nName=Files\nExec=\"/opt/My Apps/files\" %U\n[Desktop Action new]\nName=New\nExec=other\n",
        )
        .unwrap();
        assert_eq!(read_name(&file).as_deref(), Some("Files"));
        assert_eq!(read_program(&file).as_deref(), Some("/opt/My Apps/files"));
    }

    #[test]
    fn quotes_exec_paths_and_round_trips() {
        assert_eq!(
            quote_exec_arg("/usr/bin/files").unwrap(),
            "\"/usr/bin/files\""
        );
        assert_eq!(quote_exec_arg("/a/$b").unwrap(), "\"/a/\\\\$b\"");
        assert!(quote_exec_arg("/a\nb").is_none());
        // What the desktop reads back (after string-value unescaping) is the original path.
        let written = quote_exec_arg("/opt/x \"y\"")
            .unwrap()
            .replace("\\\\", "\\");
        assert_eq!(first_exec_word(&written).as_deref(), Some("/opt/x \"y\""));
    }
}
