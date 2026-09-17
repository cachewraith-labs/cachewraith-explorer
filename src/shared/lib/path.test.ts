import { describe, expect, it } from 'vitest';

import { basename, crumbs, dirname, expandTilde, isInside, mountFor, tildify } from './path';

describe('path helpers', () => {
  it('splits names and parents', () => {
    expect(basename('/home/me/a.txt')).toBe('a.txt');
    expect(basename('/')).toBe('/');
    expect(dirname('/home/me')).toBe('/home');
    expect(dirname('/home')).toBe('/');
  });

  it('checks containment on segment boundaries', () => {
    expect(isInside('/home/me/storage', '/home/me')).toBe(true);
    expect(isInside('/home/meow', '/home/me')).toBe(false);
    expect(isInside('/etc', '/')).toBe(true);
  });

  it('converts between ~ and absolute paths', () => {
    expect(tildify('/home/me/storage', '/home/me')).toBe('~/storage');
    expect(tildify('/etc', '/home/me')).toBe('/etc');
    expect(expandTilde('~/storage', '/home/me')).toBe('/home/me/storage');
  });

  it('builds breadcrumbs from home or root', () => {
    expect(crumbs('/home/me/storage/iso', '/home/me').map((c) => c.label)).toEqual(['~', 'storage', 'iso']);
    expect(crumbs('/etc/pacman.d', '/home/me').map((c) => c.path)).toEqual(['/', '/etc', '/etc/pacman.d']);
  });

  it('picks the deepest mount', () => {
    const mounts = [{ mountPoint: '/' }, { mountPoint: '/home/me/storage' }];
    expect(mountFor('/home/me/storage/a', mounts)?.mountPoint).toBe('/home/me/storage');
    expect(mountFor('/home/me/Downloads', mounts)?.mountPoint).toBe('/');
  });
});
