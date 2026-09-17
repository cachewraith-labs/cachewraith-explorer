#!/usr/bin/env bash
# Writes PKGBUILD and .SRCINFO for a release.
#   packaging/aur/render.sh <version> <path to the release .deb> [output dir]
# SRCINFO=0 skips .SRCINFO (it needs makepkg, so it is only made on Arch).
set -euo pipefail

version="$1"
deb="$2"
out="${3:-packaging/aur/out}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Bad version: $version" >&2; exit 1; }
[[ -f "$deb" ]] || { echo "No such .deb: $deb" >&2; exit 1; }

mkdir -p "$out"
sed -e "s/@VERSION@/$version/" \
    -e "s/@DEB_SHA256@/$(sha256sum "$deb" | cut -d' ' -f1)/" \
    -e "s/@LICENSE_SHA256@/$(sha256sum "$root/LICENSE" | cut -d' ' -f1)/" \
    "$here/PKGBUILD.in" > "$out/PKGBUILD"

if [[ "${SRCINFO:-1}" == "0" ]]; then
    echo "Rendered $out/PKGBUILD for $version"
    exit 0
fi

# makepkg refuses to run as root (CI containers run as root).
if [[ "$(id -u)" -eq 0 ]]; then
    id builder >/dev/null 2>&1 || useradd -m builder
    chown -R builder "$out"
    su builder -c "cd '$out' && makepkg --printsrcinfo > .SRCINFO"
else
    (cd "$out" && makepkg --printsrcinfo > .SRCINFO)
fi
echo "Rendered $out/PKGBUILD and .SRCINFO for $version"
