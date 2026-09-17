//! Hands files and folders to other programs. Arguments are always passed as separate
//! argv entries — never through a shell — so a file name cannot become a command.

use std::env;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;

use crate::error::{AppError, AppResult};

/// How to start a terminal in a folder. Single-instance terminals (gnome-terminal, Ptyxis,
/// Konsole…) ignore the launching process's working directory, so each known terminal gets
/// its own flag. Pattern: Strategy as a lookup table; unknown terminals only get `current_dir`.
struct TerminalSpec {
    name: &'static str,
    /// Arguments placed before the directory.
    args: &'static [&'static str],
    /// `--flag=DIR` instead of `--flag DIR`.
    joined: bool,
}

const fn spec(name: &'static str, args: &'static [&'static str], joined: bool) -> TerminalSpec {
    TerminalSpec { name, args, joined }
}

/// Auto-detection order: tiling-WM favourites first, then desktop defaults, then fallbacks.
const TERMINALS: &[TerminalSpec] = &[
    spec("kitty", &["--directory"], false),
    spec("foot", &["--working-directory="], true),
    spec("alacritty", &["--working-directory"], false),
    spec("wezterm", &["start", "--cwd"], false),
    spec("ghostty", &["--working-directory="], true),
    spec("ptyxis", &["--new-window", "--working-directory"], false),
    spec("kgx", &["--working-directory"], false),
    spec("gnome-terminal", &["--working-directory"], false),
    spec("konsole", &["--workdir"], false),
    spec("xfce4-terminal", &["--working-directory"], false),
    spec("tilix", &["--working-directory"], false),
    spec("terminator", &["--working-directory"], false),
    spec("mate-terminal", &["--working-directory"], false),
    spec("lxterminal", &["--working-directory"], false),
    spec("x-terminal-emulator", &[], false),
    spec("xterm", &[], false),
];

/// Opens a file or folder with the desktop's default application.
pub fn open_path(path: &Path) -> AppResult<()> {
    path.symlink_metadata().map_err(|e| AppError::io(path, e))?;
    // The path is absolute, so it starts with `/` and can never be parsed as an option.
    spawn_detached(Command::new("xdg-open").arg(path))
}

/// Starts a terminal in `dir`: the user's choice, then `$TERMINAL`, then the first known
/// terminal installed.
pub fn open_terminal(dir: &Path, preferred: Option<&str>) -> AppResult<()> {
    if !dir.is_dir() {
        return Err(AppError::invalid(format!(
            "{} is not a folder",
            dir.display()
        )));
    }
    let from_env = env::var("TERMINAL").ok();
    let (name, program) = preferred
        .into_iter()
        .chain(from_env.as_deref())
        .chain(TERMINALS.iter().map(|t| t.name))
        .filter(|name| is_program_name(name))
        .find_map(|name| find_on_path(name).map(|path| (name, path)))
        .ok_or_else(|| {
            AppError::invalid("No terminal found. Choose one in Settings or set $TERMINAL.")
        })?;

    let mut command = Command::new(program);
    command.args(terminal_args(name, dir)).current_dir(dir);
    spawn_detached(&mut command)
}

fn terminal_args(name: &str, dir: &Path) -> Vec<OsString> {
    // Unknown terminals and ones without a flag rely on the working directory alone.
    let Some(spec) = TERMINALS
        .iter()
        .find(|t| t.name == name && !t.args.is_empty())
    else {
        return Vec::new();
    };
    let mut args: Vec<OsString> = spec.args.iter().map(OsString::from).collect();
    match (spec.joined, args.pop()) {
        (true, Some(mut flag)) => {
            flag.push(dir.as_os_str());
            args.push(flag);
        }
        (false, last) => {
            args.extend(last);
            args.push(dir.as_os_str().to_owned());
        }
        (true, None) => unreachable!("specs with arguments always have a last argument"),
    }
    args
}

/// A bare program name: no path separators, spaces, or shell syntax.
pub fn is_program_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.' | b'+'))
        && !name.starts_with(['.', '-'])
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    env::split_paths(&env::var_os("PATH")?)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

fn spawn_detached(command: &mut Command) -> AppResult<()> {
    let program = command.get_program().to_string_lossy().into_owned();
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::io(&program, e))?;
    // Reap the child when it exits so it never lingers as a zombie.
    thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_working_directory_arguments_per_terminal() {
        let dir = Path::new("/home/me/My Files");
        assert_eq!(
            terminal_args("kitty", dir),
            ["--directory", "/home/me/My Files"]
        );
        assert_eq!(
            terminal_args("foot", dir),
            ["--working-directory=/home/me/My Files"]
        );
        assert_eq!(
            terminal_args("ptyxis", dir),
            ["--new-window", "--working-directory", "/home/me/My Files"]
        );
        assert!(terminal_args("xterm", dir).is_empty());
        assert!(terminal_args("my-custom-term", dir).is_empty());
    }

    #[test]
    fn program_names_reject_paths_and_shell_syntax() {
        assert!(is_program_name("kitty"));
        assert!(is_program_name("gnome-terminal"));
        for bad in [
            "",
            "/usr/bin/kitty",
            "kitty --hold",
            "a;b",
            "-e",
            "../x",
            "$(x)",
        ] {
            assert!(!is_program_name(bad), "{bad:?}");
        }
    }
}
