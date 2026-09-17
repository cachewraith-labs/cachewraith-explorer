import { AnimatePresence, m } from 'motion/react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { transitions } from '../lib/motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 380 }: ModalProps) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div
          key="scrim"
          className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/45"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: transitions.enter }}
          exit={{ opacity: 0, transition: transitions.exit }}
          onPointerDown={(event) => event.target === event.currentTarget && onClose()}
        >
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{ width }}
            className="rounded-2xl bg-surface-highest p-5 shadow-[0_20px_50px_rgba(0,0,0,0.55)]"
            initial={{ opacity: 0, scale: 0.92, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: transitions.spring }}
            exit={{ opacity: 0, scale: 0.96, transition: transitions.exit }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
              }
            }}
          >
            <h2 className="mb-2 text-[14px] font-bold">{title}</h2>
            {children}
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'text' | 'tonal' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
  autoFocus?: boolean;
}

export function DialogButton({ children, onClick, variant = 'text', type = 'button', disabled, autoFocus }: ButtonProps) {
  const styles = {
    text: 'text-on-surface-variant hover:bg-surface-high',
    tonal: 'bg-primary-container font-semibold text-on-primary-container hover:brightness-110',
    danger: 'bg-error font-semibold text-on-error hover:brightness-110',
  } satisfies Record<NonNullable<ButtonProps['variant']>, string>;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      autoFocus={autoFocus}
      className={`rounded-full px-4 py-1.5 text-[12.5px] transition-[filter,background-color,transform] duration-150 active:scale-95 disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
