import type { LucideIcon } from 'lucide-react';
import { m } from 'motion/react';
import type { ReactNode } from 'react';

import { transitions } from '@/shared/lib/motion';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <m.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: transitions.enter }}
      className="flex h-full flex-col items-center justify-center p-12 text-center"
    >
      <div className="mb-4 flex size-16 items-center justify-center rounded-[18px] bg-surface-high">
        <Icon size={28} strokeWidth={1.7} className="text-outline" aria-hidden />
      </div>
      <div className="mb-1.5 text-[15px] font-semibold">{title}</div>
      <div className="max-w-[320px] text-[12.5px] text-on-surface-variant">{message}</div>
      {action && <div className="mt-[18px]">{action}</div>}
    </m.div>
  );
}

export function LoadingGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4 px-[22px] pt-5" aria-busy="true">
      {Array.from({ length: 18 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5" style={{ opacity: 1 - i * 0.045 }}>
          <div className="skeleton h-[84px] w-full rounded-[14px]" />
          <div className="skeleton h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}
