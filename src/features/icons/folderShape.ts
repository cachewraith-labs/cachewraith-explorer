// The Material Icon Theme's folder shape and color rules, shared by the build-time logo
// folders (`tooling/brand-logos.ts`) and the runtime symbol folders, so both look like the
// theme's own `folder-docker`, `folder-python`… icons: a colored folder in a 16×16 box with
// a large emblem ("motive") over its lower right.

/** `folder.svg` from the Material Icon Theme (MIT). */
export const FOLDER_PATH =
  'm6.922 3.768-.644-.536A1 1 0 0 0 5.638 3H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H7.562a1 1 0 0 1-.64-.232';

/** Where the emblem sits, in the 16×16 box: the same area the theme's emblems use. */
export const MOTIVE_BOX = { x: 6.5, y: 5.5, size: 9.5 } as const;

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16)) as Rgb;
}

function format(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

function mix(hex: string, toward: number, amount: number): string {
  return format(parse(hex).map((c) => c + (toward - c) * amount) as Rgb);
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((c) => c / 255) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Folder and emblem colors for a brand color, following the theme: a vivid folder with a
 * pale emblem (`#039be5` / `#b3e5fc`). Near-black and white brands get the theme's
 * blue-grey folder; light ones (yellow, cyan) a dark emblem, so the emblem always reads.
 */
export function folderColors(brandHex: string): { folder: string; motive: string } {
  const brand = brandHex.startsWith('#') ? brandHex : `#${brandHex}`;
  const light = luminance(brand);
  if (light < 0.2 || light > 0.92) return { folder: '#546e7a', motive: '#cfd8dc' };
  if (light > 0.7) return { folder: brand, motive: mix(brand, 0, 0.62) };
  return { folder: brand, motive: mix(brand, 255, 0.7) };
}
