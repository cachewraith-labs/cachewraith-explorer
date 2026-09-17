//! The actual copy / move / trash / delete work. Every function here is safe to cancel:
//! a half-written file is removed, and a move only deletes its source after the copy
//! finished.

use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, symlink};
use std::path::{Path, PathBuf};

use rustix::fs::{CWD, RenameFlags, renameat_with};
use rustix::io::Errno;

use crate::error::{AppError, AppResult};
use crate::fs::{PathChange, paths};
use crate::jobs::progress::RunContext;

/// Bytes per `copy_file_range` call / read buffer. Small enough for smooth progress and
/// prompt cancel, large enough that syscall overhead is irrelevant.
const CHUNK: usize = 16 * 1024 * 1024;
const FALLBACK_BUFFER: usize = 1024 * 1024;

pub fn copy_into(sources: &[PathBuf], dest_dir: &Path, ctx: &mut RunContext) -> AppResult<()> {
    ensure_dir(dest_dir)?;
    for source in sources {
        ensure_not_into_itself(source, dest_dir)?;
        let (bytes, items) = measure(source)?;
        ctx.add_totals(bytes, items);
    }
    for source in sources {
        let target = paths::unique_destination(dest_dir, file_name(source)?);
        copy_tree(source, &target, ctx)?;
    }
    Ok(())
}

pub fn move_into(sources: &[PathBuf], dest_dir: &Path, ctx: &mut RunContext) -> AppResult<()> {
    let dest_meta = ensure_dir(dest_dir)?;
    let mut plan = Vec::with_capacity(sources.len());
    for source in sources {
        if source.parent() == Some(dest_dir) {
            continue; // already there
        }
        ensure_not_into_itself(source, dest_dir)?;
        let meta = fs::symlink_metadata(source).map_err(|e| AppError::io(source, e))?;
        let same_device = meta.dev() == dest_meta.dev();
        let (bytes, items) = if same_device {
            (0, 1)
        } else {
            measure(source)?
        };
        ctx.add_totals(bytes, items);
        plan.push((source, same_device));
    }

    for (source, same_device) in plan {
        ctx.checkpoint()?;
        let target = paths::unique_destination(dest_dir, file_name(source)?);
        if same_device {
            ctx.item_started(source);
            match renameat_with(CWD, source, CWD, &target, RenameFlags::NOREPLACE) {
                Ok(()) => {
                    ctx.item_done();
                    ctx.path_changed(PathChange::Moved {
                        from: source.clone(),
                        to: target,
                    });
                    continue;
                }
                // Same st_dev but a different mount (e.g. bind mount): fall through to copy.
                Err(Errno::XDEV) => {
                    let (bytes, items) = measure(source)?;
                    ctx.add_totals(bytes, items.saturating_sub(1));
                }
                Err(errno) => return Err(AppError::io(&target, errno.into())),
            }
        }
        copy_tree(source, &target, ctx)?;
        remove_path(source)?;
        ctx.path_changed(PathChange::Moved {
            from: source.clone(),
            to: target,
        });
    }
    Ok(())
}

pub fn trash(sources: &[PathBuf], ctx: &mut RunContext) -> AppResult<()> {
    ctx.add_totals(0, sources.len() as u64);
    for source in sources {
        ctx.checkpoint()?;
        ctx.item_started(source);
        trash::delete(source)?;
        ctx.item_done();
    }
    Ok(())
}

pub fn delete(sources: &[PathBuf], ctx: &mut RunContext) -> AppResult<()> {
    ctx.add_totals(0, sources.len() as u64);
    for source in sources {
        ctx.checkpoint()?;
        ctx.item_started(source);
        remove_path(source)?;
        ctx.item_done();
        ctx.path_changed(PathChange::Deleted(source.clone()));
    }
    Ok(())
}

fn copy_tree(source: &Path, target: &Path, ctx: &mut RunContext) -> AppResult<()> {
    ctx.checkpoint()?;
    ctx.item_started(source);
    let meta = fs::symlink_metadata(source).map_err(|e| AppError::io(source, e))?;
    let file_type = meta.file_type();

    if file_type.is_symlink() {
        // Copy the link itself, never what it points at: no surprise duplication, no loops.
        let link = fs::read_link(source).map_err(|e| AppError::io(source, e))?;
        symlink(link, target).map_err(|e| AppError::io(target, e))?;
    } else if file_type.is_dir() {
        fs::create_dir(target).map_err(|e| AppError::io(target, e))?;
        for child in fs::read_dir(source).map_err(|e| AppError::io(source, e))? {
            let child = child.map_err(|e| AppError::io(source, e))?;
            copy_tree(&child.path(), &target.join(child.file_name()), ctx)?;
        }
        fs::set_permissions(target, meta.permissions()).map_err(|e| AppError::io(target, e))?;
    } else if file_type.is_file() {
        copy_file(source, target, &meta, ctx)?;
    }
    // Sockets, FIFOs and device nodes are skipped on purpose; they are not "files" to copy.
    ctx.item_done();
    Ok(())
}

fn copy_file(source: &Path, target: &Path, meta: &Metadata, ctx: &mut RunContext) -> AppResult<()> {
    let input = File::open(source).map_err(|e| AppError::io(source, e))?;
    // `create_new` refuses to open anything that already exists, and 0o600 keeps the
    // partial file private until the real permissions are applied at the end.
    let output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(target)
        .map_err(|e| AppError::io(target, e))?;

    let finished = pump(&input, &output, meta.len(), source, ctx).and_then(|()| {
        output
            .set_permissions(meta.permissions())
            .map_err(|e| AppError::io(target, e))?;
        if let Ok(modified) = meta.modified() {
            let _ = output.set_modified(modified);
        }
        Ok(())
    });
    if finished.is_err() {
        drop(output);
        let _ = fs::remove_file(target);
    }
    finished
}

/// Copies bytes with `copy_file_range` (in-kernel, reflinks where the filesystem supports
/// it), falling back to a plain read/write loop when the kernel refuses.
fn pump(
    mut input: &File,
    mut output: &File,
    expected: u64,
    source: &Path,
    ctx: &mut RunContext,
) -> AppResult<()> {
    let mut copied: u64 = 0;
    let mut kernel = true;
    let mut buffer = Vec::new();
    loop {
        ctx.checkpoint()?;
        let written = if kernel {
            match rustix::fs::copy_file_range(input, None, output, None, CHUNK) {
                // Some filesystems report 0 before the real end; let the fallback verify.
                Ok(0) if copied < expected => {
                    kernel = false;
                    continue;
                }
                Ok(n) => n,
                Err(Errno::XDEV | Errno::INVAL | Errno::NOSYS | Errno::OPNOTSUPP | Errno::PERM)
                    if copied == 0 =>
                {
                    kernel = false;
                    continue;
                }
                Err(errno) => return Err(AppError::io(source, errno.into())),
            }
        } else {
            if buffer.is_empty() {
                buffer = vec![0; FALLBACK_BUFFER];
            }
            let n = read_retrying(&mut input, &mut buffer).map_err(|e| AppError::io(source, e))?;
            output
                .write_all(&buffer[..n])
                .map_err(|e| AppError::io(source, e))?;
            n
        };
        if written == 0 {
            return Ok(());
        }
        copied += written as u64;
        ctx.add_bytes(written as u64);
    }
}

fn read_retrying(input: &mut &File, buffer: &mut [u8]) -> io::Result<usize> {
    loop {
        let result = input.read(buffer);
        if !matches!(&result, Err(e) if e.kind() == io::ErrorKind::Interrupted) {
            return result;
        }
    }
}

fn remove_path(path: &Path) -> AppResult<()> {
    let meta = fs::symlink_metadata(path).map_err(|e| AppError::io(path, e))?;
    // `remove_dir_all` does not follow symlinks, so a link to `/` only removes the link.
    let result = if meta.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
    result.map_err(|e| AppError::io(path, e))
}

/// Total bytes and item count of a tree, without following symlinks.
fn measure(path: &Path) -> AppResult<(u64, u64)> {
    let meta = fs::symlink_metadata(path).map_err(|e| AppError::io(path, e))?;
    if !meta.is_dir() {
        return Ok((if meta.is_file() { meta.len() } else { 0 }, 1));
    }
    let mut totals = (0, 1);
    for child in fs::read_dir(path).map_err(|e| AppError::io(path, e))? {
        let child = child.map_err(|e| AppError::io(path, e))?;
        let (bytes, items) = measure(&child.path())?;
        totals.0 += bytes;
        totals.1 += items;
    }
    Ok(totals)
}

fn ensure_dir(path: &Path) -> AppResult<Metadata> {
    let meta = fs::metadata(path).map_err(|e| AppError::io(path, e))?;
    if !meta.is_dir() {
        return Err(AppError::invalid(format!(
            "{} is not a folder",
            path.display()
        )));
    }
    Ok(meta)
}

fn ensure_not_into_itself(source: &Path, dest_dir: &Path) -> AppResult<()> {
    if dest_dir.starts_with(source) {
        return Err(AppError::invalid(format!(
            "Cannot put \"{}\" inside itself",
            source
                .file_name()
                .map_or_else(|| source.to_string_lossy(), |n| n.to_string_lossy())
        )));
    }
    Ok(())
}

fn file_name(path: &Path) -> AppResult<&std::ffi::OsStr> {
    path.file_name()
        .ok_or_else(|| AppError::invalid(format!("{} has no file name", path.display())))
}
