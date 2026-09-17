# Cachewraith Explorer

A fast, good-looking file manager for Linux, built around Material You.

It follows your wallpaper's colors (or any color you pick), gives files VS Code's Material
icons, and is as comfortable with the keyboard as with the mouse. It runs on GNOME, KDE,
XFCE, Cinnamon and tiling compositors like Hyprland and Sway.

## Features

- **Tabs and split view**, with drag and drop between panes, folders and drives
- **Grid and list views** that stay smooth in huge folders
- **Background copy, move and delete** with progress, speed, pause and cancel
- **Search** that filters instantly, or searches every subfolder
- **Material You theming** from your wallpaper, or any color, in light or dark
- **VS Code file icons**, and custom icons for any folder
- **Photo previews** for images, a details panel, and a Properties window with live folder size
- **Trash** with restore, **drive cards** with usage, **pinned folders**
- **Command palette** (Ctrl+K) and a shortcut for almost everything
- **Set as default file manager** in one click
- **One-command updates**: `cachewraith-explorer update`

## Install

### Quick install (any distribution)

```sh
curl -fsSL https://raw.githubusercontent.com/cachewraith-labs/cachewraith-explorer/main/install.sh | sh
```

The script uses your distribution's package manager: apt, dnf, zypper, or pacman. On anything
else it installs the AppImage. Prefer to see what runs? Use the commands below.

### Ubuntu, Debian, Linux Mint, Pop!\_OS, elementary OS, Zorin OS

```sh
curl -fLO https://github.com/cachewraith-labs/cachewraith-explorer/releases/latest/download/cachewraith-explorer-amd64.deb
sudo apt install ./cachewraith-explorer-amd64.deb
```

### Fedora, RHEL, Rocky Linux, AlmaLinux, Nobara

```sh
sudo dnf install https://github.com/cachewraith-labs/cachewraith-explorer/releases/latest/download/cachewraith-explorer-x86_64.rpm
```

### openSUSE Tumbleweed and Leap

```sh
curl -fLO https://github.com/cachewraith-labs/cachewraith-explorer/releases/latest/download/cachewraith-explorer-x86_64.rpm
sudo zypper install --allow-unsigned-rpm ./cachewraith-explorer-x86_64.rpm
```

### Arch Linux, Manjaro, EndeavourOS, CachyOS

Build the package from the signed PKGBUILD attached to every release:

```sh
sudo pacman -S --needed base-devel
mkdir -p ~/.cache/cachewraith-explorer-pkg && cd ~/.cache/cachewraith-explorer-pkg
curl -fLO https://github.com/cachewraith-labs/cachewraith-explorer/releases/latest/download/PKGBUILD
makepkg -si
```

It installs `cachewraith-explorer-bin` through pacman, with its dependencies. An AUR package
(`yay -S cachewraith-explorer-bin`) will follow once AUR account registration reopens.

### Any distribution: AppImage

No installation; one file you can run from anywhere.

```sh
curl -fLo cachewraith-explorer.AppImage https://github.com/cachewraith-labs/cachewraith-explorer/releases/latest/download/cachewraith-explorer-x86_64.AppImage
chmod +x cachewraith-explorer.AppImage
./cachewraith-explorer.AppImage
```

AppImages need FUSE 2:

| Distribution         | Command                        |
| -------------------- | ------------------------------ |
| Ubuntu 24.04+        | `sudo apt install libfuse2t64` |
| Ubuntu 22.04, Debian | `sudo apt install libfuse2`    |
| Fedora               | `sudo dnf install fuse-libs`   |
| openSUSE             | `sudo zypper install libfuse2` |
| Arch                 | `sudo pacman -S fuse2`         |

All packages are for x86_64. To build from source instead, see
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Make it your file manager

Accept the prompt on first launch, use **Settings → Default app → Make default**, or run:

```sh
cachewraith-explorer --make-default
```

## Update

```sh
cachewraith-explorer update
```

No need to uninstall first. It finds the newest release, checks its signature, and upgrades
the way you installed it (apt, dnf, zypper, makepkg, or the AppImage file itself). Your
settings, pinned folders and folder icons are kept. `cachewraith-explorer update --check`
only reports whether an update exists.

## Uninstall

| Installed with    | Command                                     |
| ----------------- | ------------------------------------------- |
| `.deb`            | `sudo apt remove cachewraith-explorer`      |
| `.rpm` (Fedora)   | `sudo dnf remove cachewraith-explorer`      |
| `.rpm` (openSUSE) | `sudo zypper remove cachewraith-explorer`   |
| Arch              | `sudo pacman -Rns cachewraith-explorer-bin` |
| AppImage          | delete the `.AppImage` file                 |

Settings live in `~/.config/cachewraith-explorer`; delete it for a clean slate.

## Built with

| Part       | Technology                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------- |
| App shell  | [Tauri 2](https://tauri.app) on the system WebKitGTK                                        |
| Backend    | [Rust](https://www.rust-lang.org) (2024 edition)                                            |
| Interface  | [React 19](https://react.dev) and [TypeScript](https://www.typescriptlang.org)              |
| Styling    | [Tailwind CSS 4](https://tailwindcss.com) with Material You color tokens                    |
| Colors     | [Material Color Utilities](https://github.com/material-foundation/material-color-utilities) |
| Animation  | [Motion](https://motion.dev)                                                                |
| State      | [Zustand](https://zustand.docs.pmnd.rs)                                                     |
| Big lists  | [TanStack Virtual](https://tanstack.com/virtual)                                            |
| File icons | [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)    |
| Icons (UI) | [Lucide](https://lucide.dev)                                                                |
| Build      | [Vite](https://vite.dev), [pnpm](https://pnpm.io), Docker (Ubuntu 22.04 packages)           |

## Documentation

- [User guide](docs/USER-GUIDE.md): settings, shortcuts, icons, desktop support, updates
- [Development](docs/DEVELOPMENT.md): building, architecture, security, releasing

## License

[MIT](LICENSE) © cachewraith
