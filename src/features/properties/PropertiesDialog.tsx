import { Copy, FolderOpen, Loader, Lock, Unlock } from 'lucide-react';
import { m } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { propertiesApi } from '@/ipc/api';
import { hasThumbnail } from '@/ipc/thumbnails';
import type { Entry, Properties } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';
import { formatBytes, formatPermissions, kindLabel } from '@/shared/lib/format';
import { transitions } from '@/shared/lib/motion';
import { basename, dirname, tildify } from '@/shared/lib/path';
import { DialogButton, Modal } from '@/shared/ui/Modal';

import { FilePage } from '../explorer/components/FilePage';
import { Thumbnail } from '../explorer/components/Thumbnail';
import { dirLocation } from '../explorer/model';
import { selectActiveTabId, useExplorer } from '../explorer/store';
import { EntryIcon } from '../icons/EntryIcon';
import { fileActions } from '../operations/actions';
import { usePlaces } from '../places/store';
import { toast } from '../toasts/store';
import { useProperties } from './store';
import { type UsageState, useUsage } from './useUsage';

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const count = new Intl.NumberFormat();
const plural = (n: number, noun: string) => `${count.format(n)} ${noun}${n === 1 ? '' : 's'}`;

/** A centered Properties window for one or more items. */
export function PropertiesDialog() {
  const entries = useProperties((s) => s.entries);
  const close = useProperties((s) => s.close);
  // Keep the content while the dialog animates out.
  const last = useRef(entries);
  if (entries) last.current = entries;
  const shown = entries ?? last.current;

  const title = !shown ? 'Properties' : shown.length === 1 ? `${shown[0]?.name ?? ''} Properties` : `${shown.length} items`;

  return (
    <Modal open={entries !== null} onClose={close} title={title} width={480}>
      {shown && (
        <div className="mt-1">
          {shown.length === 1 && shown[0] ? (
            <SingleProperties key={shown[0].path} entry={shown[0]} onClose={close} />
          ) : (
            <MultiProperties key={shown.map((e) => e.path).join('\n')} entries={shown} onClose={close} />
          )}
        </div>
      )}
    </Modal>
  );
}

function SingleProperties({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const home = usePlaces((s) => s.home);
  const inTrash = entry.trashId !== undefined;
  const details = useDetails(entry);
  const usage = useUsage(entry.kind === 'dir' && !inTrash ? [entry.path] : []);
  const preview = hasThumbnail(entry);

  return (
    <>
      <div className={cn('mb-4 flex gap-4', preview ? 'flex-col' : 'items-center')}>
        {entry.kind !== 'dir' && !preview ? (
          <FilePage entry={entry} width={60} height={80} iconSize={30} />
        ) : (
          <div
            className={cn(
              'relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface',
              preview ? 'h-44 w-full' : 'size-20',
            )}
          >
            <Thumbnail entry={entry} iconSize={48} size={512} fit="contain" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-[16px] font-bold break-words select-text">{entry.name}</div>
          <div className="text-[12px] text-on-surface-variant">
            {kindLabel(entry)}
            {entry.isHidden && ' · Hidden'}
          </div>
        </div>
      </div>

      <Section title="General">
        {details?.symlinkTarget && <Row label="Links to">{mono(tildify(details.symlinkTarget, home))}</Row>}
        <Row label={inTrash ? 'Original location' : 'Location'}>
          <span className="flex min-w-0 items-center justify-end gap-1.5">
            {mono(tildify(dirname(entry.path), home))}
            {!inTrash && (
              <button
                type="button"
                title="Show in folder"
                aria-label="Show in folder"
                onClick={() => {
                  onClose();
                  revealInFolder(entry.path);
                }}
                className="rounded-md p-1 text-on-surface-variant hover:bg-surface-highest hover:text-on-surface"
              >
                <FolderOpen size={14} />
              </button>
            )}
          </span>
        </Row>
        {entry.kind === 'dir' && !inTrash ? (
          <UsageRows state={usage} />
        ) : (
          <Row label="Size">
            {formatBytes(entry.size)}
            {entry.size >= 1024 && <span className="text-on-surface-variant"> ({count.format(entry.size)} bytes)</span>}
          </Row>
        )}
      </Section>

      <Section title="Dates">
        <Row label={inTrash ? 'Deleted' : 'Modified'}>{formatFull(entry.modified)}</Row>
        {!inTrash && (
          <>
            <Row label="Created">{details ? formatFull(details.created) : '…'}</Row>
            <Row label="Accessed">{details ? formatFull(details.accessed) : '…'}</Row>
          </>
        )}
      </Section>

      {!inTrash && (
        <Section title="Permissions">
          <Row label="Owner">{details ? `${details.owner} · ${details.group}` : '…'}</Row>
          <Row label="You can">
            {details ? (
              <span className="inline-flex items-center gap-1.5">
                {details.writable ? <Unlock size={13} aria-hidden /> : <Lock size={13} aria-hidden />}
                {details.readable && details.writable ? 'Read and write' : details.readable ? 'Read only' : 'No access'}
              </span>
            ) : (
              '…'
            )}
          </Row>
          <Row label="Mode">{mono(`${formatPermissions(entry.mode)}  ${(entry.mode & 0o777).toString(8).padStart(3, '0')}`)}</Row>
        </Section>
      )}

      <Footer paths={[entry.path]} onClose={onClose} />
    </>
  );
}

function MultiProperties({ entries, onClose }: { entries: Entry[]; onClose: () => void }) {
  const home = usePlaces((s) => s.home);
  const measurable = entries.filter((e) => e.trashId === undefined);
  const usage = useUsage(measurable.map((e) => e.path));
  const folders = entries.filter((e) => e.kind === 'dir').length;
  const parents = new Set(entries.map((e) => dirname(e.path)));
  const [onlyParent] = parents;

  return (
    <>
      <div className="mb-4 flex items-center gap-4">
        <div className="relative size-20 shrink-0">
          {entries.slice(0, 3).map((entry, index) => (
            <div
              key={entry.path}
              className="absolute drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]"
              style={{ left: index * 10, top: index * 4, zIndex: 3 - index }}
            >
              {entry.kind === 'dir' ? (
                <div className="flex size-14 items-center justify-center rounded-xl bg-surface">
                  <EntryIcon entry={entry} size={30} />
                </div>
              ) : (
                <FilePage entry={entry} width={48} height={64} iconSize={24} />
              )}
            </div>
          ))}
        </div>
        <div>
          <div className="text-[16px] font-bold">{plural(entries.length, 'item')}</div>
          <div className="text-[12px] text-on-surface-variant">
            {[folders > 0 && plural(folders, 'folder'), entries.length - folders > 0 && plural(entries.length - folders, 'file')]
              .filter(Boolean)
              .join(', ')}
          </div>
        </div>
      </div>

      <Section title="General">
        <Row label="Location">
          {parents.size === 1 && onlyParent ? mono(tildify(onlyParent, home)) : `${parents.size} folders`}
        </Row>
        {measurable.length > 0 && <UsageRows state={usage} />}
      </Section>

      <Footer paths={entries.map((e) => e.path)} onClose={onClose} />
    </>
  );
}

/** Total size, counted live: "12.4 GB · 1,204 files, 56 folders". */
function UsageRows({ state }: { state: UsageState }) {
  const { usage, done } = state;
  const counting = !done && (
    <Loader size={12} aria-label="Counting" className="ml-1.5 inline animate-spin text-on-surface-variant" />
  );
  return (
    <>
      <Row label="Size">
        {usage ? (
          <m.span key={done ? 'done' : 'counting'} initial={{ opacity: 0.6 }} animate={{ opacity: 1 }} className="tabular-nums">
            {formatBytes(usage.bytes)}
            {counting}
          </m.span>
        ) : (
          <span className="text-on-surface-variant">Counting…{counting}</span>
        )}
      </Row>
      {usage && (
        <>
          <Row label="Contains">
            <span className="tabular-nums">
              {plural(usage.files, 'file')}, {plural(usage.folders, 'folder')}
            </span>
          </Row>
          <Row label="On disk">
            <span className="tabular-nums">{formatBytes(usage.diskBytes)}</span>
          </Row>
          {done && usage.unreadable > 0 && (
            <Row label="Skipped">
              <span className="text-error">{plural(usage.unreadable, 'unreadable item')}</span>
            </Row>
          )}
        </>
      )}
    </>
  );
}

function Footer({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        type="button"
        onClick={() => void fileActions.copyPaths(paths)}
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] text-on-surface-variant transition-colors hover:bg-surface-high hover:text-on-surface"
      >
        <Copy size={14} aria-hidden />
        {paths.length === 1 ? 'Copy path' : 'Copy paths'}
      </button>
      <DialogButton variant="tonal" autoFocus onClick={onClose}>
        Close
      </DialogButton>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <m.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0, transition: transitions.enter }}
      className="mb-3 rounded-2xl bg-surface px-4 py-2.5"
    >
      <h3 className="section-label mb-1">{title}</h3>
      <dl className="flex flex-col">{children}</dl>
    </m.section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-[12.5px]">
      <dt className="shrink-0 text-on-surface-variant">{label}</dt>
      <dd className="min-w-0 text-right break-words select-text">{children}</dd>
    </div>
  );
}

const mono = (text: string) => <span className="font-mono text-[11.5px] break-all">{text}</span>;

function formatFull(millis: number | null): string {
  return millis === null ? 'Unknown' : dateTime.format(new Date(millis));
}

/** Loads the extra details (owner, dates, access) for an item that still exists. */
function useDetails(entry: Entry): Properties | null {
  const [details, setDetails] = useState<Properties | null>(null);
  useEffect(() => {
    if (entry.trashId !== undefined) return;
    let active = true;
    propertiesApi.get(entry.path).then(
      (props) => active && setDetails(props),
      (err: unknown) => active && toast.error(`Couldn't read all properties of ${basename(entry.path)}`, err),
    );
    return () => {
      active = false;
    };
  }, [entry]);
  return details;
}

/** Opens the item's folder in the active tab with the item selected. */
function revealInFolder(path: string) {
  const explorer = useExplorer.getState();
  const tabId = selectActiveTabId(explorer);
  explorer.navigate(dirLocation(dirname(path)), tabId);
  explorer.setSelection(tabId, { paths: new Set([path]), anchor: path, focus: path });
}
