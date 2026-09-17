import { describe, expect, it } from 'vitest';

import { DEFAULT_FOLDER_ICON, FOLDER_ICONS, fileIconName, folderIconByName, iconUrl, isFolderIcon } from './material';

describe('material icon resolution', () => {
  it('prefers exact file names, case-insensitively', () => {
    expect(fileIconName('package.json')).toBe('nodejs');
    expect(fileIconName('Dockerfile')).toBe('docker');
    expect(fileIconName('.gitignore')).toBe('git');
  });

  it('uses the longest matching extension', () => {
    expect(fileIconName('main.rs')).toBe('rust');
    expect(fileIconName('App.tsx')).toBe('react_ts');
    expect(fileIconName('types.d.ts')).not.toBe(fileIconName('index.ts'));
    expect(fileIconName('backup.tar.gz')).toBe(fileIconName('backup.gz'));
  });

  it('falls back to the generic file icon', () => {
    expect(fileIconName('README')).toBeTruthy();
    expect(fileIconName('mystery.qwertyzxcv')).toBe('file');
  });

  it('knows well-known folders and offers a picker list', () => {
    expect(folderIconByName('src')).toBe('folder-src');
    expect(folderIconByName('node_modules')).toBe('folder-node');
    expect(folderIconByName('my-random-folder')).toBeNull();
    expect(FOLDER_ICONS.length).toBeGreaterThan(100);
    expect(FOLDER_ICONS.every((name) => !name.endsWith('-open'))).toBe(true);
    expect(isFolderIcon('folder-src')).toBe(true);
    expect(isFolderIcon('rust')).toBe(false);
    expect(DEFAULT_FOLDER_ICON).toBe('folder');
  });

  it('maps icons to asset URLs, following aliases', () => {
    expect(iconUrl('rust')).toBe('/material-icons/rust.svg');
    expect(iconUrl('latex')).toBe('/material-icons/latex.clone.svg');
  });
});
