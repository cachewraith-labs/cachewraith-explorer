// Vite plugin: exposes VS Code's Material Icon Theme (MIT, `material-icon-theme` on npm) to
// the app without generating files into the repo.
//
// - `virtual:material-icons` is a compact lookup table (file names, extensions, folder names
//   → icon name) built from the theme's manifest.
// - The SVGs are served from node_modules in dev and emitted as static assets in builds, at
//   `/material-icons/<file>.svg`, so each one loads (and caches) only when shown.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin } from 'vite';

const VIRTUAL_ID = 'virtual:material-icons';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
export const ICON_URL_PREFIX = '/material-icons/';
const SVG_FILE = /^[a-z0-9._-]+\.svg$/;

interface Manifest {
  iconDefinitions: Record<string, { iconPath: string }>;
  file: string;
  folder: string;
  fileNames: Record<string, string>;
  fileExtensions: Record<string, string>;
  folderNames: Record<string, string>;
  light: { fileNames?: Record<string, string>; fileExtensions?: Record<string, string>; folderNames?: Record<string, string> };
}

export function materialIcons(): Plugin {
  const packageDir = path.dirname(createRequire(import.meta.url).resolve('material-icon-theme/package.json'));
  const iconsDir = path.join(packageDir, 'icons');
  const manifest = JSON.parse(readFileSync(path.join(packageDir, 'dist/material-icons.json'), 'utf8')) as Manifest;

  // Icon name → SVG file. Most match (`rust` → `rust.svg`); some reuse another file.
  const files = new Map(Object.entries(manifest.iconDefinitions).map(([name, def]) => [name, path.basename(def.iconPath)]));
  const aliases = Object.fromEntries([...files].filter(([name, file]) => file !== `${name}.svg`));
  const folderIcons = [...files.keys()]
    .filter((name) => name.startsWith('folder') && !name.endsWith('-open') && !name.startsWith('folder-root'))
    .sort();

  const table = {
    file: manifest.file,
    folder: manifest.folder,
    fileNames: manifest.fileNames,
    fileExtensions: manifest.fileExtensions,
    folderNames: manifest.folderNames,
    light: {
      fileNames: manifest.light.fileNames ?? {},
      fileExtensions: manifest.light.fileExtensions ?? {},
      folderNames: manifest.light.folderNames ?? {},
    },
    folderIcons,
    aliases,
  };
  const moduleSource = `export default ${JSON.stringify(table)};`;

  return {
    name: 'material-icons',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
    load: (id) => (id === RESOLVED_ID ? moduleSource : undefined),

    configureServer(server) {
      server.middlewares.use(ICON_URL_PREFIX, (req, res, next) => {
        const file = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0] ?? '');
        // Only plain icon file names; nothing that could walk out of the icons folder.
        if (!SVG_FILE.test(file)) return next();
        try {
          const svg = readFileSync(path.join(iconsDir, file));
          res.setHeader('Content-Type', 'image/svg+xml');
          res.setHeader('Cache-Control', 'max-age=3600');
          res.end(svg);
        } catch {
          next();
        }
      });
    },

    generateBundle() {
      // MIT requires the copyright notice to travel with the icons.
      this.emitFile({
        type: 'asset',
        fileName: `${ICON_URL_PREFIX.slice(1)}LICENSE`,
        source: readFileSync(path.join(packageDir, 'LICENSE')),
      });
      for (const file of new Set(files.values())) {
        this.emitFile({
          type: 'asset',
          fileName: `${ICON_URL_PREFIX.slice(1)}${file}`,
          source: readFileSync(path.join(iconsDir, file)),
        });
      }
    },
  };
}
