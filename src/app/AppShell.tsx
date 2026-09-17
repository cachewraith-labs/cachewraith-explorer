import { useGlobalShortcuts } from '../features/commands/useGlobalShortcuts';
import { ContextMenuHost } from '../features/context-menu/ContextMenuHost';
import { DefaultAppPrompt } from '../features/desktop/DefaultAppPrompt';
import { DialogHost } from '../features/dialogs/DialogHost';
import { Pane } from '../features/explorer/components/Pane';
import { useExplorer } from '../features/explorer/store';
import { FolderIconPicker } from '../features/icons/FolderIconPicker';
import { OperationsTray } from '../features/operations/OperationsTray';
import { PropertiesDialog } from '../features/properties/PropertiesDialog';
import { CommandPalette } from '../features/palette/CommandPalette';
import { SettingsDialog } from '../features/settings/SettingsDialog';
import { StatusBar } from '../features/shell/StatusBar';
import { Sidebar } from '../features/sidebar/Sidebar';
import { ToastHost } from '../features/toasts/ToastHost';
import { useBackgroundSync } from './useBackgroundSync';

export function AppShell() {
  useGlobalShortcuts();
  useBackgroundSync();
  const panes = useExplorer((s) => s.panes);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="flex min-w-0 flex-1">
          {panes.map((pane, index) => (
            <Pane key={pane.id} pane={pane} split={panes.length > 1} last={index === panes.length - 1} />
          ))}
        </main>
      </div>
      <StatusBar />

      <OperationsTray />
      <ToastHost />
      <ContextMenuHost />
      <DialogHost />
      <CommandPalette />
      <SettingsDialog />
      <DefaultAppPrompt />
      <FolderIconPicker />
      <PropertiesDialog />
    </div>
  );
}
