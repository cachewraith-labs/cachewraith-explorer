import {
  argbFromHex,
  type DynamicColor,
  hexFromArgb,
  Hct,
  MaterialDynamicColors as C,
  SchemeTonalSpot,
} from '@material/material-color-utilities';

import type { Palette } from '@/ipc/types';

/** The tokens the stylesheet reads, named like matugen's `colors.json`. */
const TOKENS: Record<string, DynamicColor> = {
  background: C.background,
  surface_container_lowest: C.surfaceContainerLowest,
  surface_container_low: C.surfaceContainerLow,
  surface_container: C.surfaceContainer,
  surface_container_high: C.surfaceContainerHigh,
  surface_container_highest: C.surfaceContainerHighest,
  on_surface: C.onSurface,
  on_surface_variant: C.onSurfaceVariant,
  primary: C.primary,
  on_primary: C.onPrimary,
  primary_container: C.primaryContainer,
  on_primary_container: C.onPrimaryContainer,
  secondary_container: C.secondaryContainer,
  on_secondary_container: C.onSecondaryContainer,
  tertiary: C.tertiary,
  outline: C.outline,
  outline_variant: C.outlineVariant,
  error: C.error,
  on_error: C.onError,
  scrim: C.scrim,
};

/**
 * A Material You palette from one seed color. Uses the "tonal spot" scheme, the same
 * default matugen uses for the wallpaper palette, so both kinds of theme feel alike.
 */
export function generatePalette(seed: string, dark: boolean): Palette {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seed)), dark, 0);
  return Object.fromEntries(Object.entries(TOKENS).map(([name, color]) => [name, hexFromArgb(color.getArgb(scheme))]));
}

export interface ThemePreset {
  name: string;
  color: string;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { name: 'Rose', color: '#c07d73' },
  { name: 'Amber', color: '#d3902f' },
  { name: 'Forest', color: '#4f8a55' },
  { name: 'Teal', color: '#2f9c95' },
  { name: 'Ocean', color: '#3f7bd9' },
  { name: 'Lavender', color: '#8a6fd1' },
  { name: 'Crimson', color: '#c2414b' },
  { name: 'Slate', color: '#6b7b8c' },
];
