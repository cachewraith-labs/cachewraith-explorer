import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import { useEffect, useState } from 'react';

import { fsApi, settingsApi } from '@/ipc/api';

import { useDesktop } from '../features/desktop/store';
import { useFolderIcons } from '../features/icons/store';
import { dirLocation } from '../features/explorer/model';
import { useExplorer } from '../features/explorer/store';
import { usePlaces } from '../features/places/store';
import { DEFAULT_SETTINGS, useSetting, useSettings } from '../features/settings/store';
import { AppShell } from './AppShell';

/** Loads settings, places and the start folder, then renders the shell. */
export function App() {
  const [ready, setReady] = useState(false);
  const reduceMotion = useSetting('reduceMotion');

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [settings, initial] = await Promise.all([
        settingsApi.load().catch(() => DEFAULT_SETTINGS),
        fsApi.initialLocation().catch(() => null),
        usePlaces
          .getState()
          .load()
          .catch(() => undefined),
        useDesktop.getState().load(),
        useFolderIcons.getState().load(),
      ]);
      if (cancelled) return;
      useSettings.getState().hydrate(settings);
      useExplorer.getState().init(dirLocation(initial ?? (usePlaces.getState().home || '/')));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <MotionConfig reducedMotion={reduceMotion ? 'always' : 'user'}>
      <LazyMotion features={domAnimation} strict>
        {ready ? <AppShell /> : <div className="h-full bg-background" />}
      </LazyMotion>
    </MotionConfig>
  );
}
