import { FolderPlus, Loader, Lock, RotateCcw, Search, SearchX, Trash, TriangleAlert } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useMemo } from 'react';

import { displayShortcut } from '@/shared/lib/keys';
import { transitions } from '@/shared/lib/motion';
import { PillButton } from '@/shared/ui/PillButton';

import { backgroundMenu } from '../../context-menu/menus';
import { useContextMenu } from '../../context-menu/store';
import { fileActions } from '../../operations/actions';
import { useSetting } from '../../settings/store';
import { dropTargetProps, useDrag } from '../dnd';
import { type ListingState, useListing, useListings } from '../listings';
import { type Location, locationKey, writableDir } from '../model';
import { EMPTY_SELECTION, pruneSelection } from '../selection';
import { useExplorer, useSelection, useTabLocation } from '../store';
import { viewRegistry } from '../viewRegistry';
import { visibleEntries } from '../visibleEntries';
import { EmptyState, LoadingGrid } from './EmptyState';
import { FileGrid } from './FileGrid';
import { FileList } from './FileList';
import { SelectionBar } from './SelectionBar';

export function PaneContent({ tabId }: { tabId: string }) {
  const location = useTabLocation(tabId);
  const listing = useListing(location);

  useEffect(() => {
    if (location) useListings.getState().ensure(location);
  }, [location]);

  useEffect(() => () => viewRegistry.delete(tabId), [tabId]);

  if (!location) return null;
  const dropDir = writableDir(location);

  return (
    <div
      className="relative min-h-0 flex-1"
      onClick={() => useExplorer.getState().setSelection(tabId, EMPTY_SELECTION)}
      onContextMenu={(event) => {
        event.preventDefault();
        useExplorer.getState().setSelection(tabId, EMPTY_SELECTION);
        useContextMenu.getState().show(event.clientX, event.clientY, backgroundMenu());
      }}
      {...dropTargetProps(dropDir)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <m.div
          key={locationKey(location)}
          className="absolute inset-0"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: transitions.enter }}
          exit={{ opacity: 0, transition: { duration: 0.08 } }}
        >
          <ListingView tabId={tabId} location={location} listing={listing} />
        </m.div>
      </AnimatePresence>
      <DropHighlight dir={dropDir} />
      <SelectionBar tabId={tabId} />
    </div>
  );
}

function ListingView({ tabId, location, listing }: { tabId: string; location: Location; listing: ListingState | undefined }) {
  const showHidden = useSetting('showHidden');
  const sortKey = useSetting('sortKey');
  const sortDirection = useSetting('sortDirection');
  const foldersFirst = useSetting('foldersFirst');
  const viewMode = useSetting('viewMode');
  const filter = useExplorer((s) => s.filters[tabId] ?? '');
  const selection = useSelection(tabId);

  const entries = useMemo(() => {
    // Trash defaults to "most recently deleted first" unless the user picked another sort.
    const trashDefault = location.type === 'trash' && sortKey === 'name';
    return visibleEntries(listing?.entries ?? [], {
      showHidden,
      filter,
      sortKey: trashDefault ? 'modified' : sortKey,
      sortDirection: trashDefault ? 'desc' : sortDirection,
      foldersFirst,
    });
  }, [listing?.entries, showHidden, sortKey, sortDirection, foldersFirst, filter, location.type]);

  // Forget selected paths that disappeared (deleted, filtered out, hidden).
  useEffect(() => {
    const current = useExplorer.getState().selections[tabId];
    if (!current || current.paths.size === 0) return;
    const pruned = pruneSelection(current, new Set(entries.map((e) => e.path)));
    if (pruned !== current) useExplorer.getState().setSelection(tabId, pruned);
  }, [entries, tabId]);

  if (!listing || (listing.status === 'loading' && listing.entries.length === 0)) return <LoadingGrid />;
  if (listing.status === 'error') return <ErrorState location={location} listing={listing} />;

  if (entries.length === 0) {
    if (location.type === 'search' && listing.streaming) {
      return <EmptyState icon={Loader} title="Searching…" message={`Looking for "${location.query}" in subfolders.`} />;
    }
    if (filter || location.type === 'search') {
      const term = filter || (location.type === 'search' ? location.query : '');
      return (
        <EmptyState
          icon={SearchX}
          title={`No results for "${term}"`}
          message="Try a different term, or check the hidden-files toggle."
        />
      );
    }
    if (location.type === 'trash') {
      return <EmptyState icon={Trash} title="Trash is empty" message="Files you delete will wait here until you empty it." />;
    }
    const hiddenCount = listing.entries.length;
    const dir = writableDir(location);
    return (
      <EmptyState
        icon={FolderPlus}
        title="This folder is empty"
        message={
          hiddenCount > 0
            ? `${hiddenCount} hidden item${hiddenCount === 1 ? '' : 's'}. Press Ctrl+H to show them.`
            : 'Drag files here, or create something new.'
        }
        action={dir && <PillButton icon={FolderPlus} label="New folder" onClick={() => fileActions.requestNewFolder(dir)} />}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {location.type === 'search' && <SearchSummary count={entries.length} listing={listing} />}
      <div className="min-h-0 flex-1">
        {viewMode === 'grid' ? (
          <FileGrid tabId={tabId} entries={entries} selection={selection} sections={foldersFirst} />
        ) : (
          <FileList tabId={tabId} entries={entries} selection={selection} inTrash={location.type === 'trash'} />
        )}
      </div>
    </div>
  );
}

function SearchSummary({ count, listing }: { count: number; listing: ListingState }) {
  return (
    <div className="flex items-center gap-2 px-[22px] pt-3 text-[12px] text-on-surface-variant">
      <Search size={13} aria-hidden />
      {count} result{count === 1 ? '' : 's'}
      {listing.streaming && <span className="text-outline">· still searching…</span>}
      {listing.truncated && <span className="text-outline">· showing the first {count}</span>}
    </div>
  );
}

function ErrorState({ location, listing }: { location: Location; listing: ListingState }) {
  const denied = listing.error?.kind === 'permissionDenied';
  return (
    <EmptyState
      icon={denied ? Lock : TriangleAlert}
      title={denied ? "You don't have access to this folder" : "Couldn't open this location"}
      message={listing.error?.message ?? 'Unknown error'}
      action={
        <PillButton
          icon={RotateCcw}
          label="Try again"
          hint={displayShortcut('F5')}
          onClick={() => useListings.getState().reload(location)}
        />
      }
    />
  );
}

function DropHighlight({ dir }: { dir: string | null }) {
  const active = useDrag((s) => dir !== null && s.overPath === dir);
  return (
    <AnimatePresence>
      {active && (
        <m.div
          className="pointer-events-none absolute inset-3 rounded-[18px] border-[2.5px] border-dashed border-primary bg-primary-container/15"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1, transition: transitions.enter }}
          exit={{ opacity: 0, transition: transitions.exit }}
        />
      )}
    </AnimatePresence>
  );
}
