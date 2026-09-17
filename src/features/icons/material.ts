import table from 'virtual:material-icons';

/**
 * Picks an icon the way VS Code's Material Icon Theme does: exact file name first
 * (`package.json`, `Dockerfile`), then the longest known extension (`d.ts` before `ts`),
 * then the generic file icon. Matching is case-insensitive. Light themes get the theme's
 * light variants where it has them.
 */
export function fileIconName(fileName: string, light = false): string {
  const name = fileName.toLowerCase();
  const byName = (light && table.light.fileNames[name]) || table.fileNames[name];
  if (byName) return byName;

  for (let dot = name.indexOf('.'); dot !== -1; dot = name.indexOf('.', dot + 1)) {
    const extension = name.slice(dot + 1);
    const byExtension = (light && table.light.fileExtensions[extension]) || table.fileExtensions[extension];
    if (byExtension) return byExtension;
  }
  return table.file;
}

/** The theme's icon for a well-known folder name (`src`, `node_modules`…), or `null`. */
export function folderIconByName(folderName: string, light = false): string | null {
  const name = folderName.toLowerCase();
  return (light && table.light.folderNames[name]) || table.folderNames[name] || null;
}

export const DEFAULT_FOLDER_ICON = table.folder;

/** Every folder icon, sorted, for the picker. */
export const FOLDER_ICONS: readonly string[] = table.folderIcons;

const FOLDER_ICON_SET = new Set(table.folderIcons);

export function isFolderIcon(name: string): boolean {
  return FOLDER_ICON_SET.has(name);
}

export function iconUrl(icon: string): string {
  return `/material-icons/${table.aliases[icon] ?? `${icon}.svg`}`;
}

/** `folder-node` → `node`, for labels. */
export function folderIconLabel(icon: string): string {
  return icon === DEFAULT_FOLDER_ICON ? 'folder' : icon.replace(/^folder-/, '').replaceAll('-', ' ');
}
