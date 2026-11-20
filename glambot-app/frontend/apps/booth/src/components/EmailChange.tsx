import { useState } from 'react';
import { REGISTRATION_LIMITS } from '@photobooth/shared';
import { useBooth } from '../store';
import { openEmailChange, saveEmailChange } from '../flow';
import { isValidEmail, suggestEmail } from '../email';
import { hardwareKey, pressKey } from '../keyboard';
import { EmailShortcuts, OnScreenKeyboard } from './OnScreenKeyboard';
import { useHardwareKeys, useOnScreenKeyboard } from './useHardwareKeys';
import { Icon } from './basics';

const MAX_EMAIL = REGISTRATION_LIMITS.email;

/**
 * QR screen: "Foto juga dikirim ke <email>" plus Ubah email, which opens the registration
 * keyboard with the same validation and typo suggestion. Nothing shows without a Registrasi.
 */
export function EmailLine() {
  const email = useBooth((s) => s.session?.registration?.email);
  const [open, setOpen] = useState(false);
  if (!email) return null;
  return (
    <>
      <div className="qr-email" data-testid="qr-email">
        <span>
          Foto juga dikirim ke <b>{email}</b>
        </span>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            openEmailChange();
            setOpen(true);
          }}
          data-testid="qr-email-change"
          data-avoid
        >
          Ubah email
        </button>
      </div>
      {open ? <EmailChangeDialog current={email} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function EmailChangeDialog({ current, onClose }: { current: string; onClose: () => void }) {
  const busy = useBooth((s) => s.busy);
  const [value, setValue] = useState(current);
  const [shift, setShift] = useState(false);
  const email = value.trim();
  const valid = isValidEmail(email);
  const suggestion = suggestEmail(email);
  const onKey = (key: string) => {
    const next = pressKey({ value, shift }, key, MAX_EMAIL);
    setValue(next.value);
    setShift(next.shift);
  };
  const save = async () => {
    if (await saveEmailChange(email)) onClose();
  };
  const canSave = valid && email !== current && !busy;
  const osk = useOnScreenKeyboard();
  // Hardware keyboard: Enter = Simpan, Esc = Batal.
  useHardwareKeys(!osk, (e) => {
    const a = hardwareKey({ value, shift }, e, MAX_EMAIL);
    if (!a) return false;
    if (a.type === 'edit') {
      if (busy === 'email') return true;
      setValue(a.state.value);
      setShift(a.state.shift);
    } else if (a.type === 'submit') {
      if (canSave) void save();
    } else if (a.type === 'cancel') {
      if (busy !== 'email') onClose();
    }
    return true;
  });
  return (
    <div className="qr-email-dialog" role="dialog" aria-label="Ubah email" data-testid="qr-email-dialog">
      <div className="qr-email-panel">
        <h2>Ubah email</h2>
        <div className="reg-fields qr-email-fields">
          <div className="reg-field on" data-testid="qr-email-input">
            <small>Email</small>
            <span className={value ? '' : 'ph'}>
              {value || 'nama@gmail.com'}
              <i className="reg-caret" />
            </span>
          </div>
          <button type="button" className="btn sm" onClick={onClose} disabled={busy === 'email'} data-testid="qr-email-cancel" data-avoid>
            Batal
          </button>
          <button
            type="button"
            className={`btn pr reg-next ${busy === 'email' ? 'wait' : ''}`}
            disabled={!canSave}
            onClick={() => void save()}
            data-testid="qr-email-save"
            data-avoid
          >
            Simpan
            <Icon n="next" z={30} />
          </button>
        </div>
        <div className="reg-check" aria-live="polite">
          {suggestion ? (
            <button type="button" className="reg-suggest" onClick={() => setValue(suggestion)} data-testid="qr-email-suggest" data-avoid>
              Maksudmu <b>@{suggestion.split('@')[1]}</b>? <span>Ketuk untuk ganti</span>
            </button>
          ) : valid ? (
            <p className="reg-confirm">
              Foto akan dikirim ke: <b>{email}</b>
            </p>
          ) : email ? (
            <p className="reg-bad">Format email belum benar. Contoh: nama@gmail.com</p>
          ) : null}
        </div>
        {osk ? <OnScreenKeyboard shift={shift} onKey={onKey} disabled={busy === 'email'} label="Keyboard email" /> : <EmailShortcuts onKey={onKey} disabled={busy === 'email'} />}
      </div>
    </div>
  );
}
