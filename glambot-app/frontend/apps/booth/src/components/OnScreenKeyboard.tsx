import { KEYBOARD_ROWS, SHORTCUTS } from '../keyboard';

/** Keyboard di Layar off: only the email shortcut keys stay on screen, tapped like the on-screen ones. */
export function EmailShortcuts({ onKey, disabled }: { onKey: (key: string) => void; disabled?: boolean }) {
  return (
    <div className="osk osk-shortcuts" role="group" aria-label="Pintasan email" data-avoid>
      <div className="osk-row">
        {SHORTCUTS.map((k) => (
          <button key={k} type="button" className="osk-key osk-shortcut" disabled={disabled} onClick={() => onKey(k)}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

const LABEL: Record<string, string> = { shift: '⇧ Shift', space: 'Spasi', backspace: '⌫' };

/**
 * Reusable on-screen keyboard (Keyboard di Layar on). Pure view: the parent keeps the
 * text and applies each key with keyboard.ts pressKey, so any field can use it.
 */
export function OnScreenKeyboard({ shift, onKey, disabled, label = 'Keyboard' }: { shift: boolean; onKey: (key: string) => void; disabled?: boolean; label?: string }) {
  return (
    <div className="osk" role="group" aria-label={label} data-avoid>
      {KEYBOARD_ROWS.map((row, i) => (
        <div key={i} className="osk-row">
          {row.map((k) => (
            <button
              key={k}
              type="button"
              className={`osk-key ${k.length > 1 ? `osk-${k === 'shift' || k === 'space' || k === 'backspace' ? k : 'shortcut'}` : ''} ${k === 'shift' && shift ? 'on' : ''}`}
              aria-label={k === 'backspace' ? 'Hapus' : k === 'shift' ? 'Shift' : undefined}
              aria-pressed={k === 'shift' ? shift : undefined}
              disabled={disabled}
              onClick={() => onKey(k)}
            >
              {LABEL[k] ?? (shift && /^[a-z]$/.test(k) ? k.toUpperCase() : k)}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
