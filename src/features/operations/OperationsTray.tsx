import { CircleCheck, HardDrive, Pause, Play, Trash, TriangleAlert, X } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';

import { jobsApi } from '@/ipc/api';
import type { JobSnapshot } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';
import { formatBytes, formatDuration } from '@/shared/lib/format';
import { transitions } from '@/shared/lib/motion';
import { basename, tildify } from '@/shared/lib/path';
import { IconButton } from '@/shared/ui/IconButton';

import { usePlaces } from '../places/store';
import { jobTitle, useJobs } from './jobs';

/** Running and queued file operations, stacked above the status bar. */
export function OperationsTray() {
  const jobs = useJobs((s) => s.jobs);
  const active = jobs.filter((job) => job.status !== 'queued');
  const queued = jobs.filter((job) => job.status === 'queued');

  return (
    <div className="pointer-events-none fixed right-4 bottom-11 z-40 flex w-[340px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {active.map((job) => (
          <m.div
            key={job.id}
            layout
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: transitions.spring }}
            exit={{ opacity: 0, x: 24, transition: transitions.exit }}
            className="pointer-events-auto"
          >
            <ProgressCard job={job} />
          </m.div>
        ))}
        {queued.length > 0 && (
          <m.div
            key="queue"
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: transitions.enter }}
            exit={{ opacity: 0, transition: transitions.exit }}
            className="pointer-events-auto rounded-2xl bg-surface-highest p-3 shadow-[0_12px_34px_rgba(0,0,0,0.4)]"
          >
            <div className="section-label mb-2">Queued</div>
            <div className="flex flex-col gap-1.5">
              {queued.map((job) => (
                <QueuedRow key={job.id} job={job} />
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProgressCard({ job }: { job: JobSnapshot }) {
  const drives = usePlaces((s) => s.drives);
  const home = usePlaces((s) => s.home);
  const byBytes = job.bytesTotal > 0;
  const done = byBytes ? job.bytesDone : job.itemsDone;
  const total = byBytes ? job.bytesTotal : job.itemsTotal;
  const fraction = job.status === 'completed' ? 1 : total > 0 ? Math.min(done / total, 1) : 0;
  const remaining = job.bytesPerSecond > 0 ? (job.bytesTotal - job.bytesDone) / job.bytesPerSecond : 0;
  const pausable = (job.kind === 'copy' || job.kind === 'move') && (job.status === 'running' || job.status === 'paused');
  const StatusIcon =
    job.status === 'completed'
      ? CircleCheck
      : job.status === 'failed'
        ? TriangleAlert
        : job.kind === 'trash' || job.kind === 'delete'
          ? Trash
          : HardDrive;

  return (
    <div className="rounded-[18px] bg-surface-highest p-4 shadow-[0_12px_34px_rgba(0,0,0,0.4)]">
      <div className="mb-1 flex items-center gap-2.5">
        <StatusIcon
          size={20}
          strokeWidth={1.8}
          aria-hidden
          className={job.status === 'failed' ? 'text-error' : 'text-tertiary'}
        />
        <div className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          {job.status === 'completed'
            ? 'Done'
            : job.status === 'paused'
              ? `Paused · ${jobTitle(job, drives)}`
              : jobTitle(job, drives)}
        </div>
        {pausable && (
          <IconButton
            icon={job.status === 'paused' ? Play : Pause}
            label={job.status === 'paused' ? 'Resume' : 'Pause'}
            size="sm"
            className="bg-surface-high"
            onClick={() => void (job.status === 'paused' ? jobsApi.resume(job.id) : jobsApi.pause(job.id))}
          />
        )}
        {!['completed', 'failed', 'cancelled'].includes(job.status) && (
          <IconButton icon={X} label="Cancel" size="sm" className="bg-surface-high" onClick={() => void jobsApi.cancel(job.id)} />
        )}
      </div>
      <div className="mb-2.5 truncate font-mono text-[11.5px] text-on-surface-variant">
        {describeSources(job)}
        {job.destination && ` → ${tildify(job.destination, home)}`}
      </div>
      <div className="mb-2 h-2 overflow-hidden rounded-full bg-surface-high">
        <m.div
          className={cn(
            'h-full rounded-full',
            job.status === 'failed' ? 'bg-error' : 'bg-primary',
            job.status === 'paused' && 'opacity-60',
          )}
          initial={false}
          animate={{ width: `${fraction * 100}%` }}
          transition={{ duration: 0.25, ease: 'linear' }}
        />
      </div>
      <div className="flex justify-between text-[11.5px] text-on-surface-variant tabular-nums">
        <span>
          {byBytes
            ? `${formatBytes(job.bytesDone)} of ${formatBytes(job.bytesTotal)}`
            : `${job.itemsDone} of ${job.itemsTotal} items`}
          {job.status === 'running' && job.bytesPerSecond > 0 && ` · ${formatBytes(job.bytesPerSecond)}/s`}
        </span>
        <span>{job.status === 'running' ? formatDuration(remaining) : ''}</span>
      </div>
    </div>
  );
}

function QueuedRow({ job }: { job: JobSnapshot }) {
  const drives = usePlaces((s) => s.drives);
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface-high px-3 py-2 text-[12px]">
      <span className="min-w-0 flex-1 truncate">{jobTitle(job, drives)}</span>
      <span className="text-outline">Waiting</span>
      <IconButton icon={X} label="Cancel" size="sm" onClick={() => void jobsApi.cancel(job.id)} />
    </div>
  );
}

function describeSources(job: JobSnapshot): string {
  const first = basename(job.current ?? job.sources[0] ?? '');
  return job.sources.length > 1 && !job.current ? `${first} +${job.sources.length - 1}` : first;
}
