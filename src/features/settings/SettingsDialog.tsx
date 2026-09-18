import {
  AppWindow,
  Check,
  FolderCog,
  Info,
  Keyboard,
  type LucideIcon,
  Palette as PaletteIcon,
  RotateCcw,
  SquareTerminal,
  Wallpaper,
} from 'lucide-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { AnimatePresence, m } from 'motion/react';
import { type ReactNode, useEffect, useState } from 'react';

import { updatesApi } from '@/ipc/api';
import { toIpcError } from '@/ipc/client';
import type { UpdateStatus } from '@/ipc/types';
import type { FolderIconStyle, Palette, Settings, SortDirection, SortKey, ThemeMode, ViewMode } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';
import { displayShortcut } from '@/shared/lib/keys';
import { transitions } from '@/shared/lib/motion';
import { Segmented, Switch } from '@/shared/ui/controls';
import { Kbd } from '@/shared/ui/Kbd';
import { DialogButton, Modal } from '@/shared/ui/Modal';

import { allCommands, type CommandGroup } from '../commands/registry';
import { useUi } from '../shell/ui';
import { generatePalette, THEME_PRESETS } from '../theme/generate';
import { useDesktop } from '../desktop/store';
import { useWallpaperPalette, wantsDark } from '../theme/palette';
import { useSystemDark } from '../theme/useSystemDark';
import { DEFAULT_SETTINGS, useSettings } from './store';

type SectionId = 'appearance' | 'default-app' | 'browsing' | 'files' | 'keyboard' | 'about';

const SECTIONS: ReadonlyArray<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
  { id: 'default-app', label: 'Default app', icon: AppWindow },
  { id: 'browsing', label: 'Browsing', icon: FolderCog },
  { id: 'files', label: 'Files & apps', icon: SquareTerminal },
  { id: 'keyboard', label: 'Keyboard', icon: Keyboard },
  { id: 'about', label: 'About & updates', icon: Info },
];

/** Every preference in one place. Changes apply and save immediately. */
export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const close = () => useUi.getState().setSettingsOpen(false);
  const [section, setSection] = useState<SectionId>('appearance');

  return (
    <Modal open={open} onClose={close} title="Settings" width={780}>
      <div className="mt-3 flex h-[min(540px,70vh)] gap-5">
        <nav aria-label="Settings sections" className="flex w-44 shrink-0 flex-col gap-0.5">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              autoFocus={id === section}
              aria-current={id === section ? 'page' : undefined}
              onClick={() => setSection(id)}
              className={cn(
                'relative flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] transition-colors duration-150',
                id === section ? 'font-semibold text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-high',
              )}
            >
              {id === section && (
                <m.span
                  layoutId="settings-nav"
                  transition={transitions.layout}
                  className="absolute inset-0 rounded-[10px] bg-secondary-container"
                />
              )}
              <Icon size={17} strokeWidth={1.8} aria-hidden className="relative" />
              <span className="relative">{label}</span>
            </button>
          ))}
          <div className="flex-1" />
          <ResetButton />
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto pr-1">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={section}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0, transition: transitions.enter }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
            >
              {section === 'appearance' && <AppearanceSection />}
              {section === 'default-app' && <DefaultAppSection />}
              {section === 'browsing' && <BrowsingSection />}
              {section === 'files' && <FilesSection />}
              {section === 'keyboard' && <KeyboardSection />}
              {section === 'about' && <AboutSection />}
            </m.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-outline-variant pt-3.5">
        <span className="font-mono text-[11px] text-outline">Saved automatically · ~/.config/cachewraith-explorer</span>
        <DialogButton variant="tonal" onClick={close}>
          Done
        </DialogButton>
      </div>
    </Modal>
  );
}

// ---- sections ------------------------------------------------------------------------

function AppearanceSection() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const wallpaper = useWallpaperPalette((s) => s.palette);
  const systemDark = useSystemDark();
  const fromWallpaper = settings.themeSource === 'wallpaper';

  return (
    <>
      <SectionTitle>Theme</SectionTitle>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <ThemeCard
          icon={Wallpaper}
          title="Wallpaper"
          description={
            wallpaper
              ? 'Material You colors from your wallpaper, updated live.'
              : 'No wallpaper palette found. Using your color instead.'
          }
          selected={fromWallpaper}
          palette={wallpaper}
          onSelect={() => update({ themeSource: 'wallpaper' })}
        />
        <ThemeCard
          icon={PaletteIcon}
          title="Custom color"
          description="Generate a Material You theme from any color."
          selected={!fromWallpaper}
          palette={generatePalette(settings.themeColor, wantsDark(settings.themeMode, systemDark))}
          onSelect={() => update({ themeSource: 'color' })}
        />
      </div>

      <AnimatePresence initial={false}>
        {!fromWallpaper && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', transition: transitions.enter }}
            exit={{ opacity: 0, height: 0, transition: transitions.exit }}
            className="overflow-hidden"
          >
            <ColorPicker value={settings.themeColor} onChange={(themeColor) => update({ themeColor })} />
          </m.div>
        )}
      </AnimatePresence>

      <Row
        title="Mode"
        description={
          fromWallpaper ? 'The wallpaper palette sets its own mode.' : 'System follows your desktop’s light or dark setting.'
        }
      >
        <Segmented<ThemeMode>
          label="Mode"
          value={settings.themeMode}
          onChange={(themeMode) => update({ themeMode })}
          options={[
            { value: 'system', label: 'System', disabled: fromWallpaper },
            { value: 'dark', label: 'Dark', disabled: fromWallpaper },
            { value: 'light', label: 'Light', disabled: fromWallpaper },
          ]}
        />
      </Row>

      <SectionTitle>Icons</SectionTitle>
      <Row title="File icons" description="Detected from the file name and extension, like VS Code's Material Icon Theme.">
        <span className="text-[12px] text-on-surface-variant">Automatic</span>
      </Row>
      <Row
        title="Folder icons"
        description="Theme: tinted folders. By name: src, node_modules, images… get their own icon. Right-click a folder to pick one yourself."
      >
        <Segmented<FolderIconStyle>
          label="Folder icons"
          value={settings.folderIconStyle}
          onChange={(folderIconStyle) => update({ folderIconStyle })}
          options={[
            { value: 'theme', label: 'Theme' },
            { value: 'material', label: 'By name' },
          ]}
        />
      </Row>

      <SectionTitle>Motion</SectionTitle>
      <Row title="Reduce animations" description="Turn off transitions and springs. Your system setting is always respected.">
        <Switch label="Reduce animations" checked={settings.reduceMotion} onChange={(reduceMotion) => update({ reduceMotion })} />
      </Row>
    </>
  );
}

function DefaultAppSection() {
  const info = useDesktop((s) => s.info);
  const status = useDesktop((s) => s.defaultApp);
  const busy = useDesktop((s) => s.busy);
  const handlers = useDesktop((s) => s.handlers);
  const previous = useSettings((s) => s.settings.previousFileManager);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    void useDesktop.getState().refreshDefaultApp();
  }, []);

  const isDefault = status?.isDefault === true;
  const current = status?.currentName ?? status?.currentId ?? 'no app';
  // Where folders go when the switch is turned off: the user's pick, else the app Files
  // replaced, else the first installed file manager.
  const handBackTo = handlers.find((h) => h.id === chosen) ?? handlers.find((h) => h.id === previous) ?? handlers[0] ?? null;
  const toggle = (on: boolean) => {
    if (on) void useDesktop.getState().makeDefault();
    else if (handBackTo) void useDesktop.getState().handBack(handBackTo.id);
  };

  return (
    <>
      <SectionTitle>Default file manager</SectionTitle>
      <div className={cn('mb-4 flex items-center gap-4 rounded-2xl p-4', isDefault ? 'bg-primary-container' : 'bg-surface')}>
        <div
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            isDefault ? 'bg-primary text-on-primary' : 'bg-surface-high text-on-surface-variant',
          )}
        >
          {isDefault ? <Check size={22} strokeWidth={2.4} /> : <AppWindow size={22} strokeWidth={1.8} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className={cn('text-[14px] font-semibold', isDefault && 'text-on-primary-container')}>
            {status === null ? 'Checking…' : isDefault ? 'Files is your default file manager' : `Folders open with ${current}`}
          </div>
          <div className={cn('text-[11.5px]', isDefault ? 'text-on-primary-container/80' : 'text-on-surface-variant')}>
            Used when other apps open a folder: downloads, “Show in folder”, xdg-open.
          </div>
        </div>
        <Switch
          label="Use Files as the default file manager"
          checked={isDefault}
          disabled={busy || status === null || (isDefault && handBackTo === null)}
          onChange={toggle}
        />
      </div>

      {isDefault && (
        <Row
          title="When turned off, use"
          description={
            handBackTo
              ? 'Folders, “Show in folder” and “Reveal in File Explorer” go to this app.'
              : 'No other file manager is installed.'
          }
        >
          {handlers.length > 0 && (
            <select
              aria-label="File manager to use instead"
              value={handBackTo?.id ?? ''}
              onChange={(event) => setChosen(event.target.value)}
              className="max-w-[200px] rounded-full bg-surface-high px-3 py-1.5 text-[12.5px] outline-none"
            >
              {handlers.map((handler) => (
                <option key={handler.id} value={handler.id}>
                  {handler.name}
                </option>
              ))}
            </select>
          )}
        </Row>
      )}

      <SectionTitle>This system</SectionTitle>
      <Row title="Desktop" description="Detected from your session.">
        <span className="font-mono text-[12px] text-on-surface-variant">
          {info.name || 'Unknown'} · {info.wayland ? 'Wayland' : 'X11'}
        </span>
      </Row>
      <Row title="Window buttons" description="Tiling compositors manage windows themselves, so the buttons are hidden there.">
        <span className="font-mono text-[12px] text-on-surface-variant">{info.windowControls ? 'Shown' : 'Hidden'}</span>
      </Row>
    </>
  );
}

function BrowsingSection() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  return (
    <>
      <SectionTitle>View</SectionTitle>
      <Row title="Layout" description="How folders show their contents.">
        <Segmented<ViewMode>
          label="Layout"
          value={settings.viewMode}
          onChange={(viewMode) => update({ viewMode })}
          options={[
            { value: 'grid', label: 'Grid' },
            { value: 'list', label: 'List' },
          ]}
        />
      </Row>
      <Row title="Show hidden files" description="Files and folders whose names start with a dot.">
        <Switch label="Show hidden files" checked={settings.showHidden} onChange={(showHidden) => update({ showHidden })} />
      </Row>
      <Row title="Details panel" description="Preview and properties of the selection, on the right.">
        <Switch label="Details panel" checked={settings.previewOpen} onChange={(previewOpen) => update({ previewOpen })} />
      </Row>
      <Row title="Compact sidebar" description="Icons only. It also folds automatically in narrow windows.">
        <Switch
          label="Compact sidebar"
          checked={settings.sidebarCollapsed}
          onChange={(sidebarCollapsed) => update({ sidebarCollapsed })}
        />
      </Row>

      <SectionTitle>Sorting</SectionTitle>
      <Row title="Sort by">
        <Segmented<SortKey>
          label="Sort by"
          value={settings.sortKey}
          onChange={(sortKey) => update({ sortKey })}
          options={[
            { value: 'name', label: 'Name' },
            { value: 'modified', label: 'Date' },
            { value: 'size', label: 'Size' },
            { value: 'kind', label: 'Type' },
          ]}
        />
      </Row>
      <Row title="Order">
        <Segmented<SortDirection>
          label="Order"
          value={settings.sortDirection}
          onChange={(sortDirection) => update({ sortDirection })}
          options={[
            { value: 'asc', label: 'Ascending' },
            { value: 'desc', label: 'Descending' },
          ]}
        />
      </Row>
      <Row title="Folders first" description="Keep folders above files, in their own section.">
        <Switch label="Folders first" checked={settings.foldersFirst} onChange={(foldersFirst) => update({ foldersFirst })} />
      </Row>
    </>
  );
}

const PROGRAM_NAME = /^[A-Za-z0-9_+][A-Za-z0-9_.+-]{0,63}$/;

function FilesSection() {
  const confirmTrash = useSettings((s) => s.settings.confirmTrash);
  const terminal = useSettings((s) => s.settings.terminal);
  const update = useSettings((s) => s.update);
  const [draft, setDraft] = useState(terminal ?? '');
  const valid = draft === '' || PROGRAM_NAME.test(draft);

  const commit = () => {
    if (valid) update({ terminal: draft === '' ? null : draft });
  };

  return (
    <>
      <SectionTitle>Safety</SectionTitle>
      <Row title="Ask before moving to Trash" description="Deleting permanently (Shift+Del) always asks.">
        <Switch label="Ask before moving to Trash" checked={confirmTrash} onChange={(value) => update({ confirmTrash: value })} />
      </Row>

      <SectionTitle>Apps</SectionTitle>
      <Row title="Terminal" description="Program for “Open terminal here”. Empty: $TERMINAL, then kitty, foot, alacritty…">
        <div className="flex flex-col items-end gap-1">
          <input
            value={draft}
            placeholder="auto"
            spellCheck={false}
            aria-label="Terminal program"
            aria-invalid={!valid}
            onChange={(event) => setDraft(event.target.value.trim())}
            onBlur={commit}
            onKeyDown={(event) => event.key === 'Enter' && commit()}
            className="w-44 rounded-[10px] border-[1.5px] border-outline-variant bg-surface px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-primary aria-invalid:border-error"
          />
          {!valid && <span className="text-[11px] text-error">A program name only, no paths or options</span>}
        </div>
      </Row>
    </>
  );
}

type UpdateCheck =
  { state: 'idle' } | { state: 'checking' } | { state: 'done'; status: UpdateStatus } | { state: 'failed'; message: string };

const UPDATE_COMMAND = 'cachewraith-explorer update';

function AboutSection() {
  const [check, setCheck] = useState<UpdateCheck>({ state: 'idle' });

  const run = () => {
    setCheck({ state: 'checking' });
    updatesApi.check().then(
      (status) => setCheck({ state: 'done', status }),
      (err: unknown) => setCheck({ state: 'failed', message: toIpcError(err).message }),
    );
  };

  return (
    <>
      <SectionTitle>Files</SectionTitle>
      <Row title="Version" description="Cachewraith Explorer, a Material You file manager for Linux.">
        <span className="font-mono text-[13px]">{__APP_VERSION__}</span>
      </Row>

      <SectionTitle>Updates</SectionTitle>
      <div className="mb-3 rounded-2xl bg-surface p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-[13px]">
            {check.state === 'idle' && 'Check GitHub for a newer release.'}
            {check.state === 'checking' && 'Checking…'}
            {check.state === 'failed' && <span className="text-error">{check.message}</span>}
            {check.state === 'done' &&
              (check.status.updateAvailable ? (
                <span className="font-semibold">Version {check.status.latest} is available</span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <Check size={15} aria-hidden className="text-primary" />
                  You have the latest version
                </span>
              ))}
          </div>
          <DialogButton variant="tonal" disabled={check.state === 'checking'} onClick={run}>
            Check for updates
          </DialogButton>
        </div>

        {check.state === 'done' && check.status.updateAvailable && (
          <div className="mt-3 border-t border-outline-variant pt-3 text-[12px] text-on-surface-variant">
            {check.status.method === 'manual' ? (
              <>
                This copy was built from source. Update it with <CopyCommand command="git pull && make install" />
              </>
            ) : (
              <>
                Update without reinstalling: run <CopyCommand command={UPDATE_COMMAND} /> in a terminal. Your settings, pinned
                folders and icons are kept.
              </>
            )}
          </div>
        )}
      </div>
      <p className="px-1 text-[11.5px] text-on-surface-variant">
        Updates are downloaded from GitHub and installed only if their signature matches the release key built into Files.
      </p>
    </>
  );
}

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy command"
      onClick={() => {
        void writeText(command).then(
          () => setCopied(true),
          () => undefined,
        );
        setTimeout(() => setCopied(false), 1500);
      }}
      className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-surface-high px-1.5 py-0.5 font-mono text-[11.5px] text-on-surface hover:bg-surface-highest"
    >
      {command}
      {copied && <Check size={12} aria-label="Copied" className="text-primary" />}
    </button>
  );
}

const GROUP_ORDER: readonly CommandGroup[] = ['Go', 'File', 'Selection', 'View', 'Tabs'];

function KeyboardSection() {
  const commands = allCommands().filter((c) => c.shortcuts && c.shortcuts.length > 0);
  return (
    <>
      {GROUP_ORDER.map((group) => {
        const inGroup = commands.filter((c) => c.group === group);
        if (inGroup.length === 0) return null;
        return (
          <div key={group}>
            <SectionTitle>{group}</SectionTitle>
            <div className="mb-2 grid grid-cols-2 gap-x-6">
              {inGroup.map((command) => (
                <div
                  key={command.id}
                  className="flex items-center justify-between gap-3 border-b border-outline-variant/50 py-1.5 text-[12.5px]"
                >
                  <span className="truncate">{command.title}</span>
                  <Kbd className="shrink-0 text-[11px] text-on-surface-variant">
                    {(command.shortcuts ?? []).map(displayShortcut).join('  ·  ')}
                  </Kbd>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

// ---- building blocks -----------------------------------------------------------------

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const commitHex = (text: string) => {
    setHex(text);
    if (/^#[0-9a-f]{6}$/i.test(text)) onChange(text.toLowerCase());
  };

  return (
    <div className="mb-4 rounded-2xl bg-surface p-4">
      <div className="mb-3 flex flex-wrap gap-2.5">
        {THEME_PRESETS.map((preset) => {
          const selected = preset.color === value;
          return (
            <button
              key={preset.color}
              type="button"
              title={preset.name}
              aria-label={preset.name}
              aria-pressed={selected}
              onClick={() => commitHex(preset.color)}
              style={{ backgroundColor: preset.color }}
              className={cn(
                'flex size-9 items-center justify-center rounded-full transition-transform duration-150 ease-emphasized hover:scale-110 active:scale-95',
                selected && 'ring-2 ring-on-surface ring-offset-2 ring-offset-surface',
              )}
            >
              {selected && <Check size={16} strokeWidth={2.6} className="text-white drop-shadow" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2.5">
        <label
          className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-outline-variant"
          style={{ backgroundColor: value }}
        >
          <input
            type="color"
            value={value}
            aria-label="Pick any color"
            onChange={(event) => commitHex(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <input
          value={hex}
          spellCheck={false}
          maxLength={7}
          aria-label="Hex color"
          aria-invalid={!/^#[0-9a-f]{6}$/i.test(hex)}
          onChange={(event) => commitHex(event.target.value)}
          className="w-28 rounded-[10px] border-[1.5px] border-outline-variant bg-surface-low px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-primary aria-invalid:border-error"
        />
        <span className="text-[12px] text-on-surface-variant">Pick a preset or any color</span>
      </div>
    </div>
  );
}

interface ThemeCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  palette: Palette | null;
  onSelect: () => void;
}

function ThemeCard({ icon: Icon, title, description, selected, palette, onSelect }: ThemeCardProps) {
  const swatches = ['primary', 'tertiary', 'secondary_container', 'surface_container_high', 'background'];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'rounded-2xl p-3.5 text-left outline-offset-2 transition-[background-color,outline-color] duration-150',
        selected ? 'bg-surface-high outline-2 outline-primary' : 'bg-surface hover:bg-surface-high',
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <Icon size={17} aria-hidden className="text-primary" />
        <span className="font-semibold">{title}</span>
        {selected && <Check size={15} aria-hidden className="ml-auto text-primary" />}
      </div>
      <p className="mb-3 min-h-8 text-[11.5px] text-on-surface-variant">{description}</p>
      <div className="flex h-5 overflow-hidden rounded-full ring-1 ring-outline-variant">
        {swatches.map((token) => (
          <span
            key={token}
            className="flex-1 transition-colors duration-300"
            style={{ backgroundColor: palette?.[token] ?? 'transparent' }}
          />
        ))}
      </div>
    </button>
  );
}

function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl px-1 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px]">{title}</div>
        {description && <div className="text-[11.5px] text-on-surface-variant">{description}</div>}
      </div>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="section-label mt-1 mb-1.5 px-1 first:mt-0">{children}</h3>;
}

function ResetButton() {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (!armed) return setArmed(true);
        const { settings, update } = useSettings.getState();
        // Pinned folders are content, not preferences; keep them.
        const reset: Partial<Settings> = { ...DEFAULT_SETTINGS, pinned: settings.pinned };
        update(reset);
        setArmed(false);
      }}
      onBlur={() => setArmed(false)}
      className={cn(
        'flex items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[12px] transition-colors duration-150',
        armed ? 'bg-error text-on-error' : 'text-on-surface-variant hover:bg-surface-high',
      )}
    >
      <RotateCcw size={15} aria-hidden />
      {armed ? 'Click again to reset' : 'Reset to defaults'}
    </button>
  );
}
