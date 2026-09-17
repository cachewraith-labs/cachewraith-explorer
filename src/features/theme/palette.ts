import { create } from 'zustand';

import { themeApi } from '@/ipc/api';
import { onThemeChanged } from '@/ipc/events';
import type { Palette, Settings } from '@/ipc/types';

import { useSettings } from '../settings/store';
import { generatePalette } from './generate';

const TOKEN_NAME = /^[a-z0-9_]{1,48}$/;
const HEX_COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const TRANSITION_MS = 500;

/** The latest wallpaper palette, or `null` when the system has none. */
export const useWallpaperPalette = create<{ palette: Palette | null }>()(() => ({ palette: null }));

/** Whether the palette currently applied is dark; icons pick light variants otherwise. */
export const useAppliedScheme = create<{ dark: boolean }>()(() => ({ dark: true }));

/**
 * Writes palette tokens to `--m3-*` custom properties on the root element. The backend
 * validates the wallpaper file and generated palettes are always hex; checking again here
 * keeps this function safe on its own.
 */
export function applyPalette(palette: Palette, animate: boolean) {
  const root = document.documentElement;
  if (animate) root.classList.add('theme-transition');
  for (const [name, color] of Object.entries(palette)) {
    if (TOKEN_NAME.test(name) && HEX_COLOR.test(color)) {
      root.style.setProperty(`--m3-${name.replaceAll('_', '-')}`, color);
    }
  }
  const dark = isDark(palette);
  root.style.colorScheme = dark ? 'dark' : 'light';
  useAppliedScheme.setState({ dark });
  if (animate) setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS);
}

type ThemeSettings = Pick<Settings, 'themeSource' | 'themeColor' | 'themeMode'>;

const systemDarkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Whether a generated theme should be dark, resolving "system" to the desktop preference. */
export function wantsDark(mode: ThemeSettings['themeMode'], systemDark: boolean): boolean {
  return mode === 'system' ? systemDark : mode === 'dark';
}

/** Picks the palette the settings ask for; without a wallpaper palette, generates one. */
export function resolvePalette(settings: ThemeSettings, wallpaper: Palette | null, systemDark: boolean): Palette {
  if (settings.themeSource === 'wallpaper' && wallpaper) return wallpaper;
  return generatePalette(settings.themeColor, wantsDark(settings.themeMode, systemDark));
}

/**
 * Keeps the app's colors in sync with the theme settings, the wallpaper palette, and the
 * desktop's light/dark preference. Returns an unsubscribe function.
 */
export async function startThemeSync(): Promise<() => void> {
  const media = systemDarkQuery();
  const themeKey = (s: ThemeSettings) => `${s.themeSource}|${s.themeColor}|${s.themeMode}`;
  const apply = (animate: boolean) =>
    applyPalette(resolvePalette(useSettings.getState().settings, useWallpaperPalette.getState().palette, media.matches), animate);

  useWallpaperPalette.setState({ palette: await themeApi.get().catch(() => null) });
  apply(false);

  let lastKey = themeKey(useSettings.getState().settings);
  const stopSettings = useSettings.subscribe((state) => {
    const key = themeKey(state.settings);
    if (key === lastKey) return;
    lastKey = key;
    apply(true);
  });
  const stopWallpaper = await onThemeChanged((palette) => {
    useWallpaperPalette.setState({ palette });
    if (useSettings.getState().settings.themeSource === 'wallpaper') apply(true);
  });
  const onSystemChange = () => apply(true);
  media.addEventListener('change', onSystemChange);

  return () => {
    stopSettings();
    stopWallpaper();
    media.removeEventListener('change', onSystemChange);
  };
}

function isDark(palette: Palette): boolean {
  const hex = palette.background ?? palette.surface ?? '#000000';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0);
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0) < 128;
}
