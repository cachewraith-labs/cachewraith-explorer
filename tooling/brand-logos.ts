// Vite plugin: folder icons for frameworks, languages and apps the Material Icon Theme has
// no folder for (FastAPI, Laravel, Godot…), drawn in the theme's own style: the theme's
// folder in the brand color, with the Simple Icons logo (CC0, `simple-icons` on npm) as its
// emblem.
//
// - `virtual:brand-logos` lists the curated logos: slug and title.
// - Each folder SVG is served (dev) or emitted (build) at `/brand-logos/<slug>.svg`. Only
//   the curated slugs ship, not all ~3,400 icons.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin } from 'vite';

import { FOLDER_PATH, folderColors, MOTIVE_BOX } from '../src/features/icons/folderShape';

const VIRTUAL_ID = 'virtual:brand-logos';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
export const LOGO_URL_PREFIX = '/brand-logos/';

/** Grouped only to keep the list reviewable; the picker searches them all. */
// prettier-ignore
const SLUGS = [
  // Web and backend frameworks
  'fastapi', 'flask', 'django', 'laravel', 'symfony', 'codeigniter', 'cakephp', 'spring', 'springboot',
  'rubyonrails', 'express', 'nestjs', 'nextdotjs', 'nuxt', 'react', 'vuedotjs', 'angular', 'svelte', 'astro',
  'remix', 'gatsby', 'solid', 'qwik', 'phoenixframework', 'wordpress', 'drupal', 'shopify', 'strapi',
  'bootstrap', 'tailwindcss', 'sass', 'jquery', 'redux', 'zod', 'reactquery',
  // Apps and mobile
  'tauri', 'electron', 'flutter', 'ionic', 'capacitor', 'expo', 'android', 'androidstudio', 'apple', 'xcode',
  // Languages and runtimes
  'python', 'rust', 'go', 'php', 'ruby', 'openjdk', 'kotlin', 'swift', 'dart', 'dotnet', 'cplusplus', 'c',
  'typescript', 'javascript', 'html5', 'css', 'nodedotjs', 'deno', 'bun', 'elixir', 'haskell', 'scala',
  'clojure', 'lua', 'zig', 'nim', 'julia', 'r', 'perl', 'gnubash',
  // Data, AI and cloud
  'postgresql', 'mysql', 'mariadb', 'mongodb', 'redis', 'sqlite', 'prisma', 'graphql', 'supabase', 'firebase',
  'googlecloud', 'vercel', 'netlify', 'cloudflare', 'docker', 'kubernetes', 'nginx', 'apache', 'ansible',
  'terraform', 'jenkins', 'githubactions', 'gradle', 'jupyter', 'pytorch', 'tensorflow', 'numpy', 'pandas',
  'scikitlearn', 'opencv', 'huggingface', 'ollama', 'anthropic', 'claude',
  // Tools
  'git', 'github', 'gitlab', 'npm', 'pnpm', 'yarn', 'vite', 'webpack', 'esbuild', 'babel', 'eslint', 'prettier',
  'vitest', 'jest', 'cypress', 'storybook', 'vim', 'neovim', 'jetbrains', 'intellijidea', 'pycharm', 'phpstorm',
  'figma', 'gimp', 'inkscape', 'blender', 'obsidian', 'notion', 'markdown', 'latex',
  // Games and media
  'godotengine', 'unity', 'unrealengine', 'steam', 'steamdeck', 'epicgames', 'playstation', 'itchdotio',
  'roblox', 'discord', 'telegram', 'youtube', 'spotify', 'twitch',
  // Systems and hardware
  'linux', 'archlinux', 'ubuntu', 'debian', 'fedora', 'raspberrypi', 'arduino', 'homeassistant',
];

interface SimpleIcon {
  title: string;
  slug: string;
  hex: string;
}

/** A Material-style folder with the logo's single 24×24 path as its emblem. */
function folderSvg(logoSvg: string, hex: string): string {
  const d = /<path d="([^"]+)"/.exec(logoSvg)?.[1];
  if (!d) throw new Error('brand-logos: expected a single-path Simple Icons SVG');
  const { folder, motive } = folderColors(hex);
  const { x, y, size } = MOTIVE_BOX;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">` +
    `<path fill="${folder}" d="${FOLDER_PATH}"/>` +
    `<path fill="${motive}" transform="translate(${x} ${y}) scale(${size / 24})" d="${d}"/>` +
    `</svg>`
  );
}

export function brandLogos(): Plugin {
  // The package exports no `package.json`; its main entry sits at the package root.
  const packageDir = path.dirname(createRequire(import.meta.url).resolve('simple-icons'));
  const data = JSON.parse(readFileSync(path.join(packageDir, 'data/simple-icons.json'), 'utf8')) as SimpleIcon[];
  const bySlug = new Map(data.map((icon) => [icon.slug, icon]));

  const logos = SLUGS.map((slug) => {
    const icon = bySlug.get(slug);
    if (!icon) throw new Error(`brand-logos: simple-icons has no "${slug}"`);
    return { slug, title: icon.title, hex: icon.hex };
  });
  const svgs = new Map(
    logos.map(({ slug, hex }) => {
      const svg = readFileSync(path.join(packageDir, 'icons', `${slug}.svg`), 'utf8');
      return [`${slug}.svg`, folderSvg(svg, hex)];
    }),
  );
  const moduleSource = `export default ${JSON.stringify(logos.map(({ slug, title }) => ({ slug, title })))};`;

  return {
    name: 'brand-logos',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : undefined),
    load: (id) => (id === RESOLVED_ID ? moduleSource : undefined),

    configureServer(server) {
      server.middlewares.use(LOGO_URL_PREFIX, (req, res, next) => {
        // Only the curated files; the lookup doubles as an allowlist.
        const svg = svgs.get((req.url ?? '').replace(/^\//, '').split('?')[0] ?? '');
        if (svg === undefined) return next();
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'max-age=3600');
        res.end(svg);
      });
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: `${LOGO_URL_PREFIX.slice(1)}LICENSE.md`,
        source: readFileSync(path.join(packageDir, 'LICENSE.md')),
      });
      for (const [file, svg] of svgs) {
        this.emitFile({ type: 'asset', fileName: `${LOGO_URL_PREFIX.slice(1)}${file}`, source: svg });
      }
    },
  };
}
