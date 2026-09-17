import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-color-scheme: dark)';

/** The desktop's light/dark preference, updated live. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(QUERY);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(QUERY).matches,
  );
}
