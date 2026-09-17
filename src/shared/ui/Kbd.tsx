import { cn } from '../lib/cn';

export function Kbd({ children, className }: { children: string; className?: string }) {
  return <span className={cn('font-mono text-[10px] text-outline', className)}>{children}</span>;
}
