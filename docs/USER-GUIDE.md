# User guide

## Settings

Open with the gear in the sidebar, **Ctrl+,**, or "Settings" in the command palette.
Changes apply instantly and save to `~/.config/cachewraith-explorer/settings.json`.

- **Appearance**: theme from your **wallpaper** (live Material You from the illogical-impulse
  generated palette) or a **custom color** (8 presets or any color) in System, Dark or Light
  mode; file and folder icon style; reduce animations. Without a wallpaper palette, the
  custom color is used.
- **Default app**: see whether Files opens folders, make it the default, or switch back.
  Also shows the detected desktop and session type.
- **Browsing**: grid/list, hidden files, details panel, compact sidebar, sort, folders first.
- **Files & apps**: ask before moving to Trash; terminal program for "Open terminal here".
- **Keyboard**: every shortcut, generated from the command registry.
- **About & updates**: version and "Check for updates".

Custom themes use the same Material "tonal spot" scheme as matugen, so they sit well next to
the wallpaper theme.

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
another drive copies; hold Ctrl to force copy, Shift to force move. Files can also be
dragged out of the window into other apps: VS Code, other file managers, browsers, chat apps.

Copy and cut also put the files on the system clipboard, so they paste into VS Code, other
file managers, chat apps and terminals (as `text/uri-list`, `x-special/gnome-copied-files`
and plain paths). They stay pasteable while Files is running.

## Compress

Right-click → **Compress…** (or "Compress…" in the palette) packs the selection into one
archive next to it: `.zip`, `.7z`, `.tar.gz`, `.tar.xz`, `.tar.zst`, `.tar.bz2` or plain
`.tar`. It runs in the background with progress, pause and cancel, never overwrites (a second
archive becomes `name (2).tar.gz`), and removes a half-written archive if it fails. Symlinks
are stored as links, not followed; `.7z` skips them. The last format used is offered first.

## Icons

- **Files** get VS Code's Material Icon Theme icons, matched the way VS Code does: exact file
  name first (`package.json`, `Dockerfile`, `.gitignore`), then the longest extension (`d.ts`
  before `ts`). Files are drawn as pages; images are shown as photos at their own shape.
- **Folders** use the tinted design glyph, or Material icons by folder name (Settings →
  Appearance → Folder icons → By name). Any folder can get its own icon: right-click →
  **Change icon…**, the details panel, or "Change folder icon…" in the palette. The picker
  has three tabs: **Folders** (the Material folder set), **Logos** (Material-style folders in a
  framework's, language's or app's color, with its logo as the emblem: FastAPI, Laravel, Django, Spring, Flutter, Godot, Unity…,
  from [Simple Icons](https://simpleicons.org)), and **Symbols** (game, document, music,
  money, work…).
- Custom icons live in `~/.local/share/cachewraith-explorer/folder-icons.json` and follow
  folders this app renames, moves or deletes. A folder renamed by another program loses its
  custom icon.

## Properties

Right-click → **Properties** (Alt+Enter or Ctrl+I) opens a window with type, location, size,
dates, owner and permissions. Folder sizes are counted live in the background, like `du -x`:
symlinks are not followed, hard links count once, and other drives mounted inside are skipped.

## Default file manager

`cachewraith-explorer --make-default` (or Settings → Default app) sets the `inode/directory`
handler, which covers `xdg-open` and download folders in browsers. It uses `xdg-mime`, or
edits `~/.config/mimeapps.list` when that is missing. The previous app is remembered, so
Settings can switch back. For an AppImage, a launcher entry pointing at the AppImage is
created in `~/.local/share/applications`.

Many apps skip that handler: VS Code's "Reveal in File Explorer", "Show in folder" in
Chromium-based browsers, and others call the `org.freedesktop.FileManager1` D-Bus service
instead. While Files is the default, it provides that service: a running window opens each
request in a new tab, and `~/.local/share/dbus-1/services/org.freedesktop.FileManager1.service`
starts Files when it is not running. That file overrides GNOME Files, Dolphin and Thunar for
your user only, and is removed when you switch back.

Settings → Default app has an on/off switch. Turning it off hands folders to the app shown
under "When turned off, use": the file manager Files replaced if it knows it, otherwise the
first installed one (GNOME Files, Dolphin, Thunar…); you can pick another. From a terminal:
`cachewraith-explorer --restore-default`.

`cachewraith-explorer --default-status` prints the current handler (exit code 0 if it is Files).

## Updates

```sh
cachewraith-explorer update           # install the latest release
cachewraith-explorer update --check   # only say whether one is available
cachewraith-explorer update --force   # reinstall the latest release
```

| Installed from          | What `update` does                                                   |
| ----------------------- | -------------------------------------------------------------------- |
| `.deb`                  | `apt-get install` of the new package (asks for your password)        |
| `.rpm`                  | `dnf install`, `zypper install` or `rpm -U` (asks for your password) |
| Arch (PKGBUILD or AUR)  | downloads the signed PKGBUILD and runs `makepkg -si`                 |
| AppImage                | replaces the AppImage file where it is, no password needed           |
| source (`make install`) | tells you to `git pull && make install`                              |

Every release package is signed and the public key is built into the app. Updates download
only from this project's GitHub releases, over HTTPS, and are refused if the signature does
not match.

## Desktop support

- **Window**: on tiling compositors (Hyprland, Sway, i3, niri, river…) the compositor manages
  the window; on GNOME, KDE, XFCE and others the app draws minimize / maximize / close, and
  empty toolbar or tab-strip space drags the window.
- **Terminals** for "Open terminal here": kitty, foot, Alacritty, WezTerm, Ghostty, Ptyxis,
  GNOME Console, GNOME Terminal, Konsole, Xfce Terminal, Tilix, Terminator, MATE, LXTerminal,
  `x-terminal-emulator`, xterm, each started in the right folder.
- **Drives**: anything mounted from `/dev`, including USB sticks under `/media` (Ubuntu) and
  `/run/media` (Fedora, Arch).
- **Trash**: the freedesktop trash every desktop shares.

## Troubleshooting

- **Blank window or "Error 71 (Protocol error)" on Wayland**: a WebKitGTK renderer bug, common
  with NVIDIA. Files already sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` on Wayland; if you set
  that variable yourself, your value wins.
- **AppImage does not start**: install FUSE 2 (see the table in the README).
- **Wallpaper theme not found**: the palette is read from
  `~/.local/state/quickshell/user/generated/colors.json` (illogical-impulse). Without it, pick
  a custom color in Settings.

## Not built yet

Columns view, drive-usage breakdown, extracting archives, pasting files copied in other apps,
"Open with…", undo for moves, dropping files from other apps, a Flatpak, and exact handling
of non-UTF-8 file names.
