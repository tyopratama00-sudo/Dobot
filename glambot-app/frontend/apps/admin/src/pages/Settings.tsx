import { useEffect, useState } from 'react';
import { del, get, patch } from '../api';
import { toast, usePoll } from '../ui';

type Field = [key: string, label: string, min: number, max: number, step?: number, unit?: string];

// Ranges mirror backend validation (config.go timerFields, robot_settings.go robotRanges).
const TIMERS: Field[] = [
  ['paymentSeconds', 'Halaman bayar (QRIS)', 30, 3600, 1, 'detik'],
  ['selectionSeconds', 'Review foto', 15, 3600, 1, 'detik'],
  ['frameSeconds', 'Pilih frame', 15, 3600, 1, 'detik'],
  ['pickSeconds', 'Pilih foto per slot', 15, 3600, 1, 'detik'],
  ['editingSeconds', 'Edit foto', 15, 3600, 1, 'detik'],
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
        title="Robot"
        hint="Langsung dikirim ke service dobot (tanpa restart). Turunkan kecepatan kalau gerak robot terlalu kasar."
        path="/api/admin/robot-settings"
        fields={ROBOT}
      />
    </div>
  );
}

function Section({ title, hint, path, nest, fields }: { title: string; hint: string; path: string; nest?: string; fields: Field[] }) {
  const [raw, reload, err] = usePoll<Record<string, any>>(() => get(path));
  const data: Record<string, number> | null = raw ? (nest ? raw[nest] : raw) : null;
  const [v, setV] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fill = (d: Record<string, number>) => setV(Object.fromEntries(fields.map(([k]) => [k, String(d[k] ?? '')])));
  useEffect(() => {
    if (data) fill(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const bad = fields.filter(([k, , min, max]) => {
    const n = Number(v[k]);
    return v[k] === '' || Number.isNaN(n) || n < min || n > max;
  });
  const changed = data ? fields.filter(([k]) => Number(v[k]) !== data[k]) : [];

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
    const body = Object.fromEntries(changed.map(([k]) => [k, Number(v[k])]));
    return send(() => patch(path, nest ? { [nest]: body } : body), `${title} disimpan`);
  };
  const reset = () => confirm(`Kembalikan semua ${title.toLowerCase()} ke nilai bawaan?`) && void send(() => del(path), `${title} kembali ke bawaan`);

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="mu small">{hint}</p>
      {err ? <div className="chip err">{err}</div> : null}
      <div className="form">
        {fields.map(([k, label, min, max, step, unit]) => (
          <label key={k} className="f">
            {label} {unit ? `(${unit})` : ''}
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              value={v[k] ?? ''}
              onChange={(e) => setV((o) => ({ ...o, [k]: e.target.value }))}
              aria-invalid={bad.some(([b]) => b === k)}
              style={bad.some(([b]) => b === k) ? { borderColor: 'var(--er)' } : undefined}
            />
            <span className="small">
              {min}–{max}
            </span>
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
