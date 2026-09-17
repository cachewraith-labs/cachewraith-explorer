//! `thumb://localhost/<percent-encoded path>?s=256` — image thumbnails for the grid and the
//! preview panel.
//!
//! Only files with an image extension are decoded, decoding runs with size and memory
//! limits (a crafted "decompression bomb" fails instead of exhausting RAM), concurrency is
//! capped, and results are cached per path + size + mtime in a private (0700) directory.

use std::fs::{self, DirBuilder};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::Cursor;
use std::os::unix::fs::{DirBuilderExt, MetadataExt};
use std::path::{Path, PathBuf};

use image::codecs::jpeg::JpegEncoder;
use image::{ImageFormat, ImageReader, Limits};
use percent_encoding::percent_decode_str;
use tauri::http::{Response, StatusCode, Uri, header};
use tokio::sync::Semaphore;

use crate::fs::paths;

pub const SCHEME: &str = "thumb";

const SIZES: [u32; 2] = [256, 512];
const MAX_SOURCE_BYTES: u64 = 80 * 1024 * 1024;
const MAX_DIMENSION: u32 = 20_000;
const MAX_DECODE_ALLOC: u64 = 512 * 1024 * 1024;
const JPEG_QUALITY: u8 = 82;
const SUPPORTED: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "tif", "tiff",
];

pub struct ThumbnailService {
    cache_dir: Option<PathBuf>,
    permits: Semaphore,
}

struct Thumbnail {
    bytes: Vec<u8>,
    mime: &'static str,
}

impl ThumbnailService {
    pub fn new() -> Self {
        let cores = std::thread::available_parallelism().map_or(4, usize::from);
        Self {
            cache_dir: dirs::cache_dir().map(|dir| dir.join("cachewraith-explorer/thumbnails")),
            permits: Semaphore::new((cores / 2).max(2)),
        }
    }

    pub async fn respond(&self, uri: &Uri) -> Response<Vec<u8>> {
        let Some((path, size)) = parse_request(uri) else {
            return empty(StatusCode::BAD_REQUEST);
        };
        let Ok(_permit) = self.permits.acquire().await else {
            return empty(StatusCode::SERVICE_UNAVAILABLE);
        };
        let cache_dir = self.cache_dir.clone();
        let job =
            tauri::async_runtime::spawn_blocking(move || render(&path, size, cache_dir.as_deref()));
        match job.await {
            Ok(Some(thumb)) => Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, thumb.mime)
                .header(header::CACHE_CONTROL, "private, max-age=86400")
                .body(thumb.bytes)
                .unwrap_or_else(|_| empty(StatusCode::INTERNAL_SERVER_ERROR)),
            _ => empty(StatusCode::NOT_FOUND),
        }
    }
}

fn parse_request(uri: &Uri) -> Option<(PathBuf, u32)> {
    let encoded = uri.path().strip_prefix('/')?;
    let decoded = percent_decode_str(encoded).decode_utf8().ok()?;
    let path = paths::parse_absolute(&decoded).ok()?;
    let size = uri
        .query()
        .and_then(|q| q.split('&').find_map(|pair| pair.strip_prefix("s=")))
        .and_then(|s| s.parse().ok())
        .filter(|s| SIZES.contains(s))
        .unwrap_or(SIZES[0]);
    Some((path, size))
}

fn render(path: &Path, size: u32, cache_dir: Option<&Path>) -> Option<Thumbnail> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    if !SUPPORTED.contains(&ext.as_str()) {
        return None;
    }
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_SOURCE_BYTES {
        return None;
    }

    let key = cache_key(path, size, &meta);
    if let Some(hit) = cache_dir.and_then(|dir| read_cached(dir, key)) {
        return Some(hit);
    }

    let mut reader = ImageReader::open(path).ok()?.with_guessed_format().ok()?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits.max_alloc = Some(MAX_DECODE_ALLOC);
    reader.limits(limits);
    let image = reader.decode().ok()?.thumbnail(size, size);

    let mut bytes = Vec::new();
    let thumb = if image.color().has_alpha() {
        image
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .ok()?;
        Thumbnail {
            bytes,
            mime: "image/png",
        }
    } else {
        image
            .to_rgb8()
            .write_with_encoder(JpegEncoder::new_with_quality(&mut bytes, JPEG_QUALITY))
            .ok()?;
        Thumbnail {
            bytes,
            mime: "image/jpeg",
        }
    };
    if let Some(dir) = cache_dir {
        write_cached(dir, key, &thumb);
    }
    Some(thumb)
}

fn cache_key(path: &Path, size: u32, meta: &fs::Metadata) -> u64 {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    size.hash(&mut hasher);
    meta.len().hash(&mut hasher);
    meta.mtime().hash(&mut hasher);
    meta.mtime_nsec().hash(&mut hasher);
    hasher.finish()
}

fn read_cached(dir: &Path, key: u64) -> Option<Thumbnail> {
    [("jpg", "image/jpeg"), ("png", "image/png")]
        .into_iter()
        .find_map(|(ext, mime)| {
            fs::read(dir.join(format!("{key:016x}.{ext}")))
                .ok()
                .map(|bytes| Thumbnail { bytes, mime })
        })
}

fn write_cached(dir: &Path, key: u64, thumb: &Thumbnail) {
    if DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(dir)
        .is_err()
    {
        return;
    }
    let ext = if thumb.mime == "image/png" {
        "png"
    } else {
        "jpg"
    };
    let target = dir.join(format!("{key:016x}.{ext}"));
    let temp = dir.join(format!(".{key:016x}.{ext}.tmp"));
    if fs::write(&temp, &thumb.bytes).is_ok() && fs::rename(&temp, &target).is_err() {
        let _ = fs::remove_file(&temp);
    }
}

fn empty(status: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = status;
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_paths_and_clamps_sizes() {
        let uri: Uri = "thumb://localhost/%2Fhome%2Fme%2Fa%20b.png?s=512"
            .parse()
            .unwrap();
        assert_eq!(
            parse_request(&uri),
            Some((PathBuf::from("/home/me/a b.png"), 512))
        );
        let odd: Uri = "thumb://localhost/%2Ftmp%2Fx.png?s=9999".parse().unwrap();
        assert_eq!(parse_request(&odd).unwrap().1, 256);
        let relative: Uri = "thumb://localhost/relative.png".parse().unwrap();
        assert!(parse_request(&relative).is_none());
    }

    #[test]
    fn renders_and_caches_a_thumbnail() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("pic.png");
        image::RgbImage::from_pixel(900, 600, image::Rgb([200, 120, 90]))
            .save(&source)
            .unwrap();
        let cache = dir.path().join("cache");

        let first = render(&source, 256, Some(&cache)).unwrap();
        assert_eq!(first.mime, "image/jpeg");
        assert_eq!(fs::read_dir(&cache).unwrap().count(), 1);
        assert!(render(&dir.path().join("notes.txt"), 256, Some(&cache)).is_none());
    }
}
