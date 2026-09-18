import { describe, expect, it } from 'vitest';

import { basename, crumbs, dirname, expandTilde, fileUri, isInside, mountFor, tildify } from './path';

describe('path helpers', () => {
  it('builds percent-encoded file URIs', () => {
    expect(fileUri('/home/me/My Files/a#1.txt')).toBe('file:///home/me/My%20Files/a%231.txt');
    expect(fileUri('/tmp/ข.png')).toBe('file:///tmp/%E0%B8%82.png');
  });

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
