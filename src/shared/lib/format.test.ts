import { describe, expect, it } from 'vitest';

import { formatBytes, formatDate, formatDuration, formatPermissions } from './format';

describe('format', () => {
  it('formats bytes with binary units, like df -h', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(4.2 * 1024 ** 2)).toBe('4.2 MB');
    expect(formatBytes(469 * 1024 ** 3)).toBe('469 GB');
  });

  it('formats permissions', () => {
    expect(formatPermissions(0o644)).toBe('rw-r--r--');
    expect(formatPermissions(0o755)).toBe('rwxr-xr-x');
  });

  it('shows time for today and date otherwise', () => {
    const now = new Date(2026, 8, 17, 12, 0);
    expect(formatDate(new Date(2026, 8, 17, 9, 5).getTime(), now)).not.toContain('2026');
    expect(formatDate(new Date(2026, 8, 12).getTime(), now)).toContain('2026');
    expect(formatDate(null, now)).toBe('—');
  });

  it('formats remaining time', () => {
    expect(formatDuration(12.2)).toBe('~13s left');
    expect(formatDuration(0)).toBe('');
  });
});
