import { useEffect } from 'react';

import { isTextInput, shortcutFromEvent } from '@/shared/lib/keys';

import { useContextMenu } from '../context-menu/store';
import { useDialogs } from '../dialogs/store';
import { useFolderIcons } from '../icons/store';
import { useProperties } from '../properties/store';
import { useUi } from '../shell/ui';
import { allCommands, runCommand } from './registry';

/** Routes key presses to commands. Overlays and text fields get their keys first. */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const shortcut = shortcutFromEvent(event);
      const overlayOpen =
        useUi.getState().paletteOpen ||
        useUi.getState().settingsOpen ||
        useFolderIcons.getState().pickerFor !== null ||
        useProperties.getState().entries !== null ||
        useDialogs.getState().dialog !== null ||
        useContextMenu.getState().menu !== null;
      // Only the palette toggle works over overlays; typing in a field is never hijacked.
      if ((overlayOpen || isTextInput(event.target)) && shortcut !== 'Ctrl+K') return;

      const command = allCommands().find((c) => c.shortcuts?.includes(shortcut));
      if (command && runCommand(command)) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
