import { Folder, HardDrive, type LucideIcon, Pin, Search, Trash } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/shared/lib/cn';
import { fuzzyMatch, highlightRuns } from '@/shared/lib/fuzzy';
import { displayShortcut } from '@/shared/lib/keys';
import { transitions } from '@/shared/lib/motion';
import { basename, tildify } from '@/shared/lib/path';
import { Kbd } from '@/shared/ui/Kbd';

import { commandContext } from '../commands/context';
import { allCommands, runCommand } from '../commands/registry';
import { useListings } from '../explorer/listings';
import { dirLocation, locationKey, type Location, TRASH } from '../explorer/model';
import { getActiveLocation, useExplorer } from '../explorer/store';
import { PLACE_ICONS } from '../places/icons';
import { usePlaces } from '../places/store';
import { useSettings } from '../settings/store';
import { useUi } from '../shell/ui';

interface PaletteItem {
  id: string;
  group: 'Places' | 'Folders here' | 'Actions';
  label: string;
  icon: LucideIcon;
  hint?: string;
  run: () => void;
}

const PER_GROUP = 6;

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const close = () => useUi.getState().setPaletteOpen(false);

  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          className="fixed inset-0 z-50 bg-scrim/25"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: transitions.enter }}
          exit={{ opacity: 0, transition: transitions.exit }}
          onPointerDown={(event) => event.target === event.currentTarget && close()}
        >
          <m.div
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: transitions.spring }}
            exit={{ opacity: 0, y: -8, scale: 0.98, transition: transitions.exit }}
            className="mx-auto mt-[12vh] w-[min(560px,calc(100vw-48px))] overflow-hidden rounded-[18px] bg-surface-highest shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
          >
            <PaletteBody onClose={close} />
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const items = useMemo(() => buildItems(), []);

  const results = useMemo(() => {
    const scored = items
      .map((item) => ({ item, match: fuzzyMatch(query, item.label) }))
      .filter((r): r is { item: PaletteItem; match: NonNullable<typeof r.match> } => r.match !== null);
    if (query.trim()) scored.sort((a, b) => b.match.score - a.match.score);
    const perGroup = new Map<string, number>();
    return scored.filter(({ item }) => {
      const count = perGroup.get(item.group) ?? 0;
      perGroup.set(item.group, count + 1);
      return count < (query.trim() ? PER_GROUP : item.group === 'Actions' ? 8 : PER_GROUP);
    });
  }, [items, query]);

  // Show groups in a fixed order; within a group keep the score order.
  const ordered = useMemo(() => {
    const groups: PaletteItem['group'][] = ['Places', 'Folders here', 'Actions'];
    return groups.flatMap((group) => results.filter((r) => r.item.group === group));
  }, [results]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (index: number) => {
    const result = ordered[index];
    if (!result) return;
    onClose();
    result.item.run();
  };

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-outline-variant px-4 py-3.5">
        <Search size={18} className="text-on-surface-variant" aria-hidden />
        <input
          autoFocus
          value={query}
          spellCheck={false}
          placeholder="Jump to a folder or run an action"
          aria-label="Command"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((i) => Math.min(i + 1, ordered.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(active);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-outline"
        />
        <Kbd>Esc to close</Kbd>
      </div>
      <div ref={listRef} role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
        {ordered.length === 0 && <div className="px-3 py-6 text-center text-[12.5px] text-on-surface-variant">No matches</div>}
        {ordered.map(({ item, match }, index) => {
          const groupStart = index === 0 || ordered[index - 1]?.item.group !== item.group;
          return (
            <div key={item.id}>
              {groupStart && <div className="section-label px-2.5 pt-2 pb-1 text-[10.5px]">{item.group}</div>}
              <div
                role="option"
                aria-selected={index === active}
                data-active={index === active}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(index)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px]',
                  index === active && 'bg-surface-high',
                )}
              >
                <item.icon
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden
                  className={item.group === 'Places' ? 'text-tertiary' : 'text-on-surface-variant'}
                />
                <span className="flex-1 truncate">
                  {highlightRuns(item.label, match.indices).map((run, i) =>
                    run.hit ? (
                      <b key={i} className="font-bold text-primary">
                        {run.text}
                      </b>
                    ) : (
                      <span key={i}>{run.text}</span>
                    ),
                  )}
                </span>
                {item.hint && <Kbd className="max-w-[45%] truncate text-[10.5px]">{item.hint}</Kbd>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Everything the palette can offer right now. */
function buildItems(): PaletteItem[] {
  const { places, drives, home } = usePlaces.getState();
  const { pinned } = useSettings.getState().settings;
  const go = (location: Location) => () => useExplorer.getState().navigate(location);
  const items: PaletteItem[] = [];
  const seen = new Set<string>();
  const addPlace = (item: PaletteItem, location: Location) => {
    const key = locationKey(location);
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const place of places) {
    addPlace(
      {
        id: `place-${place.id}`,
        group: 'Places',
        label: place.label,
        icon: PLACE_ICONS[place.id],
        hint: tildify(place.path, home),
        run: go(dirLocation(place.path)),
      },
      dirLocation(place.path),
    );
  }
  for (const drive of drives) {
    addPlace(
      {
        id: `drive-${drive.mountPoint}`,
        group: 'Places',
        label: drive.label,
        icon: HardDrive,
        hint: tildify(drive.mountPoint, home),
        run: go(dirLocation(drive.mountPoint)),
      },
      dirLocation(drive.mountPoint),
    );
  }
  for (const path of pinned) {
    addPlace(
      {
        id: `pin-${path}`,
        group: 'Places',
        label: basename(path),
        icon: Pin,
        hint: tildify(path, home),
        run: go(dirLocation(path)),
      },
      dirLocation(path),
    );
  }
  addPlace({ id: 'trash', group: 'Places', label: 'Trash', icon: Trash, run: go(TRASH) }, TRASH);

  const location = getActiveLocation();
  const listing = location && useListings.getState().byKey[locationKey(location)];
  for (const entry of listing?.entries ?? []) {
    if (entry.kind === 'dir' && entry.trashId === undefined) {
      items.push({
        id: `here-${entry.path}`,
        group: 'Folders here',
        label: entry.name,
        icon: Folder,
        run: go(dirLocation(entry.path)),
      });
    }
  }

  const ctx = commandContext();
  for (const command of allCommands()) {
    if (command.hidden || command.id.startsWith('place-') || (command.enabled && !command.enabled(ctx))) continue;
    const shortcut = command.shortcuts?.[0];
    items.push({
      id: `cmd-${command.id}`,
      group: 'Actions',
      label: command.title,
      icon: command.icon,
      ...(shortcut ? { hint: displayShortcut(shortcut) } : {}),
      run: () => void runCommand(command),
    });
  }
  return items;
}
