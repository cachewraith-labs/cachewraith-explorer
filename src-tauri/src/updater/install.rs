//! How this copy was installed, and how to replace it with a newer package.
//!
//! The install methods are a closed set, so they are an enum dispatched with `match` rather
//! than a strategy trait. Every external program gets its arguments as argv, never through
//! a shell.

use std::env;
use std::fs::{self, Permissions};
use std::io::IsTerminal;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::updater::release::PackageKind;

const SYSTEM_BINARY: &str = "/usr/bin/cachewraith-explorer";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstallMethod {
    /// A single file; updating swaps the file in place.
    AppImage(PathBuf),
    Deb,
    Rpm,
    /// Arch Linux: the release PKGBUILD (or the AUR package built from it), owned by pacman.
    Pacman,
    /// Built from source or copied by hand; the updater cannot manage it.
    Manual(PathBuf),
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MethodName {
    AppImage,
    Deb,
    Rpm,
    Pacman,
    Manual,
}

impl InstallMethod {
    pub fn detect() -> Self {
        if let Some(appimage) = env::var_os("APPIMAGE")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute() && p.is_file())
        {
            return Self::AppImage(appimage);
        }
        let exe = env::current_exe()
            .and_then(fs::canonicalize)
            .unwrap_or_default();
        if exe == Path::new(SYSTEM_BINARY) {
            if succeeds("dpkg-query", &["-S", SYSTEM_BINARY]) {
                return Self::Deb;
            }
            if succeeds("rpm", &["-qf", SYSTEM_BINARY]) {
                return Self::Rpm;
            }
            if succeeds("pacman", &["-Qqo", SYSTEM_BINARY]) {
                return Self::Pacman;
            }
        }
        Self::Manual(exe)
    }

    pub fn package_kind(&self) -> Option<PackageKind> {
        match self {
            Self::AppImage(_) => Some(PackageKind::AppImage),
            Self::Deb => Some(PackageKind::Deb),
            Self::Rpm => Some(PackageKind::Rpm),
            Self::Pacman | Self::Manual(_) => None,
        }
    }

    pub fn name(&self) -> MethodName {
        match self {
            Self::AppImage(_) => MethodName::AppImage,
            Self::Deb => MethodName::Deb,
            Self::Rpm => MethodName::Rpm,
            Self::Pacman => MethodName::Pacman,
            Self::Manual(_) => MethodName::Manual,
        }
    }

    /// Installs a verified `package` over the current version.
    pub fn install(&self, package: &Path) -> AppResult<()> {
        match self {
            Self::AppImage(target) => replace_appimage(package, target),
            Self::Deb => run_privileged(&[
                "apt-get",
                "install",
                "-y",
                "--allow-downgrades",
                path_arg(package)?,
            ]),
            Self::Rpm => {
                let path = path_arg(package)?;
                if on_path("dnf") {
                    run_privileged(&["dnf", "install", "-y", path])
                } else if on_path("zypper") {
                    run_privileged(&[
                        "zypper",
                        "--non-interactive",
                        "install",
                        "--allow-unsigned-rpm",
                        path,
                    ])
                } else {
                    run_privileged(&["rpm", "-U", "--replacepkgs", path])
                }
            }
            Self::Pacman | Self::Manual(_) => Err(self.unsupported()),
        }
    }

    /// Arch: builds and installs the release's signed PKGBUILD in `dir` with `makepkg -si`.
    /// makepkg downloads the release .deb, checks it against the checksum pinned in the
    /// verified PKGBUILD, and asks for sudo only for the final `pacman -U`.
    pub fn build_pkgbuild(dir: &Path) -> AppResult<()> {
        if rustix::process::geteuid().is_root() {
            return Err(AppError::invalid(
                "Run the update as your normal user, not root (makepkg refuses root): cachewraith-explorer update",
            ));
        }
        if !on_path("makepkg") {
            return Err(AppError::invalid(
                "makepkg is missing. Install it with: sudo pacman -S --needed base-devel",
            ));
        }
        let status = Command::new("makepkg")
            .args(["--syncdeps", "--install", "--noconfirm", "--cleanbuild"])
            .current_dir(dir)
            .status()
            .map_err(|e| AppError::io("makepkg", e))?;
        if status.success() {
            Ok(())
        } else {
            Err(AppError::invalid(format!("makepkg failed ({status})")))
        }
    }

    /// Why a manual install cannot update itself, and what to do instead.
    pub fn unsupported(&self) -> AppError {
        if *self == Self::Pacman {
            return AppError::invalid(
                "Installed with pacman. Update by running makepkg -si with the latest release's PKGBUILD.",
            );
        }
        let location = match self {
            Self::Manual(exe) => exe.display().to_string(),
            _ => "This copy".to_owned(),
        };
        AppError::invalid(format!(
            "{location} was not installed from a package. Update it the way you installed it (for a source build: git pull && make install)."
        ))
    }
}

/// Writes the new `AppImage` next to the old one, then renames it over the old one, so the
/// file is never half-written. The running copy keeps working until it exits.
fn replace_appimage(package: &Path, target: &Path) -> AppResult<()> {
    let staged = target.with_extension("AppImage.update");
    fs::copy(package, &staged).map_err(|e| {
        AppError::invalid(format!(
            "Cannot write next to {}: {e}. Move the AppImage to a folder you own, or run the update with sudo.",
            target.display()
        ))
    })?;
    let result = fs::set_permissions(&staged, Permissions::from_mode(0o755))
        .and_then(|()| fs::rename(&staged, target))
        .map_err(|e| AppError::io(target, e));
    if result.is_err() {
        let _ = fs::remove_file(&staged);
    }
    result
}

/// Runs a package-manager command as root: directly when already root, with `sudo` in a
/// terminal, or with `pkexec` (a graphical password prompt) otherwise.
fn run_privileged(args: &[&str]) -> AppResult<()> {
    let (program, rest) = args
        .split_first()
        .ok_or_else(|| AppError::invalid("Empty command"))?;
    let mut command = if rustix::process::geteuid().is_root() {
        Command::new(program)
    } else if std::io::stdin().is_terminal() && on_path("sudo") {
        let mut sudo = Command::new("sudo");
        sudo.arg(program);
        sudo
    } else if on_path("pkexec") {
        let mut pkexec = Command::new("pkexec");
        pkexec.arg(program);
        pkexec
    } else {
        return Err(AppError::invalid(
            "Administrator rights are needed: run the update from a terminal",
        ));
    };
    let status = command
        .args(rest)
        .status()
        .map_err(|e| AppError::io(program, e))?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::invalid(format!("{program} failed ({status})")))
    }
}

fn path_arg(path: &Path) -> AppResult<&str> {
    // Absolute, so it starts with `/`: package managers treat it as a file, never a flag.
    path.to_str()
        .filter(|p| p.starts_with('/'))
        .ok_or_else(|| AppError::invalid("Unexpected download path"))
}

fn succeeds(program: &str, args: &[&str]) -> bool {
    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|s| s.success())
}

fn on_path(program: &str) -> bool {
    env::var_os("PATH")
        .is_some_and(|path| env::split_paths(&path).any(|dir| dir.join(program).is_file()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn appimage_replacement_is_atomic_and_executable() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("Files.AppImage");
        let package = dir.path().join("download.bin");
        fs::write(&target, b"old").unwrap();
        fs::write(&package, b"new").unwrap();

        replace_appimage(&package, &target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert_eq!(
            fs::metadata(&target).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert!(!target.with_extension("AppImage.update").exists());
    }

    #[test]
    fn manual_installs_are_refused_with_guidance() {
        let err = InstallMethod::Manual("/home/me/.local/bin/x".into())
            .install(Path::new("/tmp/pkg"))
            .unwrap_err();
        assert!(err.to_string().contains("make install"));
    }

    #[test]
    fn download_paths_must_be_absolute() {
        assert!(path_arg(Path::new("relative.deb")).is_err());
        assert_eq!(path_arg(Path::new("/tmp/x.deb")).unwrap(), "/tmp/x.deb");
    }
}
