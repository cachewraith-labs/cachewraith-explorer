//! "Compress": packs files and folders into one archive next to them.
//!
//! Pattern: one tree walk feeding an [`ArchiveWriter`], with an implementation per
//! container (zip, tar, 7z) because each library has its own stateful API. Tar's
//! compression (gzip, xz, zstd, bzip2) is only a stream wrapper, so it is an enum
//! ([`TarStream`]) rather than more writers. Symlinks are stored as links, never followed;
//! 7z has no portable link entry, so it skips them.
//!
//! A failed or cancelled job removes its partial archive.

use std::ffi::OsString;
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{self, BufWriter, Read, Write};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::jobs::progress::RunContext;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum ArchiveFormat {
    #[default]
    #[serde(rename = "zip")]
    Zip,
    #[serde(rename = "tar")]
    Tar,
    #[serde(rename = "tar.gz")]
    TarGz,
    #[serde(rename = "tar.xz")]
    TarXz,
    #[serde(rename = "tar.zst")]
    TarZst,
    #[serde(rename = "tar.bz2")]
    TarBz2,
    #[serde(rename = "7z")]
    SevenZ,
}

impl ArchiveFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Zip => "zip",
            Self::Tar => "tar",
            Self::TarGz => "tar.gz",
            Self::TarXz => "tar.xz",
            Self::TarZst => "tar.zst",
            Self::TarBz2 => "tar.bz2",
            Self::SevenZ => "7z",
        }
    }
}

/// Compresses `sources` into a new archive in `dest_dir`. Returns the archive's path.
pub fn compress(
    sources: &[PathBuf],
    dest_dir: &Path,
    format: ArchiveFormat,
    ctx: &mut RunContext,
) -> AppResult<PathBuf> {
    for source in sources {
        if dest_dir.starts_with(source) {
            return Err(AppError::invalid(
                "Cannot put an archive inside what it compresses",
            ));
        }
        let (bytes, items) = super::transfer::measure(source)?;
        ctx.add_totals(bytes, items);
    }

    let target = unique_archive_path(
        dest_dir,
        &archive_stem(sources, dest_dir),
        format.extension(),
    );
    // `create_new`: never overwrite, even if a file appeared since the name was chosen.
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o644)
        .open(&target)
        .map_err(|e| AppError::io(&target, e))?;

    let result = write_archive(file, sources, format, ctx);
    if result.is_err() {
        let _ = fs::remove_file(&target);
    }
    result.map(|()| target)
}

fn write_archive(
    file: File,
    sources: &[PathBuf],
    format: ArchiveFormat,
    ctx: &mut RunContext,
) -> AppResult<()> {
    let out = BufWriter::with_capacity(1024 * 1024, file);
    match format {
        ArchiveFormat::Zip => pack(ZipArchive::new(out), sources, ctx),
        ArchiveFormat::SevenZ => pack(SevenZArchive::new(out)?, sources, ctx),
        tar => pack(TarArchive::new(TarStream::new(out, tar)?), sources, ctx),
    }
}

fn pack<A: ArchiveWriter>(
    mut archive: A,
    sources: &[PathBuf],
    ctx: &mut RunContext,
) -> AppResult<()> {
    for source in sources {
        let name = source
            .file_name()
            .ok_or_else(|| AppError::invalid(format!("{} has no file name", source.display())))?;
        add_tree(&mut archive, source, &entry_name(Path::new(name))?, ctx)?;
    }
    ctx.checkpoint()?;
    archive.finish().map_err(|e| io_error(e, "archive", ctx))
}

fn add_tree<A: ArchiveWriter>(
    archive: &mut A,
    path: &Path,
    name: &str,
    ctx: &mut RunContext,
) -> AppResult<()> {
    ctx.checkpoint()?;
    ctx.item_started(path);
    let meta = fs::symlink_metadata(path).map_err(|e| AppError::io(path, e))?;
    let file_type = meta.file_type();

    if file_type.is_symlink() {
        let target = fs::read_link(path).map_err(|e| AppError::io(path, e))?;
        archive
            .add_symlink(name, &target, &meta)
            .map_err(|e| io_error(e, path, ctx))?;
    } else if file_type.is_dir() {
        archive
            .add_dir(name, path, &meta)
            .map_err(|e| io_error(e, path, ctx))?;
        let mut children: Vec<_> = fs::read_dir(path)
            .map_err(|e| AppError::io(path, e))?
            .collect::<Result<_, _>>()
            .map_err(|e| AppError::io(path, e))?;
        // Stable, reproducible order.
        children.sort_by_key(fs::DirEntry::file_name);
        for child in children {
            let child_name = format!("{name}/{}", entry_name(Path::new(&child.file_name()))?);
            add_tree(archive, &child.path(), &child_name, ctx)?;
        }
    } else if file_type.is_file() {
        let file = File::open(path).map_err(|e| AppError::io(path, e))?;
        let mut reader = ProgressReader { inner: file, ctx };
        archive
            .add_file(name, path, &meta, &mut reader)
            .map_err(|e| io_error(e, path, reader.ctx))?;
    }
    // Sockets, FIFOs and device nodes are skipped, as in copies.
    ctx.item_done();
    Ok(())
}

/// Counts bytes into the job's progress and stops promptly on pause or cancel.
struct ProgressReader<'a, R> {
    inner: R,
    ctx: &'a mut RunContext,
}

impl<R: Read> Read for ProgressReader<'_, R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.ctx
            .checkpoint()
            .map_err(|_| io::Error::new(io::ErrorKind::Interrupted, "cancelled"))?;
        let n = self.inner.read(buf)?;
        self.ctx.add_bytes(n as u64);
        Ok(n)
    }
}

/// A cancel surfaces from inside a library as an I/O error; report it as a cancel.
fn io_error(err: io::Error, context: impl AsRef<Path>, ctx: &mut RunContext) -> AppError {
    match ctx.checkpoint() {
        Err(cancelled) => cancelled,
        Ok(()) => AppError::io(context, err),
    }
}

/// Archive entry names are UTF-8 with `/` separators; names that are not UTF-8 are refused
/// rather than silently mangled.
fn entry_name(name: &Path) -> AppResult<String> {
    name.to_str().map(str::to_owned).ok_or_else(|| {
        AppError::invalid(format!("\"{}\" is not a valid UTF-8 name", name.display()))
    })
}

/// One item: its own name. Several: the folder they are in, like other file managers.
fn archive_stem(sources: &[PathBuf], dest_dir: &Path) -> OsString {
    let single = match sources {
        [only] => only.file_name(),
        _ => dest_dir.file_name(),
    };
    single.map_or_else(|| OsString::from("Archive"), ToOwned::to_owned)
}

/// `name.tar.gz`, then `name (2).tar.gz`… keeping the compound extension intact.
fn unique_archive_path(dir: &Path, stem: &std::ffi::OsStr, extension: &str) -> PathBuf {
    let stem = stem.to_string_lossy();
    let mut candidate = dir.join(format!("{stem}.{extension}"));
    let mut n: u64 = 2;
    while candidate.symlink_metadata().is_ok() {
        candidate = dir.join(format!("{stem} ({n}).{extension}"));
        n += 1;
    }
    candidate
}

trait ArchiveWriter {
    fn add_dir(&mut self, name: &str, path: &Path, meta: &Metadata) -> io::Result<()>;
    fn add_file(
        &mut self,
        name: &str,
        path: &Path,
        meta: &Metadata,
        data: &mut dyn Read,
    ) -> io::Result<()>;
    fn add_symlink(&mut self, name: &str, target: &Path, meta: &Metadata) -> io::Result<()>;
    fn finish(self) -> io::Result<()>;
}

// ---- zip ------------------------------------------------------------------------------

struct ZipArchive<W: Write + io::Seek> {
    zip: zip::ZipWriter<W>,
}

impl<W: Write + io::Seek> ZipArchive<W> {
    fn new(out: W) -> Self {
        Self {
            zip: zip::ZipWriter::new(out),
        }
    }

    /// DOS timestamps have no time zone, so the UTC modification time also goes in the
    /// Info-ZIP extended timestamp field (`UT`, 0x5455), which extractors prefer.
    fn options(meta: &Metadata) -> zip::write::FullFileOptions<'static> {
        const EXTENDED_TIMESTAMP: u16 = 0x5455;
        const HAS_MTIME: u8 = 1;
        let modified = meta
            .modified()
            .ok()
            .map(time::OffsetDateTime::from)
            .and_then(|t| {
                zip::DateTime::try_from(time::PrimitiveDateTime::new(t.date(), t.time())).ok()
            })
            .unwrap_or_default();
        let mut options = zip::write::FullFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .last_modified_time(modified)
            .unix_permissions(meta.mode() & 0o7777)
            .large_file(meta.len() >= u64::from(u32::MAX));
        if let Ok(mtime) = i32::try_from(meta.mtime()) {
            let mut field = vec![HAS_MTIME];
            field.extend_from_slice(&mtime.to_le_bytes());
            // Five bytes always fit, so this cannot fail.
            let _ = options.add_extra_data(EXTENDED_TIMESTAMP, field, false);
        }
        options
    }
}

impl<W: Write + io::Seek> ArchiveWriter for ZipArchive<W> {
    fn add_dir(&mut self, name: &str, _path: &Path, meta: &Metadata) -> io::Result<()> {
        self.zip
            .add_directory(format!("{name}/"), Self::options(meta))
            .map_err(io::Error::other)
    }

    fn add_file(
        &mut self,
        name: &str,
        _path: &Path,
        meta: &Metadata,
        data: &mut dyn Read,
    ) -> io::Result<()> {
        self.zip
            .start_file(name, Self::options(meta))
            .map_err(io::Error::other)?;
        io::copy(data, &mut self.zip)?;
        Ok(())
    }

    fn add_symlink(&mut self, name: &str, target: &Path, meta: &Metadata) -> io::Result<()> {
        self.zip
            .add_symlink(name, target.to_string_lossy(), Self::options(meta))
            .map_err(io::Error::other)
    }

    fn finish(self) -> io::Result<()> {
        self.zip.finish().map_err(io::Error::other)?.flush()
    }
}

// ---- tar ------------------------------------------------------------------------------

/// The byte stream under a tar archive: plain, or one of four compressors.
enum TarStream<W: Write> {
    Plain(W),
    Gz(flate2::write::GzEncoder<W>),
    Xz(liblzma::write::XzEncoder<W>),
    Zst(zstd::Encoder<'static, W>),
    Bz2(bzip2::write::BzEncoder<W>),
}

impl<W: Write> TarStream<W> {
    fn new(out: W, format: ArchiveFormat) -> AppResult<Self> {
        Ok(match format {
            ArchiveFormat::TarGz => Self::Gz(flate2::write::GzEncoder::new(
                out,
                flate2::Compression::default(),
            )),
            ArchiveFormat::TarXz => Self::Xz(liblzma::write::XzEncoder::new(out, 6)),
            ArchiveFormat::TarZst => {
                Self::Zst(zstd::Encoder::new(out, 3).map_err(|e| AppError::io("zstd", e))?)
            }
            ArchiveFormat::TarBz2 => Self::Bz2(bzip2::write::BzEncoder::new(
                out,
                bzip2::Compression::default(),
            )),
            _ => Self::Plain(out),
        })
    }

    fn finish(self) -> io::Result<()> {
        let mut out = match self {
            Self::Plain(w) => w,
            Self::Gz(e) => e.finish()?,
            Self::Xz(e) => e.finish()?,
            Self::Zst(e) => e.finish()?,
            Self::Bz2(e) => e.finish()?,
        };
        out.flush()
    }
}

impl<W: Write> Write for TarStream<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self {
            Self::Plain(w) => w.write(buf),
            Self::Gz(e) => e.write(buf),
            Self::Xz(e) => e.write(buf),
            Self::Zst(e) => e.write(buf),
            Self::Bz2(e) => e.write(buf),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self {
            Self::Plain(w) => w.flush(),
            Self::Gz(e) => e.flush(),
            Self::Xz(e) => e.flush(),
            Self::Zst(e) => e.flush(),
            Self::Bz2(e) => e.flush(),
        }
    }
}

struct TarArchive<W: Write> {
    tar: tar::Builder<TarStream<W>>,
}

impl<W: Write> TarArchive<W> {
    fn new(stream: TarStream<W>) -> Self {
        let mut tar = tar::Builder::new(stream);
        tar.follow_symlinks(false);
        Self { tar }
    }

    fn header(meta: &Metadata, kind: tar::EntryType) -> tar::Header {
        let mut header = tar::Header::new_gnu();
        header.set_metadata_in_mode(meta, tar::HeaderMode::Complete);
        header.set_entry_type(kind);
        if kind != tar::EntryType::Regular {
            header.set_size(0);
        }
        header
    }
}

impl<W: Write> ArchiveWriter for TarArchive<W> {
    fn add_dir(&mut self, name: &str, _path: &Path, meta: &Metadata) -> io::Result<()> {
        let mut header = Self::header(meta, tar::EntryType::Directory);
        self.tar
            .append_data(&mut header, format!("{name}/"), io::empty())
    }

    fn add_file(
        &mut self,
        name: &str,
        _path: &Path,
        meta: &Metadata,
        data: &mut dyn Read,
    ) -> io::Result<()> {
        let mut header = Self::header(meta, tar::EntryType::Regular);
        // The header promised `meta.len()` bytes; a file that shrank meanwhile must not
        // leave a corrupt archive, so read exactly that many and pad if short.
        let len = meta.len();
        let exact = data.take(len).chain(io::repeat(0)).take(len);
        self.tar.append_data(&mut header, name, exact)
    }

    fn add_symlink(&mut self, name: &str, target: &Path, meta: &Metadata) -> io::Result<()> {
        let mut header = Self::header(meta, tar::EntryType::Symlink);
        self.tar.append_link(&mut header, name, target)
    }

    fn finish(self) -> io::Result<()> {
        self.tar.into_inner()?.finish()
    }
}

// ---- 7z -------------------------------------------------------------------------------

struct SevenZArchive<W: Write + io::Seek> {
    archive: sevenz_rust2::ArchiveWriter<W>,
}

impl<W: Write + io::Seek> SevenZArchive<W> {
    fn new(out: W) -> AppResult<Self> {
        let archive = sevenz_rust2::ArchiveWriter::new(out)
            .map_err(|e| AppError::invalid(format!("7z: {e}")))?;
        Ok(Self { archive })
    }

    /// 7z keeps Windows attributes; Unix permissions ride in the high 16 bits, flagged by
    /// `0x8000` (the p7zip convention every Linux extractor reads). Without them,
    /// extracted folders come out with no permissions at all.
    fn entry(path: &Path, name: &str, meta: &Metadata) -> sevenz_rust2::ArchiveEntry {
        const UNIX_EXTENSION: u32 = 0x8000;
        const DIRECTORY: u32 = 0x10;
        const ARCHIVE: u32 = 0x20;
        let mut entry = sevenz_rust2::ArchiveEntry::from_path(path, name.to_owned());
        let kind = if meta.is_dir() { DIRECTORY } else { ARCHIVE };
        entry.has_windows_attributes = true;
        entry.windows_attributes = ((meta.mode() & 0xFFFF) << 16) | UNIX_EXTENSION | kind;
        entry
    }
}

impl<W: Write + io::Seek> ArchiveWriter for SevenZArchive<W> {
    fn add_dir(&mut self, name: &str, path: &Path, meta: &Metadata) -> io::Result<()> {
        let entry = Self::entry(path, name, meta);
        self.archive
            .push_archive_entry::<&[u8]>(entry, None)
            .map(|_| ())
            .map_err(io::Error::other)
    }

    fn add_file(
        &mut self,
        name: &str,
        path: &Path,
        meta: &Metadata,
        data: &mut dyn Read,
    ) -> io::Result<()> {
        let entry = Self::entry(path, name, meta);
        self.archive
            .push_archive_entry(entry, Some(data))
            .map(|_| ())
            .map_err(io::Error::other)
    }

    fn add_symlink(&mut self, _name: &str, _target: &Path, _meta: &Metadata) -> io::Result<()> {
        Ok(())
    }

    fn finish(self) -> io::Result<()> {
        self.archive.finish()?.flush()
    }
}
