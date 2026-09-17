#!/bin/sh
# Installs Cachewraith Explorer with your distribution's own package manager.
#
#   curl -fsSL https://raw.githubusercontent.com/cachewraith-labs/cachewraith-explorer/main/install.sh | sh
#
# Debian/Ubuntu family -> .deb with apt      Fedora/RHEL family -> .rpm with dnf
# openSUSE             -> .rpm with zypper   Arch family        -> release PKGBUILD with makepkg
# anything else        -> AppImage in ~/.local/bin
set -eu

REPO="cachewraith-labs/cachewraith-explorer"
BASE="https://github.com/$REPO/releases/latest/download"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }

[ "$(uname -s)" = Linux ] || die "Cachewraith Explorer runs on Linux only."
[ "$(uname -m)" = x86_64 ] || die "Only x86_64 builds are published right now."
has curl || die "curl is required."

if [ "$(id -u)" -eq 0 ]; then
    SUDO=""
elif has sudo; then
    SUDO="sudo"
else
    SUDO=""
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# apt reads local packages as the _apt user, so the folder must be readable.
chmod 755 "$TMP"

download() {
    say "Downloading $1"
    curl -fL --proto '=https' --tlsv1.2 --progress-bar -o "$TMP/$1" "$BASE/$1"
    chmod 644 "$TMP/$1"
}

if has pacman; then
    [ "$(id -u)" -ne 0 ] || die "On Arch, run this as your normal user (makepkg refuses root)."
    say "Installing build tools (base-devel)"
    $SUDO pacman -S --needed --noconfirm base-devel
    download PKGBUILD
    mkdir "$TMP/arch" && mv "$TMP/PKGBUILD" "$TMP/arch/PKGBUILD"
    say "Building and installing the cachewraith-explorer-bin package"
    (cd "$TMP/arch" && makepkg -si --noconfirm)
elif has apt-get; then
    download cachewraith-explorer-amd64.deb
    $SUDO apt-get install -y "$TMP/cachewraith-explorer-amd64.deb"
elif has dnf; then
    download cachewraith-explorer-x86_64.rpm
    $SUDO dnf install -y "$TMP/cachewraith-explorer-x86_64.rpm"
elif has zypper; then
    download cachewraith-explorer-x86_64.rpm
    $SUDO zypper --non-interactive install --allow-unsigned-rpm "$TMP/cachewraith-explorer-x86_64.rpm"
else
    download cachewraith-explorer-x86_64.AppImage
    mkdir -p "$HOME/.local/bin"
    install -m 755 "$TMP/cachewraith-explorer-x86_64.AppImage" "$HOME/.local/bin/cachewraith-explorer"
    say "Installed the AppImage to ~/.local/bin/cachewraith-explorer"
    say "AppImages need FUSE 2 (the 'fuse2' or 'libfuse2' package on most distributions)."
fi

say "Done. Start Files from your app menu, or run: cachewraith-explorer"
say "Make it your file manager: cachewraith-explorer --make-default"
say "Update later with:         cachewraith-explorer update"
