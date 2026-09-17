import { cn } from '@/shared/lib/cn';

import { PreviewPanel } from '../../preview/PreviewPanel';
import { type Pane as PaneModel, useExplorer, useTabLocation } from '../store';
import { PaneContent } from './PaneContent';
import { TabBar } from './TabBar';
import { Toolbar } from './Toolbar';

interface PaneProps {
  pane: PaneModel;
  split: boolean;
  /** The rightmost pane; it carries the window buttons. */
  last: boolean;
}

/** One side of the explorer: toolbar, tabs, and the active tab's content. */
export function Pane({ pane, split, last }: PaneProps) {
  const location = useTabLocation(pane.activeTabId);
  const active = useExplorer((s) => s.activePaneId === pane.id);

  return (
    <section
      aria-label={pane.id === 'primary' ? 'Left pane' : 'Right pane'}
      onPointerDownCapture={() => useExplorer.getState().focusPane(pane.id)}
      className={cn('relative flex min-w-0 flex-1 flex-col bg-surface', split && 'border-outline-variant not-last:border-r')}
    >
      {split && (
        <div
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 z-10 h-0.5 bg-primary transition-opacity duration-200',
            active ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      {location && <Toolbar tabId={pane.activeTabId} paneId={pane.id} location={location} windowControls={last} />}
      <TabBar pane={pane} />
      <div className="flex min-h-0 flex-1">
        <PaneContent key={pane.activeTabId} tabId={pane.activeTabId} />
        {!split && <PreviewPanel tabId={pane.activeTabId} />}
      </div>
    </section>
  );
}
