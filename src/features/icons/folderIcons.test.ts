import { describe, expect, it } from 'vitest';

import { FOLDER_ICON_GROUPS, folderIconGroup, folderIconMatches, parseFolderIcon } from './folderIcons';

describe('custom folder icons', () => {
  it('parses theme folders, logos and symbols', () => {
    expect(parseFolderIcon('folder-src')).toMatchObject({ kind: 'theme', name: 'folder-src' });
    expect(parseFolderIcon('logo-fastapi')).toMatchObject({ kind: 'logo', label: 'FastAPI', url: '/brand-logos/fastapi.svg' });
    expect(parseFolderIcon('logo-laravel')).toMatchObject({ kind: 'logo', label: 'Laravel' });
    expect(parseFolderIcon('symbol-game')).toMatchObject({ kind: 'symbol', label: 'game' });
  });

  it('ignores names this build does not know', () => {
    for (const unknown of ['logo-nope', 'symbol-nope', 'symbol-toString', 'rust', '']) {
      expect(parseFolderIcon(unknown)).toBeNull();
    }
  });

  it('groups and searches every choice', () => {
    expect(FOLDER_ICON_GROUPS.logo.length).toBeGreaterThan(100);
    expect(FOLDER_ICON_GROUPS.symbol.length).toBeGreaterThan(50);
    expect(folderIconGroup('logo-django')).toBe('logo');
    expect(folderIconGroup('folder-docs')).toBe('theme');
    const fastapi = parseFolderIcon('logo-fastapi');
    expect(fastapi && folderIconMatches(fastapi, ['fast'])).toBe(true);
    expect(fastapi && folderIconMatches(fastapi, ['laravel'])).toBe(false);
  });
});
