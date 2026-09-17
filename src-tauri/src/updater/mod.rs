//! Self-update: `cachewraith-explorer update`.
//!
//! 1. Ask GitHub for the latest release.
//! 2. Pick the package matching how this copy was installed (`AppImage`, `.deb`, `.rpm`).
//! 3. Download it and its signature into a private cache folder.
//! 4. Verify the signature against the release key built into the app.
//! 5. Install it over the current version — no uninstall step.

pub mod install;
pub mod release;
pub mod verify;

use std::fs::{self, DirBuilder, File};
use std::io::{self, IsTerminal, Read, Write};
use std::os::unix::fs::DirBuilderExt;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;
use ureq::Agent;

use crate::error::{AppError, AppResult};
use install::{InstallMethod, MethodName};
use release::{Asset, Release};

const MAX_PACKAGE_BYTES: u64 = 400 * 1024 * 1024;
const MAX_SIGNATURE_BYTES: u64 = 16 * 1024;

/// What the Settings page shows.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current: String,
    pub latest: String,
    pub update_available: bool,
    pub method: MethodName,
    pub release_url: String,
}

pub fn check() -> AppResult<UpdateStatus> {
    let release = fetch_latest(&agent())?;
    let current = release::current_version();
    Ok(UpdateStatus {
        update_available: release.version > current,
        current: current.to_string(),
        latest: release.version.to_string(),
        method: InstallMethod::detect().name(),
        release_url: release.page_url,
    })
}

#[derive(Debug, Default)]
pub struct CliOptions {
    /// Only report whether an update exists.
    pub check_only: bool,
    /// Reinstall the latest release even if this copy is current.
    pub force: bool,
}

/// Entry point for `cachewraith-explorer update`. Returns the process exit code.
pub fn run_cli(options: &CliOptions) -> i32 {
    match update(options) {
        Ok(()) => 0,
        Err(err) => {
            eprintln!("Update failed: {err}");
            1
        }
    }
}

fn update(options: &CliOptions) -> AppResult<()> {
    let agent = agent();
    let current = release::current_version();
    println!("Files {current} — checking for updates…");
    let release = fetch_latest(&agent)?;

    if release.version <= current && !options.force {
        println!("You have the latest version ({current}).");
        return Ok(());
    }
    if options.check_only {
        println!(
            "Version {} is available. Run: cachewraith-explorer update",
            release.version
        );
        return Ok(());
    }

    let method = InstallMethod::detect();
    if method == InstallMethod::Pacman {
        println!("Updating through the AUR…");
        method.update_from_aur()?;
        println!(
            "Updated to {}. Restart Files to use the new version.",
            release.version
        );
        return Ok(());
    }
    let Some(kind) = method.package_kind() else {
        return Err(method.unsupported());
    };
    let (package, signature) = release.package(kind).ok_or_else(|| {
        AppError::invalid(format!(
            "Release {} has no signed package for this install type",
            release.version
        ))
    })?;

    let dir = download_dir()?;
    let package_path = dir.join(&package.name);
    let result = (|| {
        println!(
            "Downloading {} ({})…",
            package.name,
            human_size(package.size)
        );
        download(&agent, package, &package_path, MAX_PACKAGE_BYTES, true)?;
        let signature_text = fetch_text(&agent, signature)?;

        println!("Verifying signature…");
        verify::verify_file(&package_path, &signature_text, verify::RELEASE_PUBLIC_KEY)?;

        println!("Installing {}…", release.version);
        method.install(&package_path)
    })();
    let _ = fs::remove_file(&package_path);
    result?;

    println!(
        "Updated to {}. Restart Files to use the new version.",
        release.version
    );
    Ok(())
}

fn agent() -> Agent {
    Agent::config_builder()
        .https_only(true)
        .timeout_global(Some(Duration::from_secs(600)))
        .user_agent(format!(
            "cachewraith-explorer/{}",
            env!("CARGO_PKG_VERSION")
        ))
        .build()
        .into()
}

fn fetch_latest(agent: &Agent) -> AppResult<Release> {
    let body = agent
        .get(release::latest_release_url())
        .header("Accept", "application/vnd.github+json")
        .call()
        .map_err(network_error)?
        .body_mut()
        .with_config()
        .limit(1024 * 1024)
        .read_to_string()
        .map_err(network_error)?;
    release::parse(&body)
}

fn fetch_text(agent: &Agent, asset: &Asset) -> AppResult<String> {
    agent
        .get(&asset.url)
        .call()
        .map_err(network_error)?
        .body_mut()
        .with_config()
        .limit(MAX_SIGNATURE_BYTES)
        .read_to_string()
        .map_err(network_error)
}

fn download(
    agent: &Agent,
    asset: &Asset,
    target: &Path,
    limit: u64,
    progress: bool,
) -> AppResult<()> {
    let mut response = agent.get(&asset.url).call().map_err(network_error)?;
    let mut reader = response.body_mut().with_config().limit(limit).reader();
    let mut file = File::create(target).map_err(|e| AppError::io(target, e))?;
    let show = progress && io::stdout().is_terminal();
    let mut buffer = vec![0u8; 256 * 1024];
    let mut done: u64 = 0;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| AppError::io(&asset.url, e))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|e| AppError::io(target, e))?;
        done += read as u64;
        if show && asset.size > 0 {
            print!(
                "\r  {:>3}%  {} / {}",
                done * 100 / asset.size,
                human_size(done),
                human_size(asset.size)
            );
            let _ = io::stdout().flush();
        }
    }
    if show {
        println!();
    }
    file.sync_all().map_err(|e| AppError::io(target, e))
}

/// `$XDG_CACHE_HOME/cachewraith-explorer/updates`, private to this user, so nobody can swap
/// the package between the signature check and the install.
fn download_dir() -> AppResult<PathBuf> {
    let dir = dirs::cache_dir()
        .ok_or_else(|| AppError::invalid("No cache directory"))?
        .join("cachewraith-explorer/updates");
    DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(&dir)
        .map_err(|e| AppError::io(&dir, e))?;
    Ok(dir)
}

fn network_error(err: ureq::Error) -> AppError {
    AppError::invalid(format!("Could not reach GitHub: {err}"))
}

fn human_size(bytes: u64) -> String {
    const MIB: f64 = 1024.0 * 1024.0;
    format!("{:.1} MB", bytes as f64 / MIB)
}
