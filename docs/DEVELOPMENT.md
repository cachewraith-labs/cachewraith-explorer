# Development

## Setup

```sh
git clone https://github.com/cachewraith-labs/cachewraith-explorer && cd cachewraith-explorer
make setup        # pnpm install --frozen-lockfile
make dev          # hot-reloading dev build
make check test   # typecheck, lint, format check, all tests
make build        # optimized binary (no package)
make install      # build and install to ~/.local (this machine only)
make set-default  # open folders with it
make package      # .deb + .rpm + AppImage, built in an Ubuntu 22.04 container
```

Toolchain: Rust 1.88+ (1.97.1 in CI), Node 24, pnpm 11. System libraries:

| Distribution    | Command                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Ubuntu / Debian | `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libssl-dev libxdo-dev build-essential` |
| Fedora          | `sudo dnf install webkit2gtk4.1-devel gtk3-devel librsvg2-devel openssl-devel libxdo-devel`              |
| Arch            | `sudo pacman -S webkit2gtk-4.1 gtk3 librsvg openssl xdotool base-devel`                                  |

Packages are built on Ubuntu 22.04 on purpose: a binary built against an older glibc runs on
newer distributions, not the other way round. A binary from `make build` on Arch will not run
on Ubuntu.

A source install (`make install`) is not managed by `cachewraith-explorer update`; update it
with `git pull && make install`.

## Stack

| Layer   | Choice                           | Why                                                 |
| ------- | -------------------------------- | --------------------------------------------------- |
| Shell   | Tauri 2                          | System WebKitGTK: small binary, no bundled Chromium |
| Backend | Rust 2024                        | Filesystem work, jobs, watcher, thumbnails, updates |
| UI      | React 19 + TypeScript 6 (strict) | The design is HTML/CSS; it ports 1:1                |
| State   | Zustand 5                        | Selector subscriptions keep re-renders local        |
| Styling | Tailwind 4 over `--m3-*` tokens  | Every color follows the live palette                |
| Motion  | `motion` (LazyMotion, M3 easing) | Springs and exit animations; honours reduced motion |
| Lists   | `@tanstack/react-virtual`        | Only visible rows exist in the DOM                  |

## Layout

```
src-tauri/src/
  commands/       IPC handlers only: validate input, delegate. The whole webview surface.
  fs/             listing, metadata, rename/new folder, properties, folder usage, validation
  jobs/           copy / move / trash / delete queue with progress, pause, cancel
  desktop/        desktop detection, default file manager, .desktop entries
  updater/        `update` command: GitHub release lookup, signature check, install
  background.rs   cancellable background tasks (search, folder size)
  drives.rs       mounts from /proc/self/mountinfo + /sys + statvfs
  folder_icons.rs custom folder icons, kept in step with moves and deletes
  search.rs       streamed recursive search
  watcher.rs      inotify watch of the folders open in tabs
  theme.rs        reads + watches the Quickshell Material You palette
  thumbnails.rs   thumb:// protocol: bounded decode, private disk cache
  trash.rs        freedesktop trash: list, restore, purge
  settings.rs     ~/.config/cachewraith-explorer/settings.json (atomic, 0600)
  launcher.rs     xdg-open and terminals (per-terminal working-directory flags), no shell

src/
  ipc/            typed wrappers for every command and event
  shared/         lib (path, format, fuzzy, keys, motion) and UI primitives
  features/
    explorer/     locations, tabs, panes, selection, listings, grid/list views, DnD
    commands/     the command registry + global shortcuts
    operations/   file actions facade, clipboard, jobs store, progress tray
    icons/        Material icon resolution, custom folder icons, picker
    properties/   Properties dialog and live folder size
    sidebar/ preview/ palette/ context-menu/ dialogs/ toasts/ theme/ settings/ places/
    desktop/ shell/
  app/            bootstrap, shell layout, background sync

tooling/          Vite plugin exposing the Material Icon Theme
packaging/        desktop entries, Docker build image, AUR PKGBUILD
docs/             this file and the user guide
```

A feature imports `shared/` and `ipc/`, and other features' stores or facades, never another
feature's components.

## Design decisions

- **Command** (`features/commands/registry.ts`): one `AppCommand` list backs keyboard
  shortcuts, the command palette and the shortcut hints in menus, so they cannot drift.
- **Facade** (`features/operations/actions.ts`, `src-tauri/src/commands`): UI code calls
  intent-level actions; confirmation, toasts and post-action selection live in one place.
- **Discriminated union for locations** (`explorer/model.ts`): `dir | trash | search`.
  Adding "recent files" or a network share is one variant; the compiler finds every switch.
- **Command + Observer for jobs** (`src-tauri/src/jobs`): requests are queued on two lanes
  (bulk byte-copying vs. quick metadata work, so a delete never waits behind a 40 GB copy);
  every state change is published as a snapshot event, and completed moves/deletes are
  published as path changes. The job kinds and install methods are closed sets, so they are
  `enum` + `match`; trait hierarchies were considered and rejected.
- **Repository** for custom folder icons (`folder_icons.rs`), keyed by path. Rejected:
  extended attributes (lost on FAT/exFAT, NTFS, network mounts) and `.directory` files
  (they litter user folders).
- **Strategy by lookup table** for sorting (`visibleEntries.ts`) and terminal launch flags
  (`launcher.rs`) instead of branching.
- **Container-scoped singleton**: one `AppState` managed by Tauri; no statics or globals.
- Rejected: Redux (more ceremony than the state needs), a repository layer over settings (one
  backing store, nothing to swap).

## Performance

- Listings are virtualized: only on-screen rows and tiles are rendered.
- Hidden-file toggling, sorting and filtering are pure and memoized on the client.
- Copies use `copy_file_range` (in-kernel, reflinks on btrfs/xfs), falling back to 1 MiB
  read/write; progress events are throttled to ~8/s with a smoothed speed and ETA.
- Thumbnails decode off the async runtime with a concurrency cap and are cached by path,
  size and mtime in `~/.cache/cachewraith-explorer/thumbnails`.
- File icons are static SVG assets loaded on demand and cached by the webview.
- Watcher refreshes keep the previous entries on screen while reloading, and stale responses
  are dropped by generation counters.

## Security (OWASP Top 10:2025)

| ID                            | What applies here                                                                                                                                                                                                                                             | Where                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A01 Broken Access Control     | The webview is untrusted: every path is parsed as absolute, NUL-free and lexically normalized; names must be one component; deleting `/` or `$HOME` is refused. Only explicitly listed commands are callable (app manifest + capability allowlist).           | `fs/paths.rs`, `jobs/manager.rs`, `build.rs`, `capabilities/`      |
| A02 Security Misconfiguration | Strict CSP (no remote origins, no inline scripts, `object-src 'none'`), `freezePrototype`, native context menu disabled                                                                                                                                       | `tauri.conf.json`                                                  |
| A03 Supply Chain              | Exact-pinned npm deps and lockfiles; pnpm minimum-release-age gate on; build image pinned by digest; Node checksum-verified; CI actions pinned to commit SHAs; AUR host key pinned                                                                            | `package.json`, `packaging/`, `.github/workflows`                  |
| A04 Cryptographic Failures    | Thumbnails of private images, settings and update downloads stored with 0700/0600 permissions                                                                                                                                                                 | `thumbnails.rs`, `settings.rs`, `updater/mod.rs`                   |
| A05 Injection                 | External programs get argv only, never a shell; desktop entry ids validated and `Exec` paths quoted per spec; terminal names must be bare program names; palette colors validated as hex; icon names validated; file names rendered as text, never HTML       | `launcher.rs`, `desktop/`, `theme.rs`, `folder_icons.rs`, `dnd.ts` |
| A06 Insecure Design           | Bounded search results, image decode limits, capped watch list, thumbnail concurrency cap, download size limits                                                                                                                                               | `search.rs`, `thumbnails.rs`, `updater/mod.rs`                     |
| A08 Software/Data Integrity   | Release packages are signed (minisign) in CI; `update` verifies the signature against the public key compiled into the app before installing, downloads only from this repository's releases over HTTPS                                                       | `updater/verify.rs`, `updater/release.rs`                          |
| A10 Exceptional Conditions    | No-overwrite writes (`create_new`, `renameat2(RENAME_NOREPLACE)`); cancelled or failed copies delete partial files; moves delete the source only after the copy succeeded; copying a folder into itself is refused; AppImage updates swap the file atomically | `jobs/transfer.rs`, `fs/ops.rs`, `updater/install.rs`              |

A07 (authentication) does not apply: there are no accounts or network services.

## Releasing

1. Set the new version in `package.json`, `src-tauri/Cargo.toml` and
   `src-tauri/tauri.conf.json`, and commit.
2. `git tag v0.2.0 && git push origin v0.2.0`

The Release workflow then:

1. checks the tag matches the version;
2. builds the `.deb`, `.rpm` and AppImage on Ubuntu 22.04 and signs them;
3. adds version-free copies (`cachewraith-explorer-amd64.deb`, …) so install commands can use
   `releases/latest/download/…`;
4. publishes the GitHub release;
5. renders the AUR `PKGBUILD` and pushes it to
   [cachewraith-explorer-bin](https://aur.archlinux.org/packages/cachewraith-explorer-bin).

Installed copies pick the release up with `cachewraith-explorer update`.

### Secrets

| Secret                               | What it is                                                       |
| ------------------------------------ | ---------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | Release signing key (`~/.tauri/cachewraith-explorer.key`)        |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password (`~/.tauri/cachewraith-explorer.key.password`)      |
| `AUR_SSH_PRIVATE_KEY`                | SSH key registered on the AUR account (`~/.ssh/aur_cachewraith`) |

**Back up the signing key and password.** Without them, future releases cannot be signed
with the same key and installed copies will refuse to update.

### By hand

```sh
make package-signed                                   # signed packages in dist-packages/
PACKAGES_DIR=../dist-packages cargo test --manifest-path src-tauri/Cargo.toml release_packages -- --ignored
packaging/aur/render.sh 0.2.0 dist-packages/cachewraith-explorer_0.2.0_amd64.deb
packaging/aur/publish.sh                              # needs the release to be published first
```
