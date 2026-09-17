export function basename(path: string): string {
  if (path === '/') return '/';
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}

export function joinPath(dir: string, name: string): string {
  return dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;
}

/** `true` when `path` is `parent` or anything below it. */
export function isInside(path: string, parent: string): boolean {
  if (parent === '/') return path.startsWith('/');
  return path === parent || path.startsWith(`${parent}/`);
}

/** `/home/me/storage` → `~/storage`. */
export function tildify(path: string, home: string): string {
  if (!home || !isInside(path, home)) return path;
  return path === home ? '~' : `~${path.slice(home.length)}`;
}

/** `~/storage` → `/home/me/storage`. Other input is returned unchanged. */
export function expandTilde(input: string, home: string): string {
  if (input === '~') return home;
  if (input.startsWith('~/')) return joinPath(home, input.slice(2));
  return input;
}

export interface Crumb {
  label: string;
  path: string;
}

/** Breadcrumb segments, starting at `~` for anything inside home. */
export function crumbs(path: string, home: string): Crumb[] {
  const insideHome = home !== '' && isInside(path, home);
  const root = insideHome ? home : '/';
  const result: Crumb[] = [{ label: insideHome ? '~' : '/', path: root }];
  const rest = path.slice(root.length).split('/').filter(Boolean);
  let current = root;
  for (const part of rest) {
    current = joinPath(current, part);
    result.push({ label: part, path: current });
  }
  return result;
}

/** The deepest mount point that contains `path`. */
export function mountFor<T extends { mountPoint: string }>(path: string, mounts: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const mount of mounts) {
    if (isInside(path, mount.mountPoint) && (!best || mount.mountPoint.length > best.mountPoint.length)) {
      best = mount;
    }
  }
  return best;
}
