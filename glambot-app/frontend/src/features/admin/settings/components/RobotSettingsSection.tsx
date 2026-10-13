'use client';

import * as React from 'react';
import {
  Bot,
  Loader2,
  Save,
  Gauge,
  Zap,
  ScanFace,
  Crosshair,
  Move3d,
  LockKeyhole,
  Timer as TimerIcon,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Label } from '@/components/admin/ui/label';
import {
  useRobotSettings,
  useUpdateRobotSettings,
  type RobotSettings,
} from '../api/robotSettings';

type Field = {
  key: keyof RobotSettings;
  label: string;
  desc: string;
  Icon: LucideIcon;
  accent: string;
  min: number;
  max: number;
  // integer = hanya bilangan bulat (speed 1–100, frame); selain itu desimal.
  integer: boolean;
  unit: string;
};

// Rentang WAJIB sama dengan robotRanges (backend) & RUNTIME_TUNABLES (dobot).
const FIELDS: Field[] = [
  {
    key: 'robotSpeedFactor',
    label: 'Speed Factor',
    desc: 'Kecepatan gerak robot keseluruhan (global).',
    Icon: Gauge,
    accent: '#007DFC',
    min: 1,
    max: 100,
    integer: true,
    unit: '1–100',
  },
  {
    key: 'robotJointSpeed',
    label: 'Joint Speed',
    desc: 'Kecepatan tiap sendi saat berpindah preset.',
    Icon: Zap,
    accent: '#8B5CF6',
    min: 1,
    max: 100,
    integer: true,
    unit: '1–100',
  },
  {
    key: 'robotJointAcc',
    label: 'Joint Acceleration',
    desc: 'Akselerasi sendi — makin tinggi makin cepat menyentak.',
    Icon: Sparkles,
    accent: '#12C964',
    min: 1,
    max: 100,
    integer: true,
    unit: '1–100',
  },
  {
    key: 'sequenceSlotSec',
    label: 'Durasi per Pose',
    desc: 'Lama satu pose: gerak + face tracking + countdown 3-2-1.',
    Icon: TimerIcon,
    accent: '#F59E0B',
    min: 5,
    max: 120,
    integer: false,
    unit: 'detik',
  },
  {
    key: 'safetyTimeout',
    label: 'Move Timeout',
    desc: 'Batas tunggu robot sampai di pose sebelum lanjut.',
    Icon: LockKeyhole,
    accent: '#EC4899',
    min: 3,
    max: 60,
    integer: false,
    unit: 'detik',
  },
  {
    key: 'postActionDelay',
    label: 'Post-move Delay',
    desc: 'Jeda setelah robot sampai sebelum tracking dimulai.',
    Icon: TimerIcon,
    accent: '#0EA5E9',
    min: 0,
    max: 5,
    integer: false,
    unit: 'detik',
  },
  {
    key: 'faceTrackGainPan',
    label: 'Tracking Gain — Pan',
    desc: 'Kekuatan koreksi horizontal. Terlalu tinggi = wajah goyang.',
    Icon: ScanFace,
    accent: '#06B6D4',
    min: 0,
    max: 40,
    integer: false,
    unit: '°/err',
  },
  {
    key: 'faceTrackGainTilt',
    label: 'Tracking Gain — Tilt',
    desc: 'Kekuatan koreksi vertikal. Terlalu tinggi = wajah goyang.',
    Icon: ScanFace,
    accent: '#14B8A6',
    min: 0,
    max: 40,
    integer: false,
    unit: '°/err',
  },
  {
    key: 'faceTrackDeadbandPct',
    label: 'Tracking Deadband',
    desc: 'Zona mati di sekitar titik bidik. Naikkan kalau gerak tersendat.',
    Icon: Crosshair,
    accent: '#A855F7',
    min: 0,
    max: 30,
    integer: false,
    unit: '% frame',
  },
  {
    key: 'faceTrackMaxDevDeg',
    label: 'Batas Simpangan j5/j6',
    desc: 'Sejauh mana tracking boleh menyimpang dari nilai preset.',
    Icon: Move3d,
    accent: '#EF4444',
    min: 0,
    max: 60,
    integer: false,
    unit: 'derajat',
  },
];

type FormState = Record<keyof RobotSettings, string>;

// Diturunkan dari FIELDS, bukan ditulis ulang — dulu daftar key ini disalin
// manual sehingga menambah/menghapus satu field berarti mengedit tiga tempat.
const EMPTY_FORM = Object.fromEntries(
  FIELDS.map((f) => [f.key, '']),
) as FormState;

export function RobotSettingsSection() {
  const { data, isLoading } = useRobotSettings();
  const { mutate, isPending } = useUpdateRobotSettings();

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  React.useEffect(() => {
    if (!data) return;
    setForm(
      Object.fromEntries(
        FIELDS.map((f) => [f.key, String(data[f.key])]),
      ) as FormState,
    );
  }, [data]);

  const handleChange = (field: Field, value: string) => {
    // Integer → hanya digit. Desimal → digit + satu titik.
    const cleaned = field.integer
      ? value.replace(/[^0-9]/g, '')
      : value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setForm((prev) => ({ ...prev, [field.key]: cleaned }));
  };

  const dirty =
    !!data && FIELDS.some((f) => String(data[f.key]) !== form[f.key]);

  const handleSave = () => {
    const payload = {} as RobotSettings;
    for (const f of FIELDS) {
      const raw = form[f.key];
      const n = Number(raw);
      if (raw === '' || !Number.isFinite(n) || n < f.min || n > f.max) {
        toast.error(`${f.label}: nilai harus ${f.min}–${f.max}`);
        return;
      }
      payload[f.key] = f.integer ? Math.round(n) : n;
    }
    mutate(payload, {
      onSuccess: () => toast.success('Pengaturan robot tersimpan'),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : 'Gagal menyimpan'),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header + Save */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#8B5CF6]/10">
            <Bot className="size-5 text-[#8B5CF6]" />
          </div>
          <div>
            <h2 className="text-foreground text-lg font-semibold tracking-tight">
              Robot & Face Tracking Tuning
            </h2>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Kecepatan gerak robot, durasi tiap pose, & sensitivitas face
              tracking. Berlaku live ke service dobot saat disimpan.
            </p>
          </div>
        </div>

        <Button
          onClick={handleSave}
          disabled={isPending || !dirty}
          className="shrink-0 gap-2 rounded-[8px]"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save Changes
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-20">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FIELDS.map((f) => (
            <div
              key={f.key}
              className="bg-card flex flex-col gap-3 rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${f.accent}1a` }}
                >
                  <f.Icon className="size-5" style={{ color: f.accent }} />
                </div>
                <h3 className="text-sm font-semibold leading-tight">
                  {f.label}
                </h3>
              </div>

              <p className="text-muted-foreground text-xs leading-relaxed">
                {f.desc}
              </p>

              <div className="mt-auto flex flex-col gap-1.5 pt-1">
                <Label
                  htmlFor={`robot-${f.key}`}
                  className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase"
                >
                  Nilai ({f.min}–{f.max})
                </Label>
                <div className="relative">
                  <Input
                    id={`robot-${f.key}`}
                    inputMode={f.integer ? 'numeric' : 'decimal'}
                    value={form[f.key]}
                    onChange={(e) => handleChange(f, e.target.value)}
                    className="h-10 rounded-[8px] pr-16 text-sm font-medium"
                  />
                  <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                    {f.unit}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
