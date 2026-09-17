import { ChevronRight, House, Search, Trash } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { fsApi } from '@/ipc/api';
import { cn } from '@/shared/lib/cn';
import { crumbs, dirname, expandTilde, tildify } from '@/shared/lib/path';

import { usePlaces } from '../../places/store';
import { useUi } from '../../shell/ui';
import { toast } from '../../toasts/store';
import { dirLocation, type Location } from '../model';
import { type PaneId, useExplorer } from '../store';

interface BreadcrumbsProps {
  tabId: string;
  paneId: PaneId;
  location: Location;
}

/** Clickable path segments; click the empty space (or press Ctrl+L) to type a path. */
export function Breadcrumbs({ tabId, paneId, location }: BreadcrumbsProps) {
  const home = usePlaces((s) => s.home);
  const [editing, setEditing] = useState(false);
  const pathEditRequest = useUi((s) => s.pathEditRequest);
  const seenRequest = useRef(pathEditRequest);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ctrl+L opens the editor in the active pane only, and only for new requests.
  useEffect(() => {
    if (pathEditRequest === seenRequest.current) return;
    seenRequest.current = pathEditRequest;
    if (useExplorer.getState().activePaneId === paneId) setEditing(true);
  }, [pathEditRequest, paneId]);

  // Long paths scroll so the current folder stays visible.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [location]);

  if (editing) {
    const initial = location.type === 'dir' ? tildify(location.path, home) : '';
    return <PathInput tabId={tabId} initial={initial} home={home} onDone={() => setEditing(false)} />;
  }

  const pill =
    'flex shrink-0 items-center gap-1.5 rounded-full bg-surface-high px-3 py-[5px] transition-colors duration-150 hover:bg-surface-highest';

  return (
    <div
      ref={scrollRef}
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto font-mono text-[12.5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onDoubleClick={() => setEditing(true)}
      onClick={(event) => event.target === event.currentTarget && setEditing(true)}
    >
      {location.type === 'trash' && (
        <span className={cn(pill, 'font-semibold')}>
          <Trash size={13} aria-hidden /> Trash
        </span>
      )}
      {location.type === 'search' && (
        <span className={cn(pill, 'font-semibold')}>
          <Search size={13} aria-hidden /> {location.query}
          <span className="font-normal text-on-surface-variant">in {tildify(location.root, home)}</span>
        </span>
      )}
      {location.type === 'dir' &&
        crumbs(location.path, home).map((crumb, index, all) => {
          const last = index === all.length - 1;
          return (
            <span key={crumb.path} className="flex shrink-0 items-center gap-1">
              {index > 0 && <ChevronRight size={12} className="text-outline" aria-hidden />}
              <button
                type="button"
                className={cn(pill, last && 'font-semibold')}
                aria-current={last ? 'location' : undefined}
                onClick={() => useExplorer.getState().navigate(dirLocation(crumb.path), tabId)}
              >
                {crumb.label === '~' ? (
                  <>
                    <House size={13} aria-hidden />
                    {all.length === 1 ? 'Home' : '~'}
                  </>
                ) : (
                  crumb.label
                )}
              </button>
            </span>
          );
        })}
      <div className="h-full min-w-6 flex-1" onClick={() => setEditing(true)} />
    </div>
  );
}

function PathInput({ tabId, initial, home, onDone }: { tabId: string; initial: string; home: string; onDone: () => void }) {
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const submit = async () => {
    const target = expandTilde(value.trim(), home);
    if (!target) return onDone();
    try {
      const entry = await fsApi.stat(target);
      const explorer = useExplorer.getState();
      if (entry.kind === 'dir') {
        explorer.navigate(dirLocation(entry.path), tabId);
      } else {
        explorer.navigate(dirLocation(dirname(entry.path)), tabId);
        explorer.setSelection(tabId, { paths: new Set([entry.path]), anchor: entry.path, focus: entry.path });
      }
      onDone();
    } catch (err) {
      toast.error(`Can't go to ${value}`, err);
      inputRef.current?.select();
    }
  };

  return (
    <input
      ref={inputRef}
      value={value}
      aria-label="Path"
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onBlur={onDone}
      onKeyDown={(event) => {
        if (event.key === 'Enter') void submit();
        if (event.key === 'Escape') onDone();
      }}
      className="h-[30px] min-w-0 flex-1 rounded-full border-[1.5px] border-primary bg-surface-high px-3.5 font-mono text-[12.5px] outline-none"
    />
  );
}
