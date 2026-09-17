import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '../lib/cn';
import { Kbd } from './Kbd';
import type { MenuEntry } from './menu';

interface MenuListProps {
  items: readonly MenuEntry[];
  onDone: () => void;
}

/**
 * A keyboard-navigable list of menu items (arrows, Home/End, Enter, Escape), used by the
 * context menu and toolbar popovers.
 */
export function MenuList({ items, onDone }: MenuListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const enabled = items.flatMap((item, index) => (item.type === 'item' && !item.disabled ? [index] : []));
  const [active, setActive] = useState(-1);

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  const run = (index: number) => {
    const item = items[index];
    if (item?.type !== 'item' || item.disabled) return;
    onDone();
    item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const position = enabled.indexOf(active);
    const step = (delta: number) => {
      event.preventDefault();
      const next = enabled[(position + delta + enabled.length) % enabled.length];
      if (next !== undefined) setActive(next);
    };
    switch (event.key) {
      case 'ArrowDown':
        return step(1);
      case 'ArrowUp':
        return step(position === -1 ? enabled.length : -1);
      case 'Home':
        event.preventDefault();
        return setActive(enabled[0] ?? -1);
      case 'End':
        event.preventDefault();
        return setActive(enabled[enabled.length - 1] ?? -1);
      case 'Enter':
      case ' ':
        event.preventDefault();
        return run(active);
      case 'Escape':
      case 'Tab':
        event.preventDefault();
        return onDone();
    }
  };

  return (
    <div ref={listRef} role="menu" tabIndex={-1} onKeyDown={onKeyDown} className="flex flex-col outline-none">
      {items.map((item, index) =>
        item.type === 'separator' ? (
          <div key={item.id} role="separator" className="mx-1 my-1.5 h-px bg-outline-variant" />
        ) : (
          <button
            key={item.id}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={item.checked}
            disabled={item.disabled}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(-1)}
            onClick={() => run(index)}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors duration-100',
              'disabled:opacity-40',
              item.danger ? 'text-error' : 'text-on-surface',
              active === index && 'bg-surface-high',
            )}
          >
            <MenuIcon item={item} />
            <span className="flex-1 truncate">{item.label}</span>
            {item.shortcut && <Kbd className="text-[10.5px]">{item.shortcut}</Kbd>}
          </button>
        ),
      )}
    </div>
  );
}

function MenuIcon({ item }: { item: Extract<MenuEntry, { type: 'item' }> }) {
  const Icon = item.checked ? Check : item.icon;
  return Icon ? <Icon size={16} strokeWidth={1.8} aria-hidden className="shrink-0" /> : <span className="size-4 shrink-0" />;
}
