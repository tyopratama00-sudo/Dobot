import { useEffect, useRef, useState } from 'react';
import { REGISTRATION_LIMITS } from '@photobooth/shared';
import { useBooth } from '../store';
import { submitRegistration } from '../flow';
import { canSubmitRegistration, isValidEmail, suggestEmail } from '../email';
import { isValidWhatsApp } from '../whatsapp';
import { voice } from '../voice';
import { pressKey } from '../keyboard';
import { OnScreenKeyboard } from '../components/OnScreenKeyboard';
import { Icon } from '../components/basics';

type Field = 'name' | 'email' | 'whatsapp';
const MAX: Record<Field, number> = { ...REGISTRATION_LIMITS, whatsapp: 24 };
/** The typo voice waits for a pause in typing, so "gmail.c" on the way to "gmail.com" stays quiet. */
const TYPO_VOICE_MS = 1500;

/**
 * Registrasi: name + email (+ optional WhatsApp number) typed on the on-screen keyboard,
 * between the paid ticket and frame selection. No skip button.
 */
export function Registration() {
  const busy = useBooth((s) => s.busy);
  const [values, setValues] = useState<Record<Field, string>>({ name: '', email: '', whatsapp: '' });
  const [field, setField] = useState<Field>('name');
  // Names start with a capital letter; email stays lowercase.
  const [shift, setShift] = useState(true);
  const ready = canSubmitRegistration(values.name, values.email, values.whatsapp);
  const email = values.email.trim();
  const validEmail = isValidEmail(email);
  const badWhatsApp = !isValidWhatsApp(values.whatsapp);
  const suggestion = suggestEmail(email);
  // Robot mentions a likely typo once per visit, after the pelanggan stops typing.
  const typoSpoken = useRef(false);
  useEffect(() => {
    if (!suggestion || typoSpoken.current) return;
    const t = setTimeout(() => {
      typoSpoken.current = true;
      voice('reg_typo');
    }, TYPO_VOICE_MS);
    return () => clearTimeout(t);
  }, [suggestion]);

  const select = (f: Field) => {
    setField(f);
    setShift(f === 'name' && values.name === '');
  };
  const onKey = (key: string) => {
    const next = pressKey({ value: values[field], shift }, key, MAX[field]);
    setValues((v) => ({ ...v, [field]: next.value }));
    // After a space in the name, the next word starts uppercase again.
    setShift(field === 'name' && key === 'space' ? true : next.shift);
  };

  const box = (f: Field, label: string, placeholder: string) => (
    <button type="button" className={`reg-field ${field === f ? 'on' : ''}`} onClick={() => select(f)} aria-pressed={field === f} data-testid={`reg-${f}`} data-avoid>
      <small>{label}</small>
      <span className={values[f] ? '' : 'ph'}>
        {values[f] || placeholder}
        {field === f ? <i className="reg-caret" /> : null}
      </span>
    </button>
  );

  return (
    <div className="scr en booth-theme reg-screen">
      <div className="reg-head">
        <h1>Kirim foto ke email kamu</h1>
        <p className="p">Isi nama dan email, lalu tekan Lanjut.</p>
      </div>
      <div className="reg-fields">
        {box('name', 'Nama', 'Nama kamu')}
        {box('email', 'Email', 'nama@gmail.com')}
        {box('whatsapp', 'No. WhatsApp (opsional)', '0812 3456 7890')}
        <button
          className={`btn pr reg-next ${busy === 'register' ? 'wait' : ''}`}
          disabled={!ready || !!busy}
          onClick={() => submitRegistration(values.name.trim(), values.email.trim(), values.whatsapp.trim())}
          data-testid="reg-next"
          data-avoid
        >
          Lanjut
          <Icon n="next" z={30} />
        </button>
      </div>
      <div className="reg-info">
        <div className="reg-check" aria-live="polite" data-testid="reg-check">
          {suggestion ? (
            <button
              type="button"
              className="reg-suggest"
              onClick={() => setValues((v) => ({ ...v, email: suggestion }))}
              data-testid="reg-suggest"
              data-avoid
            >
              Maksudmu <b>@{suggestion.split('@')[1]}</b>? <span>Ketuk untuk ganti</span>
            </button>
          ) : badWhatsApp ? (
            <p className="reg-bad" data-testid="reg-bad-whatsapp">
              Nomor WhatsApp belum benar. Contoh: 0812 3456 7890, atau kosongkan saja
            </p>
          ) : validEmail ? (
            <p className="reg-confirm" data-testid="reg-confirm">
              Foto akan dikirim ke: <b>{email}</b>
            </p>
          ) : email ? (
            <p className="reg-bad" data-testid="reg-bad">
              Format email belum benar. Contoh: nama@gmail.com
            </p>
          ) : null}
        </div>
        <p className="reg-why">
          Email dan WhatsApp hanya dipakai untuk mengirim foto sesi ini (WhatsApp dikirim oleh staf bila perlu), sebagai cadangan kalau kamu lupa scan QR, dan disimpan sebagai catatan kunjungan. Dengan menekan Lanjut, kamu setuju.
        </p>
      </div>
      <OnScreenKeyboard shift={shift} onKey={onKey} disabled={busy === 'register'} label={field === 'name' ? 'Keyboard nama' : field === 'email' ? 'Keyboard email' : 'Keyboard nomor WhatsApp'} />
    </div>
  );
}
