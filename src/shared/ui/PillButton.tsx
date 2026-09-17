import type { LucideIcon } from 'lucide-react';

/** The filled, rounded primary action from the design ("New folder"). */
export function PillButton({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full bg-primary-container py-[7px] pr-3.5 pl-3 text-[12.5px] font-semibold text-on-primary-container transition-[filter,transform] duration-150 hover:brightness-110 active:scale-95"
    >
      <Icon size={15} strokeWidth={1.9} aria-hidden />
      {label}
      {hint && <span className="font-mono text-[10px] font-normal opacity-75">{hint}</span>}
    </button>
  );
}
