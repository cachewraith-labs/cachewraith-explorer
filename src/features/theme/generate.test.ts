import { describe, expect, it } from 'vitest';

import { generatePalette, THEME_PRESETS } from './generate';

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

describe('generatePalette', () => {
  it('produces every token as #rrggbb', () => {
    const palette = generatePalette('#3f7bd9', true);
    expect(Object.keys(palette)).toContain('surface_container_high');
    for (const value of Object.values(palette)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('flips surface and text lightness between dark and light', () => {
    const dark = generatePalette('#3f7bd9', true);
    const light = generatePalette('#3f7bd9', false);
    expect(luminance(dark.background ?? '')).toBeLessThan(luminance(dark.on_surface ?? ''));
    expect(luminance(light.background ?? '')).toBeGreaterThan(luminance(light.on_surface ?? ''));
  });

  it('has valid preset seeds', () => {
    for (const preset of THEME_PRESETS) expect(preset.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
