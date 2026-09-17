/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { materialIcons } from './tooling/material-icons';

// Tauri expects a fixed dev port and must not have its Rust sources watched by Vite.
export default defineConfig({
  plugins: [react(), tailwindcss(), materialIcons()],
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(
      (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version,
    ),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  test: {
    // Ships extensionless ESM imports that only a bundler resolves.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
  },
  build: {
    target: 'es2022',
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
});
