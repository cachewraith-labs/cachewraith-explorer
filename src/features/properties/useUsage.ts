import { useEffect, useState } from 'react';

import { propertiesApi } from '@/ipc/api';
import type { Usage } from '@/ipc/types';

export interface UsageState {
  usage: Usage | null;
  done: boolean;
}

/**
 * Counts the total size of `paths` in the background, updating as it goes. The count
 * stops when the component unmounts or the paths change.
 */
export function useUsage(paths: readonly string[]): UsageState {
  const [state, setState] = useState<UsageState>({ usage: null, done: false });
  const key = paths.join('\n');

  useEffect(() => {
    if (key === '') return;
    let active = true;
    let taskId: number | undefined;
    setState({ usage: null, done: false });

    propertiesApi
      .startUsage(key.split('\n'), (event) => {
        if (active) setState({ usage: event.usage, done: event.type === 'done' });
      })
      .then(
        (id) => {
          taskId = id;
          if (!active) void propertiesApi.cancelUsage(id);
        },
        () => active && setState((s) => ({ ...s, done: true })),
      );

    return () => {
      active = false;
      if (taskId !== undefined) void propertiesApi.cancelUsage(taskId);
    };
  }, [key]);

  return state;
}
