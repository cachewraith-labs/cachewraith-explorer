import { Check, RotateCcw, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { basename } from '@/shared/lib/path';
import { DialogButton, Modal } from '@/shared/ui/Modal';

import { FOLDER_ICON_GROUPS, type FolderIcon, type FolderIconGroup, folderIconGroup, folderIconMatches } from './folderIcons';
import { FolderIconView } from './FolderIconView';
import { DEFAULT_FOLDER_ICON, folderIconByName } from './material';
import { useFolderIcons } from './store';

/** Choose a folder's icon: a Material Icon Theme folder, a framework logo, or a symbol. */
export function FolderIconPicker() {
  const path = useFolderIcons((s) => s.pickerFor);
  const close = useFolderIcons((s) => s.closePicker);
  // Keep the last folder while the dialog animates out.
  const last = useRef(path);
  if (path) last.current = path;
  const shown = path ?? last.current;

  return (
    <Modal open={path !== null} onClose={close} title={shown ? `Icon for "${basename(shown)}"` : 'Folder icon'} width={600}>
      {shown && <PickerBody key={shown} path={shown} onClose={close} />}
    </Modal>
  );
}

const TABS: { group: FolderIconGroup; label: string; hint: string }[] = [
  { group: 'theme', label: 'Folders', hint: 'src, images, music…' },
  { group: 'logo', label: 'Logos', hint: 'fastapi, laravel, godot…' },
  { group: 'symbol', label: 'Symbols', hint: 'game, document, money…' },
];

function PickerBody({ path, onClose }: { path: string; onClose: () => void }) {
  const current = useFolderIcons((s) => s.icons[path]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<FolderIconGroup>(() => (current ? folderIconGroup(current) : 'theme'));
  const suggested = folderIconByName(basename(path));
  const choices = FOLDER_ICON_GROUPS[tab];
  const hint = TABS.find((t) => t.group === tab)?.hint ?? '';

  const icons = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = choices.filter((icon) => folderIconMatches(icon, terms));
    // The icon VS Code would pick for this name comes first.
    const match = matches.find((icon) => icon.id === suggested);
    return match ? [match, ...matches.filter((i) => i !== match)] : matches;
  }, [query, suggested, choices]);

  const choose = (icon: string | null) => {
    void useFolderIcons.getState().set(path, icon);
    onClose();
  };

  return (
    <>
      <label className="mt-2 mb-3 flex h-9 items-center gap-2 rounded-full bg-surface px-3.5 text-on-surface-variant focus-within:text-on-surface">
        <Search size={15} aria-hidden />
        <input
          autoFocus
          value={query}
          spellCheck={false}
          placeholder={`Search ${choices.length} icons: ${hint}`}
          aria-label="Search icons"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && icons[0]) choose(icons[0].id);
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-outline"
        />
      </label>

      <div role="tablist" aria-label="Icon kind" className="mb-3 flex gap-1.5">
        {TABS.map(({ group, label }) => (
          <button
            key={group}
            type="button"
            role="tab"
            aria-selected={tab === group}
            onClick={() => setTab(group)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors',
              tab === group
                ? 'bg-secondary-container text-on-secondary-container'
                : 'text-on-surface-variant hover:bg-surface-high',
            )}
          >
            {label} <span className="opacity-60">{FOLDER_ICON_GROUPS[group].length}</span>
          </button>
        ))}
      </div>

      <div
        role="listbox"
        aria-label="Folder icons"
        className="grid h-[min(380px,55vh)] auto-rows-min grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5 overflow-y-auto pr-1"
      >
        {icons.map((icon) => (
          <IconChoice
            key={icon.id}
            icon={icon}
            selected={icon.id === current}
            suggested={icon.id === suggested}
            onChoose={() => choose(icon.id)}
          />
        ))}
        {icons.length === 0 && (
          <div className="col-span-full py-10 text-center text-[12.5px] text-on-surface-variant">No icons match "{query}"</div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={!current}
          onClick={() => choose(null)}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] text-on-surface-variant transition-colors hover:bg-surface-high disabled:opacity-40"
        >
          <RotateCcw size={14} aria-hidden />
          Use default icon
        </button>
        <DialogButton onClick={onClose}>Cancel</DialogButton>
      </div>
    </>
  );
}

function IconChoice({
  icon,
  selected,
  suggested,
  onChoose,
}: {
  icon: FolderIcon;
  selected: boolean;
  suggested: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={icon.label}
      onClick={onChoose}
      className={cn(
        'relative flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition-[background-color,transform] duration-150 ease-emphasized active:scale-95',
        selected ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-high',
      )}
    >
      <FolderIconView icon={icon} size={34} />
      <span className={cn('w-full truncate text-center text-[11px]', icon.kind !== 'logo' && 'capitalize')}>{icon.label}</span>
      {selected && <Check size={13} strokeWidth={2.6} aria-hidden className="absolute top-1.5 right-1.5" />}
      {suggested && !selected && icon.id !== DEFAULT_FOLDER_ICON && (
        <span className="absolute top-1 right-1 rounded-full bg-tertiary px-1.5 text-[9px] font-semibold text-surface">
          match
        </span>
      )}
    </button>
  );
}
