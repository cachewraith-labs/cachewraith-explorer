import { Check, RotateCcw, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { basename } from '@/shared/lib/path';
import { DialogButton, Modal } from '@/shared/ui/Modal';

import { DEFAULT_FOLDER_ICON, FOLDER_ICONS, folderIconByName, folderIconLabel, iconUrl } from './material';
import { useFolderIcons } from './store';

/** Choose a folder's icon from the Material Icon Theme folder set. */
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

function PickerBody({ path, onClose }: { path: string; onClose: () => void }) {
  const current = useFolderIcons((s) => s.icons[path]);
  const [query, setQuery] = useState('');
  const suggested = folderIconByName(basename(path));

  const icons = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = FOLDER_ICONS.filter((icon) => terms.every((term) => icon.includes(term)));
    // The icon VS Code would pick for this name comes first.
    return suggested && matches.includes(suggested) ? [suggested, ...matches.filter((i) => i !== suggested)] : matches;
  }, [query, suggested]);

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
          placeholder={`Search ${FOLDER_ICONS.length} icons: src, images, music…`}
          aria-label="Search icons"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && icons[0]) choose(icons[0]);
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-on-surface outline-none placeholder:text-outline"
        />
      </label>

      <div
        role="listbox"
        aria-label="Folder icons"
        className="grid h-[min(380px,55vh)] auto-rows-min grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5 overflow-y-auto pr-1"
      >
        {icons.map((icon) => (
          <IconChoice
            key={icon}
            icon={icon}
            selected={icon === current}
            suggested={icon === suggested}
            onChoose={() => choose(icon)}
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
  icon: string;
  selected: boolean;
  suggested: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      title={icon}
      onClick={onChoose}
      className={cn(
        'relative flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition-[background-color,transform] duration-150 ease-emphasized active:scale-95',
        selected ? 'bg-primary-container text-on-primary-container' : 'hover:bg-surface-high',
      )}
    >
      <img src={iconUrl(icon)} width={34} height={34} alt="" loading="lazy" decoding="async" draggable={false} />
      <span className="w-full truncate text-center text-[11px] capitalize">{folderIconLabel(icon)}</span>
      {selected && <Check size={13} strokeWidth={2.6} aria-hidden className="absolute top-1.5 right-1.5" />}
      {suggested && !selected && icon !== DEFAULT_FOLDER_ICON && (
        <span className="absolute top-1 right-1 rounded-full bg-tertiary px-1.5 text-[9px] font-semibold text-surface">
          match
        </span>
      )}
    </button>
  );
}
