import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { cn } from '@/shared/lib/cn';
import { transitions } from '@/shared/lib/motion';

import { type ToastTone, useToasts } from './store';

const ICONS = { error: TriangleAlert, info: Info, success: CircleCheck } satisfies Record<ToastTone, typeof Info>;

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-11 left-1/2 z-50 flex w-[360px] -translate-x-1/2 flex-col-reverse gap-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.tone];
          return (
            <m.div
              key={toast.id}
              layout
              role={toast.tone === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: transitions.spring }}
              exit={{ opacity: 0, scale: 0.95, transition: transitions.exit }}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-xl bg-surface-highest px-3.5 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.45)]',
                toast.tone === 'error' && 'border-l-[3px] border-error',
              )}
            >
              <Icon
                size={17}
                strokeWidth={1.9}
                aria-hidden
                className={cn('mt-px shrink-0', toast.tone === 'error' ? 'text-error' : 'text-primary')}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-semibold">{toast.title}</div>
                {toast.message && <div className="text-[11px] break-words text-on-surface-variant">{toast.message}</div>}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => useToasts.getState().dismiss(toast.id)}
                className="rounded-md p-0.5 text-outline hover:bg-surface-high hover:text-on-surface"
              >
                <X size={13} />
              </button>
            </m.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
