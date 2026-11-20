import { useEffect, useState } from 'react';
import { del, get, patch, post } from '../api';
import { toast, usePoll } from '../ui';

// text = true: min/max are character counts, value saved as string.
type Field = [key: string, label: string, min: number, max: number, step?: number, unit?: string, text?: boolean];

// Ranges mirror backend validation (config.go timerFields/sessionFields/displayFields, robot_settings.go robotRanges).
const SESSION: Field[] = [
  ['readySeconds', 'Hitung mundur bila audio countdown tidak ada', 1, 30, 1, 'detik'],
  ['retakeLimit', 'Batas foto ulang per sesi', 0, 20, 1, 'kali'],
  ['maxQuantity', 'Maks jumlah cetak', 1, 50, 1, 'lembar'],
];
const DISPLAY: Field[] = [
  ['brandLabel', 'Label di frame', 1, 40, undefined, undefined, true],
  ['welcomeChip', 'Teks chip layar awal', 1, 80, undefined, undefined, true],
];
const TIMERS: Field[] = [
  ['paymentSeconds', 'Halaman bayar (QRIS)', 30, 3600, 1, 'detik'],
  ['selectionSeconds', 'Review foto', 15, 3600, 1, 'detik'],
  ['frameSeconds', 'Pilih frame', 15, 3600, 1, 'detik'],
  ['pickSeconds', 'Pilih foto per slot', 15, 3600, 1, 'detik'],
  ['editingSeconds', 'Edit foto', 15, 3600, 1, 'detik'],
  ['registrationSeconds', 'Registrasi pelanggan', 15, 3600, 1, 'detik'],
  ['finalSeconds', 'Preview akhir', 15, 3600, 1, 'detik'],
  ['qrSeconds', 'QR unduh', 10, 3600, 1, 'detik'],
  ['thanksSeconds', 'Terima kasih', 3, 600, 1, 'detik'],
  ['warningSeconds', 'Peringatan sebelum habis', 3, 120, 1, 'detik'],
  ['errorResetSeconds', 'Reset layar error', 10, 3600, 1, 'detik'],
];
const ROBOT: Field[] = [
  ['robotSpeedFactor', 'Kecepatan global', 1, 100, 1, '%'],
  ['robotJointSpeed', 'Kecepatan joint', 1, 100, 1, '%'],
  ['robotJointAcc', 'Akselerasi joint', 1, 100, 1, '%'],
  ['safetyTimeout', 'Safety timeout', 3, 60, 0.5, 'detik'],
  ['postActionDelay', 'Jeda setelah gerak', 0, 5, 0.1, 'detik'],
  ['sequenceSlotSec', 'Durasi per pose', 5, 120, 1, 'detik'],
  ['faceTrackGainPan', 'Face tracking gain pan', 0, 40, 0.5],
  ['faceTrackGainTilt', 'Face tracking gain tilt', 0, 40, 0.5],
  ['faceTrackDeadbandPct', 'Face tracking deadband', 0, 30, 0.5, '%'],
  ['faceTrackMaxDevDeg', 'Face tracking deviasi maks', 0, 60, 1, '°'],
];

export function Settings() {
  return (
    <div className="grid">
      <h1>Pengaturan</h1>
      <Section
        title="Timer layar booth"
        hint="Batas waktu tiap layar sebelum booth lanjut/kembali otomatis. Berlaku saat booth kembali ke layar awal."
        path="/api/admin/settings"
        nest="timeouts"
        fields={TIMERS}
      />
      <Section
        title="Sesi foto"
        hint="Berlaku untuk sesi baru setelah booth kembali ke layar awal."
        path="/api/admin/settings"
        nest="session"
        fields={SESSION}
      />
      <Section
        title="Tampilan booth"
        hint="Angka “10 angle” di chip otomatis disesuaikan. Berlaku saat booth kembali ke layar awal."
        path="/api/admin/settings"
        nest="display"
        fields={DISPLAY}
      />
      <EmailSection />
      <RegistrationSection />
      <KeyboardSection />
      <Section
        title="Robot"
        hint="Langsung dikirim ke service dobot (tanpa restart). Turunkan kecepatan kalau gerak robot terlalu kasar."
        path="/api/admin/robot-settings"
        fields={ROBOT}
      />
    </div>
  );
}

// Same rule as backend mailer.ValidAddress: local part, '@', domain with a dot.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailSection() {
  const [status, , err] = usePoll<{ configured: boolean; sender: string }>(() => get('/api/admin/email'));
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const valid = EMAIL_RE.test(to.trim());

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    try {
      await post('/api/admin/email/test', { to: to.trim() });
      setResult({ ok: true, text: `Email uji terkirim ke ${to.trim()}. Cek kotak masuk (atau folder spam).` });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card">
      <h2>Email</h2>
      <p className="mu small">
        Akun Gmail booth untuk mengirim Email Foto. Diatur lewat SMTP_USER dan SMTP_APP_PASSWORD di .env backend (butuh 2-Step Verification untuk membuat
        App Password), lalu restart backend.
      </p>
      {err ? <div className="chip err">{err}</div> : null}
      {status ? (
        <p>
          {status.configured ? (
            <span className="chip ok">Email aktif · {status.sender}</span>
          ) : (
            <span className="chip warn">Email belum diatur</span>
          )}
        </p>
      ) : null}
      <div className="form">
        <label className="f">
          Alamat tujuan email uji
          <input type="email" value={to} placeholder="nama@contoh.com" onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <div className="btns" style={{ marginTop: 14 }}>
        <button className="btn pr" disabled={!status?.configured || !valid || sending} onClick={() => void sendTest()}>
          {sending ? 'Mengirim…' : 'Kirim email uji'}
        </button>
      </div>
      {result ? (
        <div className={`chip ${result.ok ? 'ok' : 'err'}`} style={{ marginTop: 10 }}>
          {result.text}
        </div>
      ) : null}
    </div>
  );
}

function RegistrationSection() {
  const [settings, reload, err] = usePoll<{ registrationEnabled?: boolean }>(() => get('/api/admin/settings'));
  const [email] = usePoll<{ configured: boolean }>(() => get('/api/admin/email'));
  const [saving, setSaving] = useState(false);
  const on = settings?.registrationEnabled === true;

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await patch('/api/admin/settings', { registrationEnabled: enabled });
      toast(enabled ? 'Registrasi pelanggan aktif' : 'Registrasi pelanggan dimatikan');
      await reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>Registrasi pelanggan</h2>
      <p className="mu small">
        Setelah pembayaran (atau MULAI FOTO di mode gratis), pelanggan mengisi nama dan email untuk menerima Email Foto. Hanya bisa dinyalakan kalau
        email booth sudah diatur. Berlaku saat booth kembali ke layar awal.
      </p>
      {err ? <div className="chip err">{err}</div> : null}
      {on && email && !email.configured ? <div className="chip warn">Email belum diatur: layar registrasi tidak tampil di booth.</div> : null}
      <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={on}
          disabled={!settings || saving || (!on && email?.configured === false)}
          onChange={(e) => void toggle(e.target.checked)}
        />
        Tampilkan layar registrasi di booth
      </label>
      {!on && email?.configured === false ? <p className="small">Atur email booth di bagian Email terlebih dulu.</p> : null}
    </div>
  );
}

function KeyboardSection() {
  const [settings, reload, err] = usePoll<{ onScreenKeyboard?: boolean }>(() => get('/api/admin/settings'));
  const [saving, setSaving] = useState(false);
  const on = settings?.onScreenKeyboard !== false;

  const toggle = async (enabled: boolean) => {
    setSaving(true);
    try {
      await patch('/api/admin/settings', { onScreenKeyboard: enabled });
      toast(enabled ? 'Keyboard di Layar aktif' : 'Keyboard di Layar dimatikan: booth memakai keyboard hardware');
      await reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>Keyboard di Layar</h2>
      <p className="mu small">
        Keyboard sentuh untuk registrasi, Ubah email, dan kode voucher. Matikan kalau booth memakai keyboard hardware: keyboard di layar disembunyikan
        dan pelanggan mengetik dengan keyboard fisik. Saat aktif, keyboard hardware diabaikan. Langsung berlaku di booth.
      </p>
      {err ? <div className="chip err">{err}</div> : null}
      <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" checked={on} disabled={!settings || saving} onChange={(e) => void toggle(e.target.checked)} />
        Tampilkan keyboard di layar booth
      </label>
    </div>
  );
}

function Section({ title, hint, path, nest, fields }: { title: string; hint: string; path: string; nest?: string; fields: Field[] }) {
  const [raw, reload, err] = usePoll<Record<string, any>>(() => get(path));
  const data: Record<string, number | string> | null = raw ? (nest ? raw[nest] : raw) : null;
  const [v, setV] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fill = (d: Record<string, number | string>) => setV(Object.fromEntries(fields.map(([k]) => [k, String(d[k] ?? '')])));
  useEffect(() => {
    if (data) fill(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const val = ([k, , , , , , text]: Field) => (text ? v[k]?.trim() : Number(v[k]));
  const bad = fields.filter(([k, , min, max, , , text]) => {
    if (text) return (v[k]?.trim().length ?? 0) < min || (v[k]?.trim().length ?? 0) > max;
    const n = Number(v[k]);
    return v[k] === '' || Number.isNaN(n) || n < min || n > max;
  });
  const changed = data ? fields.filter((f) => val(f) !== data[f[0]]) : [];

  const send = async (fn: () => Promise<unknown>, ok: string) => {
    setSaving(true);
    try {
      await fn();
      toast(ok);
      await reload();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };
  const save = () => {
    const body = Object.fromEntries(changed.map((f) => [f[0], val(f)]));
    return send(() => patch(path, nest ? { [nest]: body } : body), `${title} disimpan`);
  };
  const reset = () =>
    confirm(`Kembalikan semua ${title.toLowerCase()} ke nilai bawaan?`) && void send(() => del(nest ? `${path}?group=${nest}` : path), `${title} kembali ke bawaan`);

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="mu small">{hint}</p>
      {err ? <div className="chip err">{err}</div> : null}
      <div className="form">
        {fields.map(([k, label, min, max, step, unit, text]) => (
          <label key={k} className="f">
            {label} {unit ? `(${unit})` : ''}
            <input
              type={text ? 'text' : 'number'}
              min={text ? undefined : min}
              max={text ? undefined : max}
              maxLength={text ? max : undefined}
              step={step}
              value={v[k] ?? ''}
              onChange={(e) => setV((o) => ({ ...o, [k]: e.target.value }))}
              aria-invalid={bad.some(([b]) => b === k)}
              style={bad.some(([b]) => b === k) ? { borderColor: 'var(--er)' } : undefined}
            />
            <span className="small">{text ? `maks ${max} karakter` : `${min}–${max}`}</span>
          </label>
        ))}
      </div>
      <div className="btns" style={{ marginTop: 14 }}>
        <button className="btn pr" disabled={!data || saving || bad.length > 0 || changed.length === 0} onClick={() => void save()}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
        <button className="btn" disabled={!data || changed.length === 0} onClick={() => data && fill(data)}>
          Batalkan perubahan
        </button>
        <button className="btn" disabled={!data || saving} onClick={reset}>
          Kembalikan bawaan
        </button>
      </div>
    </div>
  );
}
