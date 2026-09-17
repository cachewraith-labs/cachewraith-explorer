import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { cn } from '@/shared/lib/cn';
import { Kbd } from '@/shared/ui/Kbd';

import { useUi } from '../../shell/ui';
import { contextDir, type Location } from '../model';
import { type PaneId, useExplorer } from '../store';

interface SearchFieldProps {
  tabId: string;
  paneId: PaneId;
  location: Location;
  compact: boolean;
}

/** Typing filters the current folder instantly; Enter searches every subfolder too. */
export function SearchField({ tabId, paneId, location, compact }: SearchFieldProps) {
  const value = useExplorer((s) => s.filters[tabId] ?? '');
  const request = useUi((s) => s.searchFocusRequest);
  const seenRequest = useRef(request);
  const inputRef = useRef<HTMLInputElement>(null);
  const root = contextDir(location);

  useEffect(() => {
    if (request === seenRequest.current) return;
    seenRequest.current = request;
    if (useExplorer.getState().activePaneId === paneId) inputRef.current?.select();
  }, [request, paneId]);

  const setValue = (text: string) => useExplorer.getState().setFilter(tabId, text);

  return (
    <label
      className={cn(
        'group flex h-8 items-center gap-2 rounded-full bg-surface-high px-3 text-on-surface-variant transition-[width,background-color] duration-200 ease-emphasized',
        'focus-within:bg-surface-highest focus-within:text-on-surface',
        compact ? 'w-40 focus-within:w-56' : 'w-[260px]',
      )}
    >
      <Search size={15} aria-hidden className="shrink-0" />
      <input
        ref={inputRef}
        value={value}
        spellCheck={false}
        placeholder={root ? 'Search' : 'Filter'}
        aria-label="Search"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && root && value.trim()) {
            useExplorer.getState().navigate({ type: 'search', root, query: value.trim() }, tabId);
            event.currentTarget.blur();
          } else if (event.key === 'Escape') {
            setValue('');
            event.currentTarget.blur();
          } else if (event.key === 'ArrowDown') {
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 bg-transparent text-[12.5px] text-on-surface outline-none placeholder:text-on-surface-variant"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setValue('')}
          className="rounded-full p-0.5 hover:bg-surface-highest"
        >
          <X size={13} />
        </button>
      ) : (
        !compact && <Kbd>Ctrl+F</Kbd>
      )}
    </label>
  );
}
