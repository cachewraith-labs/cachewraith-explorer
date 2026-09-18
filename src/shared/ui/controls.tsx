import { m } from 'motion/react';

import { cn } from '../lib/cn';
import { transitions } from '../lib/motion';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** Material 3 switch. */
export function Switch({ checked, onChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative flex h-7 w-[46px] shrink-0 items-center rounded-full border-2 px-[3px] transition-colors duration-200 disabled:opacity-40',
        checked ? 'border-primary bg-primary' : 'border-outline bg-surface-highest',
      )}
    >
      <m.span
        layout
        transition={transitions.spring}
        className={cn('block rounded-full', checked ? 'ml-auto size-5 bg-on-primary' : 'size-3.5 bg-outline')}
      />
    </button>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  label: string;
}

/** A row of mutually exclusive choices with a sliding highlight. */
export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-0.5 rounded-full bg-surface-high p-[3px]">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative rounded-full px-3.5 py-1.5 text-[12.5px] transition-colors duration-150 disabled:opacity-40',
              selected ? 'font-semibold text-on-primary-container' : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {selected && (
              <m.span
                layoutId={`segmented-${label}`}
                transition={transitions.layout}
                className="absolute inset-0 rounded-full bg-primary-container"
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
