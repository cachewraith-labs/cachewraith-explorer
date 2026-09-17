import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../lib/cn';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Accessible name, also shown as the tooltip together with `shortcut`. */
  label: string;
  shortcut?: string;
  active?: boolean;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

export function IconButton({
  icon: Icon,
  label,
  shortcut,
  active = false,
  size = 'md',
  tone = 'default',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg transition-[background-color,color,opacity,transform] duration-150 ease-emphasized',
        'active:scale-90 disabled:pointer-events-none disabled:opacity-40',
        size === 'md' ? 'size-[30px]' : 'size-[26px]',
        active
          ? 'bg-primary-container text-on-primary-container'
          : tone === 'danger'
            ? 'text-error hover:bg-surface-high'
            : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'md' ? 17 : 15} strokeWidth={1.8} />
    </button>
  );
}
