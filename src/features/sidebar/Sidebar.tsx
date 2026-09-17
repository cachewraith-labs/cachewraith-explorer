import { ChevronLeft, ChevronRight, Folder, GripVertical, type LucideIcon, Plus, Settings, Trash } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';

import { cn } from '@/shared/lib/cn';
import { transitions } from '@/shared/lib/motion';
import { basename, isInside, mountFor } from '@/shared/lib/path';
import { IconButton } from '@/shared/ui/IconButton';
import { Kbd } from '@/shared/ui/Kbd';

import { useContextMenu } from '../context-menu/store';
import { dropTargetProps, useDrag } from '../explorer/dnd';
import { dirLocation, type Location, TRASH } from '../explorer/model';
import { getActiveLocation, useExplorer } from '../explorer/store';
import { fileActions } from '../operations/actions';
import { PLACE_ICONS } from '../places/icons';
import { usePlaces } from '../places/store';
import { useSettings } from '../settings/store';
import { useUi } from '../shell/ui';
import { DriveCard, DriveMini } from './DriveCard';

const EXPANDED = 236;
const RAIL = 64;
/** Below this window width the sidebar folds into the icon rail automatically. */
const AUTO_COLLAPSE_BELOW = 1000;

export function Sidebar() {
  const userCollapsed = useSettings((s) => s.settings.sidebarCollapsed);
  const narrow = useNarrowWindow();
  const collapsed = userCollapsed || narrow;
  const location = useExplorer((s) => {
    const pane = s.panes.find((p) => p.id === s.activePaneId);
    const tab = pane && s.tabs[pane.activeTabId];
    return tab?.history[tab.index];
  });

  return (
    <m.nav
      aria-label="Sidebar"
      initial={false}
      animate={{ width: collapsed ? RAIL : EXPANDED, transition: transitions.layout }}
      className="flex shrink-0 flex-col overflow-hidden bg-surface-low"
    >
      {collapsed ? <Rail location={location} canExpand={!narrow} /> : <Expanded location={location} />}
    </m.nav>
  );
}

function Expanded({ location }: { location: Location | undefined }) {
  const places = usePlaces((s) => s.places);
  const drives = usePlaces((s) => s.drives);
  const pinned = useSettings((s) => s.settings.pinned);
  const current = location?.type === 'dir' ? location.path : null;
  const activeDrive = current ? mountFor(current, drives) : undefined;

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { ...transitions.enter, delay: 0.05 } }}
      className="flex h-full flex-col overflow-y-auto px-2.5 py-3.5"
      style={{ width: EXPANDED }}
    >
      <div className="flex items-center gap-2 px-2 pt-1 pb-3">
        <Folder size={19} className="text-primary" aria-hidden />
        <span className="text-[14px] font-bold">Files</span>
        <IconButton
          icon={Settings}
          label="Settings"
          shortcut="Ctrl+,"
          className="ml-auto"
          onClick={() => useUi.getState().setSettingsOpen(true)}
        />
        <IconButton
          icon={ChevronLeft}
          label="Collapse sidebar"
          shortcut="Ctrl+B"
          onClick={() => useSettings.getState().update({ sidebarCollapsed: true })}
        />
      </div>

      <SectionLabel first>Places</SectionLabel>
      {places.map((place, index) => (
        <NavItem
          key={place.id}
          icon={PLACE_ICONS[place.id]}
          label={place.label}
          hint={`Alt+${index + 1}`}
          active={current === place.path}
          dropPath={place.path}
          onClick={() => navigate(dirLocation(place.path))}
        />
      ))}
      <NavItem icon={Trash} label="Trash" hint="Alt+8" active={location?.type === 'trash'} onClick={() => navigate(TRASH)} />

      <SectionLabel>Pinned</SectionLabel>
      <PinnedList pinned={pinned} current={current} />

      <SectionLabel>Drives</SectionLabel>
      <div className="flex flex-col gap-2">
        {drives.map((drive) => (
          <DriveCard
            key={drive.mountPoint}
            drive={drive}
            active={activeDrive?.mountPoint === drive.mountPoint}
            onClick={() => navigate(dirLocation(drive.mountPoint))}
          />
        ))}
      </div>
    </m.div>
  );
}

function PinnedList({ pinned, current }: { pinned: readonly string[]; current: string | null }) {
  const [dragging, setDragging] = useState<string | null>(null);

  const reorder = (target: string) => {
    if (!dragging || dragging === target) return;
    const next = pinned.filter((p) => p !== dragging);
    next.splice(next.indexOf(target), 0, dragging);
    useSettings.getState().update({ pinned: next });
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {pinned.map((path) => (
          <m.div
            key={path}
            layout="position"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', transition: transitions.enter }}
            exit={{ opacity: 0, height: 0, transition: transitions.exit }}
          >
            <div
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                setDragging(path);
              }}
              onDragEnter={() => reorder(path)}
              onDragEnd={() => setDragging(null)}
              className={cn(dragging === path && 'opacity-50')}
            >
              <NavItem
                icon={GripVertical}
                iconClassName="opacity-50"
                label={basename(path)}
                title={path}
                active={current === path}
                dropPath={dragging ? null : path}
                onClick={() => navigate(dirLocation(path))}
                onContextMenu={(event) => {
                  event.preventDefault();
                  useContextMenu.getState().show(event.clientX, event.clientY, [
                    {
                      type: 'item',
                      id: 'open-tab',
                      label: 'Open in new tab',
                      icon: Folder,
                      run: () => fileActions.openInNewTab(path),
                    },
                    {
                      type: 'item',
                      id: 'unpin',
                      label: 'Unpin',
                      icon: Trash,
                      danger: true,
                      run: () => fileActions.togglePin(path),
                    },
                  ]);
                }}
              />
            </div>
          </m.div>
        ))}
      </AnimatePresence>
      <NavItem
        icon={Plus}
        label="Pin current folder"
        muted
        onClick={() => {
          const location = getActiveLocation();
          if (location?.type === 'dir' && !pinned.includes(location.path)) fileActions.togglePin(location.path);
        }}
      />
    </>
  );
}

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  hint?: string;
  title?: string;
  muted?: boolean;
  iconClassName?: string;
  dropPath?: string | null;
  onContextMenu?: (event: React.MouseEvent) => void;
}

function NavItem({
  icon: Icon,
  label,
  onClick,
  active,
  hint,
  title,
  muted,
  iconClassName,
  dropPath = null,
  onContextMenu,
}: NavItemProps) {
  const dragOver = useDrag((s) => dropPath !== null && s.overPath === dropPath);
  return (
    <button
      type="button"
      title={title}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      {...dropTargetProps(dropPath)}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-left text-[13px] transition-[background-color,color] duration-150',
        active
          ? 'bg-secondary-container font-semibold text-on-secondary-container'
          : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface',
        muted && 'text-outline',
        dragOver && 'bg-primary-container text-on-primary-container',
      )}
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden className={cn('shrink-0', iconClassName)} />
      <span className="flex-1 truncate">{label}</span>
      {hint && <Kbd>{hint}</Kbd>}
    </button>
  );
}

function SectionLabel({ children, first }: { children: string; first?: boolean }) {
  return <div className={cn('section-label px-2.5 pb-1', first ? 'pt-0.5' : 'pt-3.5')}>{children}</div>;
}

function Rail({ location, canExpand }: { location: Location | undefined; canExpand: boolean }) {
  const places = usePlaces((s) => s.places);
  const drives = usePlaces((s) => s.drives);
  const current = location?.type === 'dir' ? location.path : null;

  return (
    <div className="flex h-full flex-col items-center gap-1 py-3" style={{ width: RAIL }}>
      {canExpand ? (
        <IconButton
          icon={ChevronRight}
          label="Expand sidebar"
          shortcut="Ctrl+B"
          className="mb-2 size-10 rounded-xl"
          onClick={() => useSettings.getState().update({ sidebarCollapsed: false })}
        />
      ) : (
        <Folder size={19} className="mb-3 text-primary" aria-hidden />
      )}
      {places.map((place) => (
        <RailButton
          key={place.id}
          icon={PLACE_ICONS[place.id]}
          label={place.label}
          active={current === place.path}
          dropPath={place.path}
          onClick={() => navigate(dirLocation(place.path))}
        />
      ))}
      <RailButton
        icon={Trash}
        label="Trash"
        active={location?.type === 'trash'}
        dropPath={null}
        onClick={() => navigate(TRASH)}
      />
      <div className="flex-1" />
      {drives.map((drive) => (
        <DriveMini
          key={drive.mountPoint}
          drive={drive}
          active={current !== null && isInside(current, drive.mountPoint) && mountFor(current, drives) === drive}
          onClick={() => navigate(dirLocation(drive.mountPoint))}
        />
      ))}
      <IconButton
        icon={Settings}
        label="Settings"
        shortcut="Ctrl+,"
        className="mt-1 size-10 rounded-xl"
        onClick={() => useUi.getState().setSettingsOpen(true)}
      />
    </div>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
  dropPath,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  dropPath: string | null;
}) {
  const dragOver = useDrag((s) => dropPath !== null && s.overPath === dropPath);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      {...dropTargetProps(dropPath)}
      className={cn(
        'flex size-10 items-center justify-center rounded-xl transition-colors duration-150',
        active ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-high',
        dragOver && 'bg-primary-container text-on-primary-container',
      )}
    >
      <Icon size={17} strokeWidth={1.8} />
    </button>
  );
}

function navigate(location: Location) {
  useExplorer.getState().navigate(location);
}

function useNarrowWindow(): boolean {
  const query = `(max-width: ${AUTO_COLLAPSE_BELOW - 1}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
}
