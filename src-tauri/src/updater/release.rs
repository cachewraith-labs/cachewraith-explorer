//! The latest GitHub release and the package asset that fits this installation.

use semver::Version;
use serde::Deserialize;

use crate::error::{AppError, AppResult};

pub const REPOSITORY: &str = "cachewraith-labs/cachewraith-explorer";

/// The package formats that are published for each release.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackageKind {
    AppImage,
    Deb,
    Rpm,
}

impl PackageKind {
    fn matches(self, asset_name: &str) -> bool {
        match self {
            Self::AppImage => asset_name.ends_with("_amd64.AppImage"),
            Self::Deb => asset_name.ends_with("_amd64.deb"),
            Self::Rpm => asset_name.ends_with(".x86_64.rpm"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Asset {
    pub name: String,
    pub url: String,
    pub size: u64,
}

#[derive(Debug, Clone)]
pub struct Release {
    pub version: Version,
    pub page_url: String,
    assets: Vec<Asset>,
}

/// The Arch Linux build recipe attached to every release.
pub const PKGBUILD_ASSET: &str = "PKGBUILD";

impl Release {
    /// The package for `kind` and its detached signature (`<package>.sig`).
    pub fn package(&self, kind: PackageKind) -> Option<(&Asset, &Asset)> {
        let package = self.assets.iter().find(|a| kind.matches(&a.name))?;
        self.signed(package)
    }

    /// The asset named exactly `name` and its signature.
    pub fn named(&self, name: &str) -> Option<(&Asset, &Asset)> {
        let asset = self.assets.iter().find(|a| a.name == name)?;
        self.signed(asset)
    }

    fn signed<'a>(&'a self, asset: &'a Asset) -> Option<(&'a Asset, &'a Asset)> {
        let signature_name = format!("{}.sig", asset.name);
        let signature = self.assets.iter().find(|a| a.name == signature_name)?;
        Some((asset, signature))
    }
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
}

pub fn latest_release_url() -> String {
    format!("https://api.github.com/repos/{REPOSITORY}/releases/latest")
}

/// Parses the GitHub "latest release" response. Download URLs must point at this
/// repository on github.com over HTTPS; anything else is ignored.
pub fn parse(json: &str) -> AppResult<Release> {
    let release: GitHubRelease = serde_json::from_str(json)
        .map_err(|e| AppError::invalid(format!("Unexpected release data: {e}")))?;
    let version = Version::parse(release.tag_name.trim_start_matches('v')).map_err(|_| {
        AppError::invalid(format!(
            "Release tag is not a version: {}",
            release.tag_name
        ))
    })?;
    let allowed_prefix = format!("https://github.com/{REPOSITORY}/releases/download/");
    let assets = release
        .assets
        .into_iter()
        .filter(|asset| asset.browser_download_url.starts_with(&allowed_prefix))
        .map(|asset| Asset {
            name: asset.name,
            url: asset.browser_download_url,
            size: asset.size,
        })
        .collect();
    Ok(Release {
        version,
        page_url: release.html_url,
        assets,
    })
}

pub fn current_version() -> Version {
    Version::parse(env!("CARGO_PKG_VERSION")).expect("Cargo package version is valid semver")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"{
        "tag_name": "v0.2.0",
        "html_url": "https://github.com/cachewraith-labs/cachewraith-explorer/releases/tag/v0.2.0",
        "assets": [
            {"name": "cachewraith-explorer_0.2.0_amd64.deb", "size": 10,
             "browser_download_url": "https://github.com/cachewraith-labs/cachewraith-explorer/releases/download/v0.2.0/cachewraith-explorer_0.2.0_amd64.deb"},
            {"name": "cachewraith-explorer_0.2.0_amd64.deb.sig", "size": 1,
             "browser_download_url": "https://github.com/cachewraith-labs/cachewraith-explorer/releases/download/v0.2.0/cachewraith-explorer_0.2.0_amd64.deb.sig"},
            {"name": "cachewraith-explorer-0.2.0-1.x86_64.rpm", "size": 10,
             "browser_download_url": "https://evil.example/cachewraith-explorer-0.2.0-1.x86_64.rpm"},
            {"name": "cachewraith-explorer-0.2.0-1.x86_64.rpm.sig", "size": 1,
             "browser_download_url": "https://github.com/cachewraith-labs/cachewraith-explorer/releases/download/v0.2.0/cachewraith-explorer-0.2.0-1.x86_64.rpm.sig"},
            {"name": "PKGBUILD", "size": 900,
             "browser_download_url": "https://github.com/cachewraith-labs/cachewraith-explorer/releases/download/v0.2.0/PKGBUILD"},
            {"name": "PKGBUILD.sig", "size": 1,
             "browser_download_url": "https://github.com/cachewraith-labs/cachewraith-explorer/releases/download/v0.2.0/PKGBUILD.sig"},
            {"name": "cachewraith-explorer_0.2.0_amd64.AppImage", "size": 10,
             "browser_download_url": "https://github.com/cachewraith-labs/cachewraith-explorer/releases/download/v0.2.0/cachewraith-explorer_0.2.0_amd64.AppImage"}
        ]
    }"#;

    #[test]
    fn parses_version_and_pairs_packages_with_signatures() {
        let release = parse(SAMPLE).unwrap();
        assert_eq!(release.version, Version::new(0, 2, 0));
        let (deb, sig) = release.package(PackageKind::Deb).unwrap();
        assert!(deb.name.ends_with("_amd64.deb"), "{}", deb.name);
        assert_eq!(sig.name, format!("{}.sig", deb.name));
    }

    #[test]
    fn ignores_foreign_urls_and_unsigned_packages() {
        let release = parse(SAMPLE).unwrap();
        // The rpm points at another host, so it is dropped even though its .sig exists.
        assert!(release.package(PackageKind::Rpm).is_none());
        // The AppImage has no signature, so it cannot be installed.
        assert!(release.package(PackageKind::AppImage).is_none());
    }

    #[test]
    fn finds_the_signed_pkgbuild_by_exact_name() {
        let release = parse(SAMPLE).unwrap();
        let (pkgbuild, sig) = release.named(PKGBUILD_ASSET).unwrap();
        assert_eq!(
            (pkgbuild.name.as_str(), sig.name.as_str()),
            ("PKGBUILD", "PKGBUILD.sig")
        );
        assert!(release.named("PKGBUILD.sig").is_none());
    }

    #[test]
    fn rejects_non_version_tags() {
        assert!(parse(r#"{"tag_name": "nightly", "html_url": "x", "assets": []}"#).is_err());
    }
}
