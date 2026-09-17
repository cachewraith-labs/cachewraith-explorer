import { invoke, type InvokeArgs } from '@tauri-apps/api/core';

import type { AppErrorPayload, ErrorKind } from './types';

/** Every failed command rejects with this, never with a raw string or object. */
export class IpcError extends Error {
  readonly kind: ErrorKind;

  constructor(kind: ErrorKind, message: string) {
    super(message);
    this.name = 'IpcError';
    this.kind = kind;
  }
}

export async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (raw) {
    throw toIpcError(raw);
  }
}

export function toIpcError(raw: unknown): IpcError {
  if (raw instanceof IpcError) return raw;
  if (isAppErrorPayload(raw)) return new IpcError(raw.kind, raw.message);
  if (typeof raw === 'string') return new IpcError('io', raw);
  if (raw instanceof Error) return new IpcError('io', raw.message);
  return new IpcError('io', 'Something went wrong');
}

function isAppErrorPayload(value: unknown): value is AppErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AppErrorPayload).kind === 'string' &&
    typeof (value as AppErrorPayload).message === 'string'
  );
}
