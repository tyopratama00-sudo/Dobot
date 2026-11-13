import { useState } from 'react';
import { REGISTRATION_LIMITS } from '@photobooth/shared';
import { useBooth } from '../store';
import { backFromPay, submitRegistration } from '../flow';
import { canSubmitRegistration, isValidEmail, suggestEmail } from '../email';
import { isValidWhatsApp } from '../whatsapp';
import { voice } from '../voice';
import { pressKey } from '../keyboard';
import { OnScreenKeyboard } from '../components/OnScreenKeyboard';
import { Icon } from '../components/basics';

type Field = 'name' | 'email' | 'whatsapp';
const MAX: Record<Field, number> = { ...REGISTRATION_LIMITS, whatsapp: 24 };

/**
 * Registrasi: name + email (+ optional WhatsApp number) typed on the on-screen keyboard,
 * right after MULAI, before the package is chosen. No skip button; Kembali ends the visit (nothing paid yet).
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
  // Lanjut with a Saran Email asks first; only the three dialog buttons close it.
  const [confirming, setConfirming] = useState(false);
  const submit = (withEmail: string) => submitRegistration(values.name.trim(), withEmail, values.whatsapp.trim());
  const onNext = () => {
    if (!suggestion) return submit(email);
    setConfirming(true);
    voice('reg_typo');
  };
  const useSuggestion = () => {
    if (!suggestion) return;
    setConfirming(false);
    setValues((v) => ({ ...v, email: suggestion }));
    submit(suggestion);
  };
  const editEmail = () => {
    setConfirming(false);
    select('email');
  };
  const keepEmail = () => {
    setConfirming(false);
    submit(email);
  };

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
      <button className={`btn sm reg-back ${busy === 'cancel' ? 'wait' : ''}`} onClick={backFromPay} disabled={!!busy} data-testid="reg-back" data-avoid>
        <Icon n="back" z={30} />
        Kembali
      </button>
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
          onClick={onNext}
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
      {confirming && suggestion ? (
        <div className="qr-email-dialog" role="dialog" aria-modal="true" aria-label="Konfirmasi email" data-testid="reg-typo-dialog">
          <div className="qr-email-panel reg-typo-panel">
            <h2>Emailnya sudah benar?</h2>
            <p className="reg-typo-text">
              Kamu menulis <b>{email}</b>. Maksudmu <b>{suggestion}</b>?
            </p>
            <div className="reg-typo-actions">
              <button type="button" className="btn pr" onClick={useSuggestion} data-testid="reg-typo-use" data-avoid>
                Pakai {suggestion}
              </button>
              <button type="button" className="btn sm" onClick={editEmail} data-testid="reg-typo-edit" data-avoid>
                Ubah email
              </button>
              <button type="button" className="btn sm" onClick={keepEmail} data-testid="reg-typo-keep" data-avoid>
                Tetap pakai {email}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
