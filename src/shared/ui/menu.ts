import type { LucideIcon } from 'lucide-react';

export type MenuEntry =
  | {
      type: 'item';
      id: string;
      label: string;
      /** Omitted icons leave an aligned gap. */
      icon?: LucideIcon;
      /** Shows a check mark in place of the icon. */
      checked?: boolean;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      run: () => void;
    }
  | { type: 'separator'; id: string };

export const separator = (id: string): MenuEntry => ({ type: 'separator', id });
