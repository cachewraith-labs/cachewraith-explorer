import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/shared/lib/cn';

import { useDesktop } from '../desktop/store';

/**
 * Minimize / maximize / close for desktops whose compositor draws no title bar for this
 * frameless window (GNOME, KDE, XFCE…). Hidden on tiling compositors.
 */
export function WindowControls() {
  const visible = useDesktop((s) => s.info.windowControls);
  const maximized = useMaximized(visible);
  if (!visible) return null;

  const window = getCurrentWindow();
  const button = 'flex size-[30px] items-center justify-center rounded-full transition-colors duration-150';

  return (
    <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-outline-variant pl-2">
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void window.minimize()}
        className={cn(button, 'text-on-surface-variant hover:bg-surface-high')}
      >
        <Minus size={15} strokeWidth={2} />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void window.toggleMaximize()}
        className={cn(button, 'text-on-surface-variant hover:bg-surface-high')}
      >
        {maximized ? <Copy size={13} strokeWidth={2} className="-scale-x-100" /> : <Square size={12} strokeWidth={2.2} />}
      </button>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        onClick={() => void window.close()}
        className={cn(button, 'text-on-surface-variant hover:bg-error hover:text-on-error')}
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

function useMaximized(enabled: boolean): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const window = getCurrentWindow();
    let stop: (() => void) | undefined;
    const sync = () => void window.isMaximized().then(setMaximized, () => undefined);
    sync();
    void window.onResized(sync).then((unlisten) => (stop = unlisten));
    return () => stop?.();
  }, [enabled]);
  return maximized;
}
