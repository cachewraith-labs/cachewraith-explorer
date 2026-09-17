import { ArchiveRestore, Copy, Scissors, Trash, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { transitions } from '@/shared/lib/motion';
import { IconButton } from '@/shared/ui/IconButton';

import { findCommand, runCommand } from '../../commands/registry';
import { EMPTY_SELECTION } from '../selection';
import { useExplorer, useSelection, useTabLocation } from '../store';

const run = (id: string) => {
  const command = findCommand(id);
  if (command) runCommand(command);
};

/** Floats over the view once more than one item is selected. */
export function SelectionBar({ tabId }: { tabId: string }) {
  const count = useSelection(tabId).paths.size;
  const inTrash = useTabLocation(tabId)?.type === 'trash';
  const active = useExplorer((s) => s.panes.find((p) => p.id === s.activePaneId)?.activeTabId === tabId);

  return (
    <AnimatePresence>
      {count > 1 && active && (
        <m.div
          role="toolbar"
          aria-label="Selection actions"
          onClick={(event) => event.stopPropagation()}
          initial={{ opacity: 0, y: 24, x: '-50%', scale: 0.96 }}
          animate={{ opacity: 1, y: 0, x: '-50%', scale: 1, transition: transitions.spring }}
          exit={{ opacity: 0, y: 16, x: '-50%', transition: transitions.exit }}
          className="absolute bottom-5 left-1/2 z-10 flex items-center gap-1 rounded-3xl bg-surface-highest py-2 pr-2.5 pl-[18px] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        >
          <m.span
            key={count}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            className="mr-2 text-[12.5px] font-semibold tabular-nums"
          >
            {count} selected
          </m.span>
          {inTrash ? (
            <>
              <IconButton icon={ArchiveRestore} label="Restore" onClick={() => run('restore')} />
              <IconButton icon={Trash} label="Delete forever" tone="danger" onClick={() => run('delete-permanently')} />
            </>
          ) : (
            <>
              <IconButton icon={Copy} label="Copy" shortcut="Ctrl+C" onClick={() => run('copy')} />
              <IconButton icon={Scissors} label="Cut" shortcut="Ctrl+X" onClick={() => run('cut')} />
              <IconButton icon={Trash} label="Move to Trash" shortcut="Del" tone="danger" onClick={() => run('move-to-trash')} />
            </>
          )}
          <div className="mx-1 h-[18px] w-px bg-outline-variant" />
          <IconButton
            icon={X}
            label="Clear selection"
            shortcut="Esc"
            onClick={() => useExplorer.getState().setSelection(tabId, EMPTY_SELECTION)}
          />
        </m.div>
      )}
    </AnimatePresence>
  );
}
