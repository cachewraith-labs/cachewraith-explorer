import { m } from 'motion/react';
import { useMemo } from 'react';

import { formatBytes } from '@/shared/lib/format';
import { mountFor } from '@/shared/lib/path';

import { useListing } from '../explorer/listings';
import { contextDir, locationTitle } from '../explorer/model';
import { useExplorer, useSelection, useTabLocation } from '../explorer/store';
import { usePlaces } from '../places/store';
import { useSetting } from '../settings/store';

export function StatusBar() {
  const tabId = useExplorer((s) => s.panes.find((p) => p.id === s.activePaneId)?.activeTabId ?? '');
  const split = useExplorer((s) => s.panes.length > 1);
  const location = useTabLocation(tabId);
  const listing = useListing(location);
  const selection = useSelection(tabId);
  const showHidden = useSetting('showHidden');
  const home = usePlaces((s) => s.home);
  const drives = usePlaces((s) => s.drives);

  const { count, selectedBytes } = useMemo(() => {
    const entries = listing?.entries ?? [];
    let visible = 0;
    let bytes = 0;
    for (const entry of entries) {
      if (showHidden || !entry.isHidden) visible++;
      if (selection.paths.has(entry.path) && entry.kind === 'file') bytes += entry.size;
    }
    return { count: visible, selectedBytes: bytes };
  }, [listing?.entries, selection.paths, showHidden]);

  const dir = location && contextDir(location);
  const drive = dir ? mountFor(dir, drives) : undefined;
  const title = location ? locationTitle(location, home, drives) : '';

  return (
    <footer className="flex h-[30px] shrink-0 items-center justify-between gap-4 border-t border-outline-variant bg-surface-lowest px-4 text-[11.5px] text-on-surface-variant">
      <span className="truncate">
        {split && `${title} · `}
        {count} item{count === 1 ? '' : 's'}
      </span>
      {selection.paths.size > 0 && (
        <m.span key={selection.paths.size} initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} className="tabular-nums">
          {selection.paths.size} selected{selectedBytes > 0 && ` · ${formatBytes(selectedBytes)}`}
        </m.span>
      )}
      <span className="truncate">
        {drive ? `${split ? `${drive.label} · ` : ''}${formatBytes(drive.availableBytes)} free` : ''}
      </span>
    </footer>
  );
}
