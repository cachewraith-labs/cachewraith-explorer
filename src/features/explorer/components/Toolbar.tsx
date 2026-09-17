import { ChevronLeft, ChevronRight, ChevronUp, Eye, EyeOff, FolderPlus, LayoutGrid, List } from 'lucide-react';
import { useRef } from 'react';

import { useElementWidth } from '@/shared/hooks/useElementWidth';
import { IconButton } from '@/shared/ui/IconButton';
import { PillButton } from '@/shared/ui/PillButton';

import { fileActions } from '../../operations/actions';
import { useSettings } from '../../settings/store';
import { WindowControls } from '../../shell/WindowControls';
import { type Location, writableDir } from '../model';
import { type PaneId, useExplorer } from '../store';
import { Breadcrumbs } from './Breadcrumbs';
import { SearchField } from './SearchField';
import { SortMenu } from './SortMenu';

interface ToolbarProps {
  tabId: string;
  paneId: PaneId;
  location: Location;
  /** Only the rightmost pane's toolbar carries the window buttons. */
  windowControls: boolean;
}

const COMPACT_BELOW = 860;
/** Below this, view options leave the toolbar (they stay in Settings, the palette and shortcuts). */
const TIGHT_BELOW = 680;

export function Toolbar({ tabId, paneId, location, windowControls }: ToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref);
  const compact = width < COMPACT_BELOW;
  const tight = width > 0 && width < TIGHT_BELOW;
  const canGoBack = useExplorer((s) => (s.tabs[tabId]?.index ?? 0) > 0);
  const canGoForward = useExplorer((s) => {
    const tab = s.tabs[tabId];
    return tab !== undefined && tab.index < tab.history.length - 1;
  });
  const viewMode = useSettings((s) => s.settings.viewMode);
  const showHidden = useSettings((s) => s.settings.showHidden);
  const update = useSettings((s) => s.update);
  const newFolderDir = writableDir(location);
  const canGoUp = location.type === 'search' || (location.type === 'dir' && location.path !== '/');

  return (
    <div ref={ref} className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-outline-variant px-3.5">
      <IconButton
        icon={ChevronLeft}
        label="Back"
        shortcut="Alt+Left"
        disabled={!canGoBack}
        onClick={() => useExplorer.getState().goBack(tabId)}
      />
      <IconButton
        icon={ChevronRight}
        label="Forward"
        shortcut="Alt+Right"
        disabled={!canGoForward}
        onClick={() => useExplorer.getState().goForward(tabId)}
      />
      <IconButton
        icon={ChevronUp}
        label="Parent folder"
        shortcut="Alt+Up"
        disabled={!canGoUp}
        onClick={() => useExplorer.getState().goUp(tabId)}
      />
      <div className="mx-1 h-5 w-px shrink-0 bg-outline-variant" />

      <Breadcrumbs tabId={tabId} paneId={paneId} location={location} />
      {/* Empty toolbar space moves the window when it is floating. */}
      <div data-tauri-drag-region className="h-full w-2 shrink-0" />

      <SearchField tabId={tabId} paneId={paneId} location={location} compact={compact} />

      {!tight && (
        <>
          <div role="radiogroup" aria-label="View" className="flex shrink-0 gap-0.5 rounded-[10px] bg-surface-high p-0.5">
            <IconButton
              icon={LayoutGrid}
              label="Grid view"
              shortcut="Ctrl+1"
              size="sm"
              active={viewMode === 'grid'}
              onClick={() => update({ viewMode: 'grid' })}
            />
            <IconButton
              icon={List}
              label="List view"
              shortcut="Ctrl+2"
              size="sm"
              active={viewMode === 'list'}
              onClick={() => update({ viewMode: 'list' })}
            />
          </div>
          <SortMenu />
          <IconButton
            icon={showHidden ? Eye : EyeOff}
            label={showHidden ? 'Hide hidden files' : 'Show hidden files'}
            shortcut="Ctrl+H"
            className={showHidden ? '' : 'opacity-60'}
            onClick={() => update({ showHidden: !showHidden })}
          />
        </>
      )}
      {newFolderDir &&
        (compact ? (
          <IconButton
            icon={FolderPlus}
            label="New folder"
            shortcut="Ctrl+Shift+N"
            onClick={() => fileActions.requestNewFolder(newFolderDir)}
          />
        ) : (
          <PillButton
            icon={FolderPlus}
            label="New folder"
            hint="Ctrl+Shift+N"
            onClick={() => fileActions.requestNewFolder(newFolderDir)}
          />
        ))}
      {windowControls && <WindowControls />}
    </div>
  );
}
