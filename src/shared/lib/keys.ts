/**
 * Keyboard shortcuts are written as `Ctrl+Shift+N`: modifiers in the order
 * Ctrl, Alt, Shift, then the key as `KeyboardEvent.key` (letters upper-cased).
 */
export function shortcutFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(normalizeKey(event));
  return parts.join('+');
}

function normalizeKey(event: KeyboardEvent): string {
  // `code` keeps Alt+1 and Shift+letter stable across layouts and modifier states.
  if (event.code.startsWith('Digit')) return event.code.slice(5);
  if (event.code.startsWith('Key')) return event.code.slice(3);
  switch (event.key) {
    case ' ':
      return 'Space';
    case 'Del':
      return 'Delete';
    case 'Esc':
      return 'Escape';
    default:
      return event.key.length === 1 ? event.key.toUpperCase() : event.key;
  }
}

export function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Delete: 'Del',
  Escape: 'Esc',
};

/** `Alt+ArrowLeft` → `Alt+Left`, for hints. */
export function displayShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => KEY_LABELS[part] ?? part)
    .join('+');
}
