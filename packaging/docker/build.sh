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
# The Arch recipe for this exact .deb, attached to the release and signed like the packages.
version="$(node -p "require('./package.json').version")"
SRCINFO=0 packaging/aur/render.sh "$version" "/out/cachewraith-explorer_${version}_amd64.deb" /out

# Sign every package for `cachewraith-explorer update`. The key only ever arrives through
# the environment (a CI secret or `make package-signed`); it is never written to disk here.
if [[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
    for package in /out/*.deb /out/*.rpm /out/*.AppImage /out/PKGBUILD; do
        pnpm --silent tauri signer sign "$package" > /dev/null
        echo "signed $(basename "$package")"
    done
else
    echo "WARNING: TAURI_SIGNING_PRIVATE_KEY is not set; packages are unsigned and cannot be installed by 'update'." >&2
fi

# Version-free copies, so install commands can always use .../releases/latest/download/<name>.
# Their names deliberately differ from the patterns the updater looks for.
cp /out/*_amd64.deb /out/cachewraith-explorer-amd64.deb
cp /out/*.x86_64.rpm /out/cachewraith-explorer-x86_64.rpm
cp /out/*_amd64.AppImage /out/cachewraith-explorer-x86_64.AppImage

(cd /out && sha256sum -- *.deb *.rpm *.AppImage PKGBUILD > SHA256SUMS)

# Hand the files to the user who ran the build, not root.
if [[ -n "${HOST_UID:-}" ]]; then
    chown -R "${HOST_UID}:${HOST_GID:-$HOST_UID}" /out
fi
