import { AppWindow } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useState } from 'react';

import { transitions } from '@/shared/lib/motion';
import { DialogButton } from '@/shared/ui/Modal';

import { useSettings } from '../settings/store';
import { useDesktop } from './store';

const DELAY_MS = 1500;

/**
 * Asks once whether this app should open folders system-wide. It never changes the system
 * default on its own; Settings → Default app can change the answer later.
 */
export function DefaultAppPrompt() {
  const dismissed = useSettings((s) => s.settings.defaultPromptDismissed);
  const status = useDesktop((s) => s.defaultApp);
  const busy = useDesktop((s) => s.busy);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const show = ready && !dismissed && status !== null && !status.isDefault;
  const dismiss = () => useSettings.getState().update({ defaultPromptDismissed: true });

  return (
    <AnimatePresence>
      {show && (
        <m.div
          role="dialog"
          aria-label="Default file manager"
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: transitions.spring }}
          exit={{ opacity: 0, y: 12, transition: transitions.exit }}
          className="fixed bottom-11 left-4 z-40 w-[340px] rounded-[18px] bg-surface-highest p-4 shadow-[0_12px_34px_rgba(0,0,0,0.45)]"
        >
          <div className="mb-3 flex gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
              <AppWindow size={20} strokeWidth={1.8} />
            </div>
            <div>
              <div className="text-[13px] font-semibold">Use Files as your file manager?</div>
              <div className="text-[11.5px] text-on-surface-variant">
                Folders opened from other apps will open here{status.currentName ? ` instead of ${status.currentName}` : ''}.
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <DialogButton onClick={dismiss}>Not now</DialogButton>
            <DialogButton variant="tonal" disabled={busy} onClick={() => void useDesktop.getState().makeDefault()}>
              Make default
            </DialogButton>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
}
