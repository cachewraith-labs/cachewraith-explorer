import { Folder, HardDrive, House, type LucideIcon, Plus, Search, Trash, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/shared/lib/cn';
import { transitions } from '@/shared/lib/motion';
import { IconButton } from '@/shared/ui/IconButton';

import { usePlaces } from '../../places/store';
import { dropTargetProps } from '../dnd';
import { type Location, locationTitle, writableDir } from '../model';
import { type Pane, useExplorer, useTabLocation } from '../store';

export function TabBar({ pane }: { pane: Pane }) {
  return (
    <div
      role="tablist"
      className="flex h-[38px] shrink-0 items-end gap-0.5 overflow-x-auto bg-surface-low px-2.5 pt-1.5 [scrollbar-width:none]"
    >
      <AnimatePresence initial={false}>
        {pane.tabIds.map((tabId) => (
          <TabItem key={tabId} tabId={tabId} active={tabId === pane.activeTabId} closable={pane.tabIds.length > 1} />
        ))}
      </AnimatePresence>
      <IconButton
        icon={Plus}
        label="New tab"
        shortcut="Ctrl+T"
        className="mb-1 self-center"
        onClick={() => {
          const explorer = useExplorer.getState();
          const tab = explorer.tabs[pane.activeTabId];
          const location = tab?.history[tab.index];
          explorer.openTab(location ?? { type: 'dir', path: usePlaces.getState().home }, pane.id);
        }}
      />
      {/* Empty tab-strip space moves the window; double-click maximizes. */}
      <div data-tauri-drag-region className="h-full min-w-8 flex-1" />
    </div>
  );
}

function TabItem({ tabId, active, closable }: { tabId: string; active: boolean; closable: boolean }) {
  const location = useTabLocation(tabId);
  const home = usePlaces((s) => s.home);
  const drives = usePlaces((s) => s.drives);
  if (!location) return null;

  const title = locationTitle(location, home, drives);
  const Icon = tabIcon(
    location,
    home,
    drives.map((d) => d.mountPoint),
  );

  return (
    <m.div
      layout="position"
      role="tab"
      aria-selected={active}
      title={location.type === 'dir' ? location.path : title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: transitions.enter }}
      exit={{ opacity: 0, scale: 0.9, transition: transitions.exit }}
      onClick={() => useExplorer.getState().activateTab(tabId)}
      onAuxClick={(event) => event.button === 1 && closable && useExplorer.getState().closeTab(tabId)}
      {...dropTargetProps(writableDir(location))}
      className={cn(
        'group flex max-w-[220px] shrink-0 items-center gap-2 rounded-t-[10px] py-2 pr-2.5 pl-3.5 text-[12.5px] transition-colors duration-150',
        active ? 'bg-surface font-semibold' : 'text-on-surface-variant hover:bg-surface/50',
      )}
    >
      <Icon
        size={14}
        aria-hidden
        className={cn(
          'shrink-0',
          active &&
            (location.type === 'dir' && drives.some((d) => d.mountPoint === location.path) ? 'text-tertiary' : 'text-primary'),
        )}
      />
      <span className="truncate">{title}</span>
      {closable && (
        <button
          type="button"
          aria-label={`Close ${title}`}
          onClick={(event) => {
            event.stopPropagation();
            useExplorer.getState().closeTab(tabId);
          }}
          className={cn(
            'rounded-md p-0.5 text-outline transition-opacity duration-150 hover:bg-surface-high hover:text-on-surface',
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <X size={13} />
        </button>
      )}
    </m.div>
  );
}

function tabIcon(location: Location, home: string, mounts: readonly string[]): LucideIcon {
  switch (location.type) {
    case 'trash':
      return Trash;
    case 'search':
      return Search;
    case 'dir':
      if (location.path === home) return House;
      return mounts.includes(location.path) && location.path !== '/' ? HardDrive : Folder;
  }
}
