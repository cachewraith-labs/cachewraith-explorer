import { HardDrive, Star, Usb } from 'lucide-react';
import { m } from 'motion/react';

import type { Drive } from '@/ipc/types';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { transitions } from '@/shared/lib/motion';
import { tildify } from '@/shared/lib/path';

import { dropTargetProps, useDrag } from '../explorer/dnd';
import { usePlaces } from '../places/store';

interface DriveProps {
  drive: Drive;
  active: boolean;
  onClick: () => void;
}

const usedFraction = (drive: Drive) => (drive.totalBytes > 0 ? drive.usedBytes / drive.totalBytes : 0);

/** A drive with its usage bar. Drives mounted inside home are featured (starred). */
export function DriveCard({ drive, active, onClick }: DriveProps) {
  const home = usePlaces((s) => s.home);
  const dragOver = useDrag((s) => s.overPath === drive.mountPoint);
  const Icon = drive.removable ? Usb : HardDrive;
  const title = drive.model ? `${drive.model} · ${drive.fsType}` : drive.fsType;

  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      {...dropTargetProps(drive.mountPoint)}
      className={cn(
        'mx-0.5 rounded-[14px] p-3 text-left transition-[background-color,outline-color] duration-150',
        active
          ? 'bg-surface-highest outline-[1.5px] outline-outline'
          : drive.inHome
            ? 'bg-surface-high hover:bg-surface-highest'
            : 'hover:bg-surface-high',
        dragOver && 'bg-primary-container outline-2 outline-dashed outline-primary',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon size={17} strokeWidth={1.8} aria-hidden className={drive.inHome ? 'text-tertiary' : 'text-on-surface-variant'} />
        <span className="truncate font-semibold">{drive.label}</span>
        {drive.inHome && <Star size={13} aria-label="Data drive" fill="currentColor" className="ml-auto shrink-0 text-primary" />}
      </div>
      <div className="mt-[3px] mb-2 truncate font-mono text-[11px] text-on-surface-variant">
        {tildify(drive.mountPoint, home)}
      </div>
      <UsageBar drive={drive} className="h-1.5" />
      <div className="mt-1.5 flex justify-between text-[11px] text-on-surface-variant">
        <span>{formatBytes(drive.usedBytes)} used</span>
        <span>{formatBytes(drive.totalBytes)}</span>
      </div>
    </button>
  );
}

/** The collapsed-rail version: just the bar and an icon. */
export function DriveMini({ drive, active, onClick }: DriveProps) {
  return (
    <button
      type="button"
      title={`${drive.label} · ${formatBytes(drive.availableBytes)} free`}
      aria-label={drive.label}
      onClick={onClick}
      className={cn(
        'flex w-11 flex-col items-center gap-1 rounded-lg px-1 py-1.5 transition-colors',
        active ? 'bg-surface-highest' : 'hover:bg-surface-high',
      )}
    >
      <UsageBar drive={drive} className="h-[5px] w-full" />
      <HardDrive size={14} aria-hidden className={drive.inHome ? 'text-tertiary' : 'text-on-surface-variant'} />
    </button>
  );
}

function UsageBar({ drive, className }: { drive: Drive; className?: string }) {
  const fraction = usedFraction(drive);
  return (
    <div
      role="meter"
      aria-label={`${drive.label} usage`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className={cn('overflow-hidden rounded-full bg-surface', className)}
    >
      <m.div
        className={cn('h-full rounded-full', fraction > 0.9 ? 'bg-error' : drive.inHome ? 'bg-primary' : 'bg-on-surface-variant')}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(fraction * 100, 2)}%`, transition: { ...transitions.enter, duration: 0.6 } }}
      />
    </div>
  );
}
