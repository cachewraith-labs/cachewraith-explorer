import { create } from 'zustand';

import type { Drive, JobSnapshot } from '@/ipc/types';
import { basename, dirname, mountFor } from '@/shared/lib/path';

import { useListings } from '../explorer/listings';
import { TRASH } from '../explorer/model';
import { usePlaces } from '../places/store';
import { toast } from '../toasts/store';

interface JobsStore {
  jobs: JobSnapshot[];
  upsert(snapshot: JobSnapshot): void;
  dismiss(id: number): void;
}

const LINGER_MS = { completed: 1600, cancelled: 500, failed: 0 } as const;

export const useJobs = create<JobsStore>()((set, get) => ({
  jobs: [],

  upsert(snapshot) {
    const exists = get().jobs.some((job) => job.id === snapshot.id);
    set((state) => ({
      jobs: exists ? state.jobs.map((job) => (job.id === snapshot.id ? snapshot : job)) : [...state.jobs, snapshot],
    }));

    const { status } = snapshot;
    if (status !== 'completed' && status !== 'cancelled' && status !== 'failed') return;

    refreshAffectedListings(snapshot);
    if (status === 'failed') {
      toast.error(`${jobTitle(snapshot, usePlaces.getState().drives)} failed`, snapshot.error ?? 'Unknown error');
    }
    setTimeout(() => get().dismiss(snapshot.id), LINGER_MS[status]);
  },

  dismiss(id) {
    set((state) => ({ jobs: state.jobs.filter((job) => job.id !== id) }));
  },
}));

/** The watcher already covers open folders; this also covers trash and unwatchable dirs. */
function refreshAffectedListings(job: JobSnapshot) {
  const listings = useListings.getState();
  const dirs = new Set(job.sources.map(dirname));
  if (job.destination) dirs.add(job.destination);
  listings.reloadDirs([...dirs]);
  if ((job.kind === 'trash' || job.kind === 'delete') && listings.byKey.trash) {
    listings.reload(TRASH);
  }
}

/** "Copying to Storage", "Moving 3 items to Downloads", "Moving to Trash". */
export function jobTitle(job: JobSnapshot, drives: readonly Drive[]): string {
  const count = job.sources.length === 1 ? '' : ` ${job.sources.length} items`;
  const target = job.destination ? destinationName(job.destination, drives) : '';
  switch (job.kind) {
    case 'copy':
      return `Copying${count} to ${target}`;
    case 'move':
      return `Moving${count} to ${target}`;
    case 'trash':
      return `Moving${count} to Trash`;
    case 'delete':
      return `Deleting${count || ` ${basename(job.sources[0] ?? '')}`}`;
    case 'compress':
      return `Compressing${count || ` ${basename(job.sources[0] ?? '')}`} to .${job.format ?? 'zip'}`;
  }
}

function destinationName(path: string, drives: readonly Drive[]): string {
  const drive = mountFor(path, drives);
  return drive && drive.mountPoint === path && path !== '/' ? drive.label : basename(path);
}
