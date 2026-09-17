#!/usr/bin/env bash
# Runs inside the container. /src is the project (read-only), /out receives the packages.
set -euo pipefail

rsync -a --delete \
    --exclude node_modules --exclude dist --exclude src-tauri/target --exclude dist-packages \
    /src/ /build/
cd /build

pnpm install --frozen-lockfile
pnpm tauri build --bundles deb,rpm,appimage

mkdir -p /out
find src-tauri/target/release/bundle -maxdepth 2 -type f \
    \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) -exec cp -v {} /out/ \;
(cd /out && sha256sum -- *.deb *.rpm *.AppImage > SHA256SUMS)

# Sign every package for `cachewraith-explorer update`. The key only ever arrives through
# the environment (a CI secret or `make package-signed`); it is never written to disk here.
if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    for package in /out/*.deb /out/*.rpm /out/*.AppImage; do
        pnpm --silent tauri signer sign "$package" > /dev/null
        echo "signed $(basename "$package")"
    done
else
    echo "WARNING: TAURI_SIGNING_PRIVATE_KEY is not set; packages are unsigned and cannot be installed by 'update'." >&2
fi

# Hand the files to the user who ran the build, not root.
if [[ -n "${HOST_UID:-}" ]]; then
    chown -R "${HOST_UID}:${HOST_GID:-$HOST_UID}" /out
fi
