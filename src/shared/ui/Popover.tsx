import { AnimatePresence, m } from 'motion/react';
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { transitions } from '../lib/motion';

const MARGIN = 8;

interface PopoverProps {
  open: boolean;
  /** Preferred top-left corner in viewport pixels; the popover is kept on screen. */
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  label: string;
}

/** A floating surface that closes on outside click, scroll-away or window blur. */
export function Popover({ open, x, y, onClose, children, width = 260, label }: PopoverProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <PopoverSurface x={x} y={y} onClose={onClose} width={width} label={label}>
          {children}
        </PopoverSurface>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function PopoverSurface({ x, y, onClose, children, width, label }: Omit<PopoverProps, 'open'> & { width: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, originX: 0, originY: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { offsetWidth: w, offsetHeight: h } = el;
    const flipX = x + w + MARGIN > window.innerWidth;
    const flipY = y + h + MARGIN > window.innerHeight;
    setPosition({
      left: Math.max(MARGIN, flipX ? x - w : x),
      top: Math.max(MARGIN, flipY ? y - h : y),
      originX: flipX ? 1 : 0,
      originY: flipY ? 1 : 0,
    });
  }, [x, y]);

  useLayoutEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <m.div
      ref={ref}
      aria-label={label}
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1, transition: transitions.enter }}
      exit={{ opacity: 0, scale: 0.96, transition: transitions.exit }}
      style={{
        left: position.left,
        top: position.top,
        width,
        transformOrigin: `${position.originX * 100}% ${position.originY * 100}%`,
      }}
      className="fixed z-50 rounded-[14px] bg-surface-highest p-2 shadow-[0_12px_34px_rgba(0,0,0,0.5)]"
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </m.div>
  );
}
