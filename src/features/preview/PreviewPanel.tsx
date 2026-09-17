import { ArchiveRestore, FolderOpen, FolderPen, Link, PanelRightClose, Pin, SquareTerminal, Trash } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { type ReactNode, useEffect, useState } from 'react';

import { fsApi } from '@/ipc/api';
import { hasThumbnail } from '@/ipc/thumbnails';
import type { Entry } from '@/ipc/types';
import { formatBytes, formatDate, formatPermissions, kindLabel } from '@/shared/lib/format';
import { transitions } from '@/shared/lib/motion';
import { basename, dirname, mountFor, tildify } from '@/shared/lib/path';
import { IconButton } from '@/shared/ui/IconButton';

import { FilePage } from '../explorer/components/FilePage';
import { Thumbnail } from '../explorer/components/Thumbnail';
import { useListing } from '../explorer/listings';
import { contextDir, type Location } from '../explorer/model';
import { useSelection, useTabLocation } from '../explorer/store';
import { useFolderIcons } from '../icons/store';
import { fileActions } from '../operations/actions';
import { usePlaces } from '../places/store';
import { useSetting, useSettings } from '../settings/store';

const WIDTH = 296;

export function PreviewPanel({ tabId }: { tabId: string }) {
  const open = useSetting('previewOpen');
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.aside
          aria-label="Details"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: WIDTH, opacity: 1, transition: transitions.enter }}
          exit={{ width: 0, opacity: 0, transition: transitions.exit }}
          className="shrink-0 overflow-hidden border-l border-outline-variant bg-surface-low"
        >
          <div className="h-full overflow-y-auto p-[18px]" style={{ width: WIDTH }}>
            <div className="mb-2 flex justify-end">
              <IconButton
                icon={PanelRightClose}
                label="Close details"
                shortcut="F9"
                size="sm"
                onClick={() => useSettings.getState().update({ previewOpen: false })}
              />
            </div>
            <PreviewBody tabId={tabId} />
          </div>
        </m.aside>
      )}
    </AnimatePresence>
  );
}

function PreviewBody({ tabId }: { tabId: string }) {
  const location = useTabLocation(tabId);
  const listing = useListing(location);
  const selection = useSelection(tabId);
  const selected = (listing?.entries ?? []).filter((entry) => selection.paths.has(entry.path));

  if (!location) return null;
  if (selected.length === 1 && selected[0]) return <EntryDetails key={selected[0].path} entry={selected[0]} />;
  if (selected.length > 1) return <MultiDetails entries={selected} />;
  return <LocationDetails location={location} entries={listing?.entries ?? []} />;
}

function EntryDetails({ entry }: { entry: Entry }) {
  const home = usePlaces((s) => s.home);
  const pinned = useSettings((s) => s.settings.pinned.includes(entry.path));
  const childCount = useChildCount(entry);
  const inTrash = entry.trashId !== undefined;

  return (
    <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: transitions.enter }}>
      {entry.kind !== 'dir' && !hasThumbnail(entry) ? (
        <div className="mb-3.5 flex h-[170px] items-center justify-center">
          <FilePage entry={entry} width={108} height={144} iconSize={48} />
        </div>
      ) : (
        <div className="relative mb-3.5 flex h-[170px] items-center justify-center overflow-hidden rounded-2xl bg-surface-high">
          <Thumbnail entry={entry} iconSize={64} size={512} fit="contain" />
        </div>
      )}
      <div className="mb-3.5 text-[15px] font-bold break-words select-text">{entry.name}</div>

      <dl className="flex flex-col gap-2.5 text-[12.5px]">
        {entry.kind === 'dir' ? (
          <Row label="Contains">{childCount === null ? '…' : `${childCount} item${childCount === 1 ? '' : 's'}`}</Row>
        ) : (
          <Row label="Size">{formatBytes(entry.size)}</Row>
        )}
        <Row label="Type">{kindLabel(entry)}</Row>
        <Row label={inTrash ? 'Deleted' : 'Modified'}>{formatDate(entry.modified)}</Row>
        {!inTrash && (
          <Row label="Permissions">
            <span className="font-mono">{formatPermissions(entry.mode)}</span>
          </Row>
        )}
        <dt className="text-on-surface-variant">{inTrash ? 'Original location' : 'Path'}</dt>
        <dd className="rounded-lg bg-surface-high px-2.5 py-2 font-mono text-[11px] break-all text-on-surface-variant select-text">
          {tildify(entry.path, home)}
        </dd>
      </dl>

      <div className="my-4 h-px bg-outline-variant" />
      <div className="flex flex-col gap-0.5">
        {inTrash ? (
          <>
            <Action icon={ArchiveRestore} label="Restore" onClick={() => void fileActions.restore([entry])} />
            <Action icon={Trash} label="Delete forever" danger onClick={() => fileActions.purge([entry])} />
          </>
        ) : (
          <>
            <Action icon={FolderOpen} label="Open" onClick={() => fileActions.open(entry)} />
            <Action icon={Link} label="Copy path" onClick={() => void fileActions.copyPaths([entry.path])} />
            <Action
              icon={SquareTerminal}
              label="Open terminal here"
              onClick={() => fileActions.openTerminal(entry.kind === 'dir' ? entry.path : dirname(entry.path))}
            />
            {entry.kind === 'dir' && (
              <Action
                icon={Pin}
                label={pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                onClick={() => fileActions.togglePin(entry.path)}
              />
            )}
            {entry.kind === 'dir' && (
              <Action icon={FolderPen} label="Change icon" onClick={() => useFolderIcons.getState().openPicker(entry.path)} />
            )}
          </>
        )}
      </div>
    </m.div>
  );
}

function MultiDetails({ entries }: { entries: Entry[] }) {
  const files = entries.filter((e) => e.kind === 'file');
  const folders = entries.length - files.length;
  const bytes = files.reduce((sum, e) => sum + e.size, 0);
  return (
    <m.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: transitions.enter }}>
      <div className="mb-3.5 text-[15px] font-bold">{entries.length} items selected</div>
      <dl className="flex flex-col gap-2.5 text-[12.5px]">
        <Row label="Files">{`${files.length} · ${formatBytes(bytes)}`}</Row>
        <Row label="Folders">{String(folders)}</Row>
      </dl>
    </m.div>
  );
}

function LocationDetails({ location, entries }: { location: Location; entries: readonly Entry[] }) {
  const showHidden = useSetting('showHidden');
  const count = showHidden ? entries.length : entries.filter((e) => !e.isHidden).length;
  const home = usePlaces((s) => s.home);
  const drives = usePlaces((s) => s.drives);
  const dir = contextDir(location);
  const drive = dir ? mountFor(dir, drives) : undefined;
  const name =
    location.type === 'trash'
      ? 'Trash'
      : location.type === 'search'
        ? `Results for "${location.query}"`
        : dir === home
          ? 'Home'
          : basename(dir ?? '');

  return (
    <div>
      <div className="mb-3.5 text-[15px] font-bold break-words">{name}</div>
      <dl className="flex flex-col gap-2.5 text-[12.5px]">
        <Row label="Items">{String(count)}</Row>
        {drive && (
          <>
            <Row label="Drive">{drive.label}</Row>
            <Row label="Free space">{formatBytes(drive.availableBytes)}</Row>
          </>
        )}
      </dl>
      <p className="mt-4 text-[12px] text-on-surface-variant">Select an item to see its details.</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="truncate text-right">{children}</dd>
    </div>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Link;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-left text-[13px] transition-colors duration-100 hover:bg-surface-high ${danger ? 'text-error' : 'text-on-surface'}`}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden />
      {label}
    </button>
  );
}

/** Direct child count for a folder, fetched lazily; `null` while loading. */
function useChildCount(entry: Entry): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (entry.kind !== 'dir' || entry.trashId !== undefined) return;
    let current = true;
    fsApi.childCount(entry.path).then(
      (n) => current && setCount(n),
      () => current && setCount(0),
    );
    return () => {
      current = false;
    };
  }, [entry]);
  return count;
}
