//! Mounted block devices, read from `/proc/self/mountinfo`, `/sys/class/block` and
//! `statvfs`. No external commands are run.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::fs::paths;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Drive {
    /// Display name: filesystem label, "System" for `/`, else the mount folder's name.
    pub label: String,
    pub mount_point: String,
    pub device: String,
    pub model: Option<String>,
    pub fs_type: String,
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub available_bytes: u64,
    pub removable: bool,
    /// Mounted somewhere inside the user's home; shown first and starred.
    pub in_home: bool,
}

#[derive(Debug, PartialEq, Eq)]
struct Mount {
    target: PathBuf,
    root: String,
    fs_type: String,
    source: String,
}

const HIDDEN_PREFIXES: &[&str] = &[
    "/boot",
    "/efi",
    "/snap",
    "/var/lib/docker",
    "/var/lib/containers",
];

pub fn list() -> AppResult<Vec<Drive>> {
    let mountinfo = fs::read_to_string("/proc/self/mountinfo")
        .map_err(|e| AppError::io("/proc/self/mountinfo", e))?;
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let labels = read_labels();

    // One entry per device: bind mounts and btrfs subvolumes keep the shortest path.
    let mut by_device: HashMap<String, Mount> = HashMap::new();
    for mount in parse_mountinfo(&mountinfo)
        .into_iter()
        .filter(is_user_facing)
    {
        match by_device.get(&mount.source) {
            Some(existing)
                if existing.target.as_os_str().len() <= mount.target.as_os_str().len() => {}
            _ => {
                by_device.insert(mount.source.clone(), mount);
            }
        }
    }

    let mut drives: Vec<Drive> = by_device
        .into_values()
        .filter_map(|mount| describe(mount, &home, &labels))
        .collect();
    drives.sort_by(|a, b| {
        (!a.in_home, a.mount_point != "/", &a.mount_point).cmp(&(
            !b.in_home,
            b.mount_point != "/",
            &b.mount_point,
        ))
    });
    Ok(drives)
}

fn is_user_facing(mount: &Mount) -> bool {
    let point = mount.target.to_string_lossy();
    mount.source.starts_with("/dev/")
        && mount.root == "/"
        && !matches!(mount.fs_type.as_str(), "squashfs" | "iso9660" | "overlay")
        && !HIDDEN_PREFIXES
            .iter()
            .any(|prefix| point == *prefix || point.starts_with(&format!("{prefix}/")))
}

fn describe(mount: Mount, home: &Path, labels: &HashMap<PathBuf, String>) -> Option<Drive> {
    let stat = rustix::fs::statvfs(&mount.target).ok()?;
    let block = stat.f_frsize;
    let total_bytes = stat.f_blocks.saturating_mul(block);
    let used_bytes = stat
        .f_blocks
        .saturating_sub(stat.f_bfree)
        .saturating_mul(block);
    let available_bytes = stat.f_bavail.saturating_mul(block);

    let device_path =
        fs::canonicalize(&mount.source).unwrap_or_else(|_| PathBuf::from(&mount.source));
    let device_name = device_path.file_name()?.to_string_lossy().into_owned();
    let disk = parent_disk(&device_name);

    let label = if mount.target == Path::new("/") {
        "System".to_owned()
    } else if let Some(label) = labels.get(&device_path) {
        capitalize(label)
    } else {
        mount.target.file_name().map_or_else(
            || paths::display(&mount.target),
            |n| capitalize(&n.to_string_lossy()),
        )
    };

    Some(Drive {
        label,
        in_home: mount.target != home && mount.target.starts_with(home),
        mount_point: paths::display(&mount.target),
        device: paths::display(&device_path),
        model: disk.as_deref().and_then(read_model),
        removable: disk.as_deref().is_some_and(is_removable),
        fs_type: mount.fs_type,
        total_bytes,
        used_bytes,
        available_bytes,
    })
}

/// Parses `/proc/self/mountinfo`. Format (proc(5)):
/// `id parent major:minor root mount-point options [optional…] - fstype source super-options`
fn parse_mountinfo(text: &str) -> Vec<Mount> {
    text.lines()
        .filter_map(|line| {
            let (left, right) = line.split_once(" - ")?;
            let left: Vec<&str> = left.split(' ').collect();
            let mut right = right.split(' ');
            Some(Mount {
                root: unescape(left.get(3)?),
                target: PathBuf::from(unescape(left.get(4)?)),
                fs_type: right.next()?.to_owned(),
                source: unescape(right.next()?),
            })
        })
        .collect()
}

/// mountinfo escapes space, tab, newline and backslash as `\040`-style octal.
fn unescape(field: &str) -> String {
    let bytes = field.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\'
            && i + 4 <= bytes.len()
            && let Some(value) = std::str::from_utf8(&bytes[i + 1..i + 4])
                .ok()
                .and_then(|oct| u8::from_str_radix(oct, 8).ok())
        {
            out.push(value);
            i += 4;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// `/dev/disk/by-label/<label>` → resolved device path.
fn read_labels() -> HashMap<PathBuf, String> {
    let Ok(dir) = fs::read_dir("/dev/disk/by-label") else {
        return HashMap::new();
    };
    dir.filter_map(Result::ok)
        .filter_map(|link| {
            let device = fs::canonicalize(link.path()).ok()?;
            let label = unescape_udev(&link.file_name().to_string_lossy());
            Some((device, label))
        })
        .collect()
}

/// udev escapes unsafe characters in label links as `\x20`.
fn unescape_udev(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut rest = name;
    while let Some(pos) = rest.find("\\x") {
        out.push_str(&rest[..pos]);
        let hex = rest.get(pos + 2..pos + 4);
        if let Some(byte) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
            out.push(char::from(byte));
            rest = &rest[pos + 4..];
        } else {
            out.push_str("\\x");
            rest = &rest[pos + 2..];
        }
    }
    out.push_str(rest);
    out
}

/// `nvme0n1p1` → `nvme0n1`, via the sysfs hierarchy rather than name guessing.
fn parent_disk(device_name: &str) -> Option<String> {
    let sys = fs::canonicalize(Path::new("/sys/class/block").join(device_name)).ok()?;
    if sys.join("partition").exists() {
        sys.parent()?
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
    } else {
        Some(device_name.to_owned())
    }
}

fn read_model(disk: &str) -> Option<String> {
    let model = fs::read_to_string(
        Path::new("/sys/class/block")
            .join(disk)
            .join("device/model"),
    )
    .ok()?;
    let model = model.trim();
    (!model.is_empty()).then(|| model.to_owned())
}

fn is_removable(disk: &str) -> bool {
    fs::read_to_string(Path::new("/sys/class/block").join(disk).join("removable"))
        .is_ok_and(|v| v.trim() == "1")
}

fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().chain(chars).collect()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
22 1 259:3 / / rw,relatime shared:1 - ext4 /dev/nvme1n1p3 rw
25 22 259:1 / /boot/efi rw,relatime shared:2 - vfat /dev/nvme1n1p1 rw
60 22 259:5 / /home/me/storage rw,relatime shared:30 - ext4 /dev/nvme0n1p1 rw
61 22 259:5 /sub /mnt/bind rw,relatime shared:30 - ext4 /dev/nvme0n1p1 rw
70 22 0:40 / /run/user/1000 rw - tmpfs tmpfs rw
80 22 8:1 / /run/media/me/My\\040Stick rw - exfat /dev/sda1 rw";

    #[test]
    fn parses_and_filters_mountinfo() {
        let mounts: Vec<Mount> = parse_mountinfo(SAMPLE)
            .into_iter()
            .filter(is_user_facing)
            .collect();
        let points: Vec<_> = mounts
            .iter()
            .map(|m| m.target.to_string_lossy().into_owned())
            .collect();
        assert_eq!(points, ["/", "/home/me/storage", "/run/media/me/My Stick"]);
    }

    #[test]
    fn unescapes_octal_and_udev_sequences() {
        assert_eq!(unescape("My\\040Stick"), "My Stick");
        assert_eq!(unescape("trailing\\"), "trailing\\");
        assert_eq!(unescape_udev("My\\x20Stick"), "My Stick");
    }

    #[test]
    fn capitalizes_labels() {
        assert_eq!(capitalize("storage"), "Storage");
        assert_eq!(capitalize(""), "");
    }
}
