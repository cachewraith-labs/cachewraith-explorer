# Cachewraith Explorer

A Material You file manager for Linux, built from the "illogical-impulse File Explorer"
design. It runs on any desktop (GNOME, KDE, XFCE, Cinnamon, Hyprland, Sway…), follows your
wallpaper or a color you pick, treats drives like `~/storage` as first-class, and is driven
as much by keyboard as by mouse.

## Install

Download a package from the releases page, or build them yourself with `make package`.

| Distro                                                | Package  | Command                                                |
| ----------------------------------------------------- | -------- | ------------------------------------------------------ |
| Ubuntu 22.04+, Debian 12+, Mint, Pop!\_OS, elementary | `.deb`   | `sudo apt install ./cachewraith-explorer_*_amd64.deb`  |
| Fedora 38+, openSUSE, RHEL 9+                         | `.rpm`   | `sudo dnf install ./cachewraith-explorer-*.x86_64.rpm` |
| Anything else (no install)                            | AppImage | `chmod +x *.AppImage && ./*.AppImage`                  |
| Arch, from source                                     | —        | `make install`                                         |

Then make it your file manager: **Settings → Default app → Make default** (the app also asks
once on first launch), or from a terminal:

```sh
cachewraith-explorer --make-default     # folders open with Files everywhere
cachewraith-explorer --default-status   # prints the current handler; exit 0 if it's Files
```

This sets the `inode/directory` handler, which covers `xdg-open`, "Show in folder" and
download folders in browsers. It works through `xdg-mime`, or edits `~/.config/mimeapps.list`
directly when that is missing. The previous app is remembered, so Settings can switch back.
For an AppImage, a launcher entry pointing at the AppImage is created in `~/.local/share`.

## Updating

No uninstalling, no downloading by hand:

```sh
cachewraith-explorer update           # install the latest release
cachewraith-explorer update --check   # only say whether one is available
```

It works out how Files was installed and upgrades in place:

| Installed from          | What `update` does                                                                |
| ----------------------- | --------------------------------------------------------------------------------- |
| `.deb`                  | `apt-get install` of the new package (asks for your password)                     |
| `.rpm`                  | `dnf install` (or `zypper`, `rpm -U`) of the new package (asks for your password) |
| AppImage                | replaces the AppImage file where it is, no password needed                        |
| source (`make install`) | tells you to `git pull && make install`                                           |

Settings, pinned folders and custom folder icons are kept. **Settings → About & updates** can
check for a new version too.

Every release asset is signed, and the public key is built into the app
(`src-tauri/updater-public.key`). `update` downloads from this repository's GitHub releases
only, over HTTPS, into a private cache folder, and refuses to install anything whose
signature does not match (OWASP A08).

## Releasing

1. Set the new version in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json`, and commit.
2. `git tag v0.2.0 && git push origin v0.2.0`

The Release workflow checks the tag matches the version, builds the `.deb`, `.rpm` and
AppImage on Ubuntu 22.04, signs them, and publishes the release. Everyone on an older
version can then run `cachewraith-explorer update`.

Signing needs two repository secrets, `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The key lives outside the repo, in
`~/.tauri/cachewraith-explorer.key` (password next to it). **Back both up somewhere safe**:
without them, future releases cannot be signed with the same key, and installed copies will
refuse to update. `make package-signed` builds signed packages locally with that key.

## Develop

```sh
make setup        # pnpm install --frozen-lockfile
make dev          # hot-reloading dev build
make check test   # typecheck, lint, format check, all tests
make package      # .deb + .rpm + AppImage, built in an Ubuntu 22.04 container
make install      # optimized build → ~/.local/bin + desktop entry (this machine only)
```

Toolchain: Rust 1.88+ (1.97.1 pinned in CI), Node 24 + pnpm 11. System libraries:

| Distro          | Command                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Ubuntu / Debian | `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev libxdo-dev build-essential` |
| Fedora          | `sudo dnf install webkit2gtk4.1-devel gtk3-devel librsvg2-devel openssl-devel libxdo-devel`              |
| Arch            | `sudo pacman -S webkit2gtk-4.1 gtk3 librsvg openssl xdotool base-devel`                                  |

Packages are built on Ubuntu 22.04 on purpose: a binary built against an older glibc runs
on newer distros, not the other way round. A binary from `make build` on Arch will not run
on Ubuntu.

## Stack

| Layer   | Choice                           | Why                                                 |
| ------- | -------------------------------- | --------------------------------------------------- |
| Shell   | Tauri 2                          | System WebKitGTK: ~8 MB binary, no bundled Chromium |
| Backend | Rust 2024                        | Filesystem work, jobs, watcher, thumbnails          |
| UI      | React 19 + TypeScript 6 (strict) | The design is HTML/CSS; it ports 1:1                |
| State   | Zustand 5                        | Selector subscriptions keep re-renders local        |
| Styling | Tailwind 4 over `--m3-*` tokens  | Every color follows the live palette                |
| Motion  | `motion` (LazyMotion, M3 easing) | Springs and exit animations; honours reduced motion |
| Lists   | `@tanstack/react-virtual`        | Only visible rows exist in the DOM                  |

## Layout

```
src-tauri/src/
  commands/      IPC handlers only: validate input, delegate. The whole webview surface.
  fs/            listing, metadata, rename/new folder, path + name validation
  jobs/          copy / move / trash / delete queue with progress, pause, cancel
  desktop/       desktop detection, default file manager, .desktop entries
  drives.rs      mounts from /proc/self/mountinfo + /sys + statvfs
  search.rs      streamed, cancellable recursive search
  watcher.rs     inotify watch of the folders open in tabs
  theme.rs       reads + watches the Quickshell Material You palette
  thumbnails.rs  thumb:// protocol: bounded decode, private disk cache
  trash.rs       freedesktop trash: list, restore, purge
  settings.rs    ~/.config/cachewraith-explorer/settings.json (atomic, 0600)
  launcher.rs    xdg-open and terminals (per-terminal working-directory flags), no shell

src/
  ipc/           typed wrappers for every command and event
  shared/        lib (path, format, fuzzy, keys, motion) and UI primitives
  features/
    explorer/    locations, tabs, panes, selection, listings, grid/list views, DnD
    commands/    the command registry + global shortcuts
    operations/  file actions facade, clipboard, jobs store, progress tray
    sidebar/ preview/ palette/ context-menu/ dialogs/ toasts/ theme/ settings/ places/ shell/
  app/           bootstrap, shell layout, background sync
```

A feature imports `shared/` and `ipc/`, and other features' stores or facades — never
another feature's components.

## Design decisions

- **Command** (`features/commands/registry.ts`): one `AppCommand` list backs keyboard
  shortcuts, the command palette and the shortcut hints in menus, so they cannot drift.
- **Facade** (`features/operations/actions.ts`, `src-tauri/src/commands`): UI code calls
  intent-level actions; confirmation, toasts and post-action selection live in one place.
- **Discriminated union for locations** (`explorer/model.ts`): `dir | trash | search`.
  Adding "recent files" or a network share is one variant; the compiler finds every switch.
- **Command + Observer for jobs** (`src-tauri/src/jobs`): requests are queued on two lanes
  (bulk byte-copying vs. quick metadata work, so a delete never waits behind a 40 GB copy);
  every state change is published as a snapshot event. The four job kinds are a closed set,
  so they are an `enum` + `match`; a trait hierarchy was considered and rejected.
- **Strategy by lookup table** for sorting (`visibleEntries.ts`) instead of branching.
- **Container-scoped singleton**: one `AppState` managed by Tauri; no statics or globals.
- Rejected: Redux (more ceremony than the state needs), a repository layer over settings
  (one backing store, nothing to swap).

## Performance

- Listings are virtualized: only on-screen rows and tiles are rendered.
- Hidden-file toggling, sorting and filtering are pure and memoized on the client — no
  round-trip.
- Copies use `copy_file_range` (in-kernel, reflinks on btrfs/xfs), falling back to 1 MiB
  read/write; progress events are throttled to ~8/s with a smoothed speed/ETA.
- Thumbnails decode off the async runtime with a concurrency cap and are cached by
  path + size + mtime in `~/.cache/cachewraith-explorer/thumbnails`.
- Watcher refreshes keep the previous entries on screen while reloading (no flicker), and
  stale responses are dropped by generation counters.

## Security (OWASP Top 10:2025)

| ID                            | What applies here                                                                                                                                                                                                                                                                 | Where it is handled                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A01 Broken Access Control     | The webview is untrusted: every path is parsed as absolute, NUL-free and lexically normalized; names must be one component; deleting `/` or `$HOME` is refused                                                                                                                    | `fs/paths.rs`, `jobs/manager.rs`                                   |
| A01                           | Only explicitly listed commands are callable (app manifest + capability allowlist)                                                                                                                                                                                                | `build.rs`, `capabilities/default.json`                            |
| A02 Security Misconfiguration | Strict CSP (no remote origins, no inline scripts, `object-src 'none'`), `freezePrototype`, native context menu disabled                                                                                                                                                           | `tauri.conf.json`                                                  |
| A03 Supply Chain              | Exact-pinned npm deps + lockfiles; pnpm's minimum-release-age gate left on; build image pinned by digest, Node checksum-verified, CI actions pinned to commit SHAs                                                                                                                | `package.json`, `packaging/docker/Dockerfile`, `.github/workflows` |
| A04 Cryptographic Failures    | Thumbnails of private images and settings stored with 0700/0600 permissions                                                                                                                                                                                                       | `thumbnails.rs`, `settings.rs`                                     |
| A05 Injection                 | External programs get argv only, never a shell; desktop entries: ids validated, `Exec` paths quoted per spec, control characters refused; terminal names must be bare program names; palette colors validated as hex before touching CSS; file names rendered as text, never HTML | `launcher.rs`, `theme.rs`, `dnd.ts`                                |
| A06 Insecure Design           | Bounded search results, image decode limits (dimensions, allocation, file size), capped watch list, thumbnail concurrency cap                                                                                                                                                     | `search.rs`, `thumbnails.rs`, `commands/watcher.rs`                |
| A10 Exceptional Conditions    | Writes use no-overwrite primitives (`create_new`, `renameat2(RENAME_NOREPLACE)`); a cancelled or failed copy deletes its partial file; a move deletes the source only after the copy succeeded; copying a folder into itself is refused                                           | `jobs/transfer.rs`, `fs/ops.rs`                                    |

A07/A08 (auth, updates) do not apply: there are no accounts, network services or updater.

## Settings

Open with the gear in the sidebar, **Ctrl+,**, or "Settings" in the command palette.
Changes apply instantly and save to `~/.config/cachewraith-explorer/settings.json`.

- **Appearance**: theme from your **wallpaper** (live Material You from illogical-impulse's
  generated palette) or a **custom color** (8 presets or any color) in System, Dark or Light
  mode; reduce animations. Without a wallpaper palette, the custom color is used.
- **Default app**: see whether Files opens folders, make it the default, or switch back.
  Also shows the detected desktop and session type.
- **Browsing**: grid/list, hidden files, details panel, compact sidebar, sort, folders first.
- **Files & apps**: ask before moving to Trash; terminal program for "Open terminal here".
- **Keyboard**: every shortcut, generated from the command registry.

Custom themes use the same Material "tonal spot" scheme as matugen, via Google's
`@material/material-color-utilities`, so they sit well next to the wallpaper theme.

## Icons

- **Files** get VS Code's [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme)
  icons, matched the same way VS Code does: exact file name first (`package.json`,
  `Dockerfile`, `.gitignore`), then the longest extension (`d.ts` before `ts`). Light themes
  use the theme's light variants.
- **Folders** use the tinted design glyph, or Material icons by folder name (Settings →
  Appearance → Folder icons → By name). Any folder can get its own icon: right-click →
  **Change icon…**, the details panel, or "Change folder icon…" in the palette. The picker
  searches all folder icons and suggests the one VS Code would use for that name.
- Custom icons live in `~/.local/share/cachewraith-explorer/folder-icons.json`, keyed by path,
  and follow folders this app renames, moves or deletes. Not stored in the folders
  themselves: extended attributes are lost on USB/NTFS/network drives, and `.directory` files
  would litter your folders. A folder renamed by another program loses its custom icon.
- Icons ship as static SVG assets (`tooling/material-icons.ts`) loaded through `<img>`, so an
  SVG can never run script. The theme's MIT license is bundled next to them.

## Desktop support

- **Window**: frameless everywhere. On tiling compositors (Hyprland, Sway, i3, niri, river…)
  the compositor manages it; on GNOME, KDE, XFCE and others the app draws minimize /
  maximize / close, and empty toolbar or tab-strip space drags the window.
- **Terminals**: kitty, foot, Alacritty, WezTerm, Ghostty, Ptyxis, GNOME Console,
  GNOME Terminal, Konsole, Xfce Terminal, Tilix, Terminator, MATE, LXTerminal,
  `x-terminal-emulator`, xterm — each started in the right folder, including single-instance
  ones that ignore the working directory.
- **Drives**: anything mounted from `/dev`, including USB sticks under `/media` (Ubuntu) and
  `/run/media` (Fedora, Arch).
- **Trash**: the freedesktop trash every desktop shares.

## Keyboard

| Keys                                             | Action                                          |
| ------------------------------------------------ | ----------------------------------------------- |
| Ctrl+K                                           | Command palette                                 |
| Ctrl+F / Enter in search                         | Filter this folder / search subfolders          |
| Ctrl+L                                           | Type a path (`~` works)                         |
| Alt+1…7, Alt+8                                   | Places, Trash                                   |
| Alt+Left/Right/Up, Backspace                     | Back, forward, parent                           |
| Arrows, Shift+Arrows, Home/End, PgUp/PgDn, Space | Move, extend, toggle selection                  |
| Enter, F2, Del, Shift+Del                        | Open, rename, trash, delete permanently         |
| Ctrl+C / X / V, Ctrl+Shift+C                     | Copy, cut, paste, copy path                     |
| Ctrl+Shift+N, Ctrl+Alt+T                         | New folder, terminal here                       |
| Ctrl+T / W / Tab, F3, F6                         | Tabs, split view, switch pane                   |
| Ctrl+1 / 2, Ctrl+H, Ctrl+B, F9                   | Grid/list, hidden files, sidebar, details panel |
| Ctrl+Z (in Trash)                                | Restore                                         |
| Ctrl+,                                           | Settings                                        |
| Alt+Enter or Ctrl+I                              | Properties: live folder size, dates, owner      |

Drag files between panes, onto folders, tabs, sidebar places or drives. Same drive moves,
another drive copies; hold Ctrl to force copy, Shift to force move.

## Notes

- Wayland: WebKitGTK's DMABUF renderer crashes on some setups (NVIDIA especially) with
  "Error 71 (Protocol error)", so `main.rs` sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Wayland
  unless you set it yourself.
- The palette is read from `~/.local/state/quickshell/user/generated/colors.json`; without
  it the built-in illogical-impulse dark palette is used.

## Not built yet

Columns view, drive-usage breakdown, compress/extract, "Open with…", undo for moves,
dropping files from other apps, a Flatpak, the `org.freedesktop.FileManager1` D-Bus service
(used by a few apps for "Show in folder"), and exact handling of non-UTF-8 file names.
