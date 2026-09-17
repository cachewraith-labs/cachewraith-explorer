import { type FormEvent, useEffect, useRef, useState } from 'react';

import { DialogButton, Modal } from '@/shared/ui/Modal';

import { selectActiveTabId, useExplorer } from '../explorer/store';
import { fileActions } from '../operations/actions';
import { type DialogRequest, useDialogs } from './store';

export function DialogHost() {
  const current = useDialogs((s) => s.dialog);
  const close = useDialogs((s) => s.close);
  // Keep rendering the last dialog while its exit animation plays.
  const last = useRef(current);
  if (current) last.current = current;
  const dialog = current ?? last.current;

  return (
    <Modal open={current !== null} onClose={close} title={dialog ? titleOf(dialog) : ''}>
      {dialog?.type === 'confirm' && <ConfirmBody dialog={dialog} onClose={close} />}
      {dialog?.type === 'rename' && (
        <NameForm
          key={dialog.entry.path}
          initial={dialog.entry.name}
          submitLabel="Rename"
          selectStem={dialog.entry.kind !== 'dir'}
          onClose={close}
          onSubmit={(name) => fileActions.rename(dialog.entry, name, activeTab())}
        />
      )}
      {dialog?.type === 'newFolder' && (
        <NameForm
          key={dialog.parent}
          initial="New folder"
          submitLabel="Create"
          selectStem={false}
          onClose={close}
          onSubmit={(name) => fileActions.createFolder(dialog.parent, name, activeTab())}
        />
      )}
    </Modal>
  );
}

const activeTab = () => selectActiveTabId(useExplorer.getState());

function titleOf(dialog: DialogRequest): string {
  switch (dialog.type) {
    case 'confirm':
      return dialog.title;
    case 'rename':
      return 'Rename';
    case 'newFolder':
      return 'New folder';
  }
}

function ConfirmBody({ dialog, onClose }: { dialog: Extract<DialogRequest, { type: 'confirm' }>; onClose: () => void }) {
  return (
    <>
      <p className="mb-3.5 text-[12px] text-on-surface-variant">{dialog.message}</p>
      <div className="flex justify-end gap-2">
        <DialogButton onClick={onClose}>Cancel</DialogButton>
        <DialogButton
          autoFocus
          variant={dialog.danger ? 'danger' : 'tonal'}
          onClick={() => {
            onClose();
            dialog.onConfirm();
          }}
        >
          {dialog.confirmLabel}
        </DialogButton>
      </div>
    </>
  );
}

interface NameFormProps {
  initial: string;
  submitLabel: string;
  /** Select the name without its extension, like every file manager does. */
  selectStem: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<boolean>;
}

function NameForm({ initial, submitLabel, selectStem, onClose, onSubmit }: NameFormProps) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const invalid = trimmed === '' || trimmed === '.' || trimmed === '..' || name.includes('/');

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const dot = initial.lastIndexOf('.');
    input.setSelectionRange(0, selectStem && dot > 0 ? dot : initial.length);
  }, [initial, selectStem]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (invalid || busy) return;
    if (trimmed === initial) return onClose();
    setBusy(true);
    const ok = await onSubmit(trimmed);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <input
        ref={inputRef}
        value={name}
        spellCheck={false}
        aria-label="Name"
        aria-invalid={invalid}
        maxLength={255}
        onChange={(event) => setName(event.target.value)}
        className="mb-1 w-full rounded-[10px] border-[1.5px] border-primary bg-surface px-2.5 py-2 font-mono text-[12px] outline-none aria-invalid:border-error"
      />
      <div className="mb-2.5 h-4 text-[11px] text-error">{name.includes('/') ? 'Names cannot contain "/"' : ''}</div>
      <div className="flex justify-end gap-2">
        <DialogButton onClick={onClose}>Cancel</DialogButton>
        <DialogButton type="submit" variant="tonal" disabled={invalid || busy}>
          {submitLabel}
        </DialogButton>
      </div>
    </form>
  );
}
