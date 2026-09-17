import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';

import { jobsApi, watchApi } from '@/ipc/api';
import { onFsChanged, onJobsUpdated } from '@/ipc/events';
import { isTextInput } from '@/shared/lib/keys';

import { useListings } from '../features/explorer/listings';
import { type Location, locationTitle } from '../features/explorer/model';
import { currentLocation, getActiveLocation, useExplorer } from '../features/explorer/store';
import { followFolderIconChanges } from '../features/icons/store';
import { useJobs } from '../features/operations/jobs';
import { usePlaces } from '../features/places/store';
import { startThemeSync } from '../features/theme/palette';

const DRIVE_POLL_MS = 20_000;

/**
 * Wires backend events and periodic refreshes into the stores. Everything that talks to
 * the outside world without a user action lives here, in one place.
 */
export function useBackgroundSync() {
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const track = (promise: Promise<() => void>) =>
      void promise.then(
        (stop) => cleanups.push(stop),
        () => undefined,
      );

    track(startThemeSync());
    track(followFolderIconChanges());
    track(onJobsUpdated((snapshot) => useJobs.getState().upsert(snapshot)));
    track(onFsChanged((dirs) => useListings.getState().reloadDirs(dirs)));
    void jobsApi.list().then(
      (jobs) => jobs.forEach((job) => useJobs.getState().upsert(job)),
      () => undefined,
    );

    // Watch exactly the folders some tab shows; drop listings nobody shows.
    let watchedKey = '';
    const syncOpenLocations = () => {
      const { tabs } = useExplorer.getState();
      const locations: Location[] = Object.values(tabs).map(currentLocation);
      useListings.getState().retain(locations);
      const dirs = [...new Set(locations.flatMap((l) => (l.type === 'dir' ? [l.path] : [])))].sort();
      const key = dirs.join('\n');
      if (key !== watchedKey) {
        watchedKey = key;
        void watchApi.watchDirs(dirs).catch(() => undefined);
      }
      updateWindowTitle();
    };
    syncOpenLocations();
    cleanups.push(useExplorer.subscribe(syncOpenLocations));

    const refreshDrives = () => void usePlaces.getState().refreshDrives();
    const timer = setInterval(refreshDrives, DRIVE_POLL_MS);
    window.addEventListener('focus', refreshDrives);
    cleanups.push(() => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshDrives);
    });

    // The webview's own context menu (Reload, Inspect…) and file-drop navigation have no
    // place in a file manager. Text fields keep their native menu for copy/paste.
    const blockNativeMenu = (event: MouseEvent) => {
      if (!isTextInput(event.target)) event.preventDefault();
    };
    const blockExternalDrop = (event: DragEvent) => event.preventDefault();
    window.addEventListener('contextmenu', blockNativeMenu);
    window.addEventListener('dragover', blockExternalDrop);
    window.addEventListener('drop', blockExternalDrop);
    cleanups.push(() => {
      window.removeEventListener('contextmenu', blockNativeMenu);
      window.removeEventListener('dragover', blockExternalDrop);
      window.removeEventListener('drop', blockExternalDrop);
    });

    return () => cleanups.forEach((stop) => stop());
  }, []);
}

let lastTitle = '';

/** Hyprland shows the window title in bars and window lists. */
function updateWindowTitle() {
  const location = getActiveLocation();
  const { home, drives } = usePlaces.getState();
  const title = location ? `${locationTitle(location, home, drives)} — Files` : 'Files';
  if (title === lastTitle) return;
  lastTitle = title;
  document.title = title;
  void getCurrentWindow()
    .setTitle(title)
    .catch(() => undefined);
}
