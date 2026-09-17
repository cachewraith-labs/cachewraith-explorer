//! Signature checks for downloaded packages (OWASP A08: software integrity).
//!
//! Every release asset is signed in CI with a minisign key (`tauri signer sign`); only the
//! public half ships inside the app. A package whose signature does not match is never
//! installed, even if it came from the right URL.

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use minisign_verify::{PublicKey, Signature};

use crate::error::{AppError, AppResult};

/// Base64 of the minisign public key, as written by `tauri signer generate`.
pub const RELEASE_PUBLIC_KEY: &str = include_str!("../../updater-public.key");

/// Verifies `file` against a Tauri-format signature (base64 of a minisign `.sig`).
pub fn verify_file(file: &Path, signature_b64: &str, public_key_b64: &str) -> AppResult<()> {
    let public_key = PublicKey::decode(&decode_text(public_key_b64)?)
        .map_err(|_| AppError::invalid("Invalid update key"))?;
    let signature = Signature::decode(&decode_text(signature_b64)?)
        .map_err(|_| AppError::invalid("Invalid signature file"))?;

    let mut verifier = public_key
        .verify_stream(&signature)
        .map_err(|_| AppError::invalid("The package was not signed with the release key"))?;
    let mut reader = BufReader::new(File::open(file).map_err(|e| AppError::io(file, e))?);
    let mut buffer = vec![0u8; 256 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|e| AppError::io(file, e))?;
        if read == 0 {
            break;
        }
        verifier.update(&buffer[..read]);
    }
    verifier.finalize().map_err(|_| {
        AppError::invalid("Signature check failed: the download is corrupt or was tampered with")
    })
}

fn decode_text(b64: &str) -> AppResult<String> {
    let bytes = STANDARD
        .decode(b64.trim())
        .map_err(|_| AppError::invalid("Signature data is not valid base64"))?;
    String::from_utf8(bytes).map_err(|_| AppError::invalid("Signature data is not text"))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    // A throwaway key pair made only for these tests; it signs nothing real.
    const TEST_KEY: &str = include_str!("fixtures/test-key.pub");
    const SIGNATURE: &str = include_str!("fixtures/payload.bin.sig");

    fn fixture(name: &str) -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/updater/fixtures")
            .join(name)
    }

    #[test]
    fn accepts_a_correctly_signed_file() {
        verify_file(&fixture("payload.bin"), SIGNATURE, TEST_KEY).unwrap();
    }

    #[test]
    fn rejects_a_modified_file() {
        let dir = tempfile::tempdir().unwrap();
        let tampered = dir.path().join("payload.bin");
        let mut bytes = fs::read(fixture("payload.bin")).unwrap();
        bytes[0] ^= 1;
        fs::write(&tampered, bytes).unwrap();
        assert!(verify_file(&tampered, SIGNATURE, TEST_KEY).is_err());
    }

    /// Maintainer check before publishing: every package in `$PACKAGES_DIR` (e.g.
    /// `../dist-packages`) must verify against the key shipped in the app.
    /// `PACKAGES_DIR=../dist-packages cargo test release_packages -- --ignored`
    #[test]
    #[ignore = "needs built packages"]
    fn release_packages_verify_with_the_shipped_key() {
        let dir = std::env::var("PACKAGES_DIR").expect("set PACKAGES_DIR");
        let mut checked = 0;
        for entry in fs::read_dir(&dir).unwrap() {
            let path = entry.unwrap().path();
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if path.extension().is_some_and(|ext| ext == "sig") || name == "SHA256SUMS" {
                continue;
            }
            let signature = fs::read_to_string(format!("{}.sig", path.display())).unwrap();
            verify_file(&path, &signature, RELEASE_PUBLIC_KEY)
                .unwrap_or_else(|e| panic!("{name}: {e}"));
            checked += 1;
        }
        assert_eq!(checked, 3, "expected .deb, .rpm and AppImage");
    }

    #[test]
    fn rejects_a_signature_from_another_key() {
        // The shipped release key did not make the test signature.
        assert!(verify_file(&fixture("payload.bin"), SIGNATURE, RELEASE_PUBLIC_KEY).is_err());
    }
}
