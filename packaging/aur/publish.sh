#!/usr/bin/env bash
# Pushes a rendered PKGBUILD and .SRCINFO to the AUR.
#   packaging/aur/publish.sh [rendered dir]
# Uses $AUR_SSH_PRIVATE_KEY when set (CI), otherwise your ~/.ssh config.
set -euo pipefail

src="${1:-packaging/aur/out}"
package="cachewraith-explorer-bin"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Pin the AUR host key (fingerprint SHA256:RFzBCUItH9LZS0cKB5UE6ceAYhBD5C8GeOBip8Z11+4,
# as published on the Arch Wiki) instead of trusting whatever answers.
echo "aur.archlinux.org ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIEuBKrPzbawxA/k2g6NcyV5jmqwJ2s+zpgZGZ7tpLIcN" > "$work/known_hosts"
ssh_command="ssh -o UserKnownHostsFile=$work/known_hosts -o StrictHostKeyChecking=yes"
if [[ -n "${AUR_SSH_PRIVATE_KEY:-}" ]]; then
    (umask 077 && printf '%s\n' "$AUR_SSH_PRIVATE_KEY" > "$work/key")
    ssh_command="$ssh_command -i $work/key -o IdentitiesOnly=yes"
fi
export GIT_SSH_COMMAND="$ssh_command"

git clone "ssh://aur@aur.archlinux.org/$package.git" "$work/repo"
cp "$src/PKGBUILD" "$src/.SRCINFO" "$work/repo/"
cd "$work/repo"
version="$(sed -n 's/^\tpkgver = //p' .SRCINFO)"
git -c user.name="cachewraith" -c user.email="somonorhong011@gmail.com" add PKGBUILD .SRCINFO
if git diff --cached --quiet; then
    echo "AUR already has $version"
    exit 0
fi
git -c user.name="cachewraith" -c user.email="somonorhong011@gmail.com" commit -q -m "Update to $version"
git push origin HEAD:master
echo "Published $package $version to the AUR"
