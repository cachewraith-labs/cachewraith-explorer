/** The app version from package.json, injected at build time. */
declare const __APP_VERSION__: string;

declare module 'virtual:material-icons' {
  /** Built by `tooling/material-icons.ts` from VS Code's Material Icon Theme manifest. */
  const table: {
    file: string;
    folder: string;
    fileNames: Record<string, string>;
    fileExtensions: Record<string, string>;
    folderNames: Record<string, string>;
    light: {
      fileNames: Record<string, string>;
      fileExtensions: Record<string, string>;
      folderNames: Record<string, string>;
    };
    /** Every folder icon name, for the picker. */
    folderIcons: string[];
    /** Icon names whose SVG file has a different name. */
    aliases: Record<string, string>;
  };
  export default table;
}
