'use client';

import * as React from 'react';
import {
  Timer as TimerIcon,
  Loader2,
  Save,
  Package,
  ReceiptText,
  BookOpenText,
  Wand2,
  QrCode,
  PartyPopper,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Label } from '@/components/admin/ui/label';
import {
  useTimerSettings,
  useUpdateTimerSettings,
  type TimerSettings,
} from '../api/timerSettings';
import { RobotSettingsSection } from '../components/RobotSettingsSection';

// Batas aman — samakan dengan minTimerSecs/maxTimerSecs di backend (config.go).
const MIN = 5;
const MAX = 3600;

type Field = {
  key: keyof TimerSettings;
  label: string;
  desc: string;
  Icon: LucideIcon;
  accent: string;
};

// Urut sesuai alur user. Tiap halaman = satu card dengan ikon & aksen sendiri.
const FIELDS: Field[] = [
  {
    key: 'packageTimeoutSecs',
    label: 'Package Page',
    desc: 'Batas diam di halaman pilih paket sebelum kembali ke awal.',
    Icon: Package,
    accent: '#007DFC',
  },
  {
    key: 'summaryTimeoutSecs',
    label: 'Order Summary',
    desc: 'Batas diam di halaman ringkasan order sebelum kembali ke awal.',
    Icon: ReceiptText,
    accent: '#8B5CF6',
  },
  {
    key: 'instructionTimeoutSecs',
    label: 'Instruction Page',
    desc: 'Auto-lanjut dari halaman instruksi ke sesi foto.',
    Icon: BookOpenText,
    accent: '#12C964',
  },
  {
    key: 'photoEditorTimeoutSecs',
    label: 'Photo Editor',
    desc: 'Batas memilih frame & foto sebelum lanjut otomatis.',
    Icon: Wand2,
    accent: '#F59E0B',
  },
  {
    key: 'getPhotosTimeoutSecs',
    label: 'Get Photos (QR)',
    desc: 'Lama layar QR / ambil foto sebelum lanjut.',
    Icon: QrCode,
    accent: '#EC4899',
  },
  {
    key: 'doneScreenTimeoutSecs',
    label: 'Done / Thank You',
    desc: 'Lama layar terima kasih sebelum kembali ke awal.',
    Icon: PartyPopper,
    accent: '#06B6D4',
  },
];

type FormState = Record<keyof TimerSettings, string>;

const EMPTY_FORM: FormState = {
  packageTimeoutSecs: '',
  summaryTimeoutSecs: '',
  instructionTimeoutSecs: '',
  photoEditorTimeoutSecs: '',
  getPhotosTimeoutSecs: '',
  doneScreenTimeoutSecs: '',
};

export function SettingsPage() {
  const { data, isLoading } = useTimerSettings();
  const { mutate, isPending } = useUpdateTimerSettings();

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);

  // Sinkron form dari data server saat termuat / berubah.
  React.useEffect(() => {
    if (data) {
      setForm({
        packageTimeoutSecs: String(data.packageTimeoutSecs),
        summaryTimeoutSecs: String(data.summaryTimeoutSecs),
        instructionTimeoutSecs: String(data.instructionTimeoutSecs),
        photoEditorTimeoutSecs: String(data.photoEditorTimeoutSecs),
        getPhotosTimeoutSecs: String(data.getPhotosTimeoutSecs),
        doneScreenTimeoutSecs: String(data.doneScreenTimeoutSecs),
      });
    }
  }, [data]);

  const handleChange = (key: keyof TimerSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value.replace(/[^0-9]/g, '') }));
  };

  const dirty =
    !!data && FIELDS.some((f) => String(data[f.key]) !== form[f.key]);

  const handleSave = () => {
    const payload = {} as TimerSettings;
    for (const f of FIELDS) {
      const n = Number(form[f.key]);
      if (!Number.isFinite(n) || form[f.key] === '' || n < MIN || n > MAX) {
        toast.error(`${f.label}: nilai harus ${MIN}–${MAX} detik`);
        return;
      }
      payload[f.key] = n;
    }
    mutate(payload, {
      onSuccess: () => toast.success('Pengaturan timer tersimpan'),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : 'Gagal menyimpan'),
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {/* Header + Save */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[#007DFC]/10">
            <TimerIcon className="size-5 text-[#007DFC]" />
          </div>
          <div>
            <h1 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
              Settings
            </h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Atur durasi auto-advance tiap halaman user ({MIN}–{MAX} detik).
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

      {/* Grid kartu per halaman */}
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
                  htmlFor={f.key}
                  className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase"
                >
                  Durasi
                </Label>
                <div className="relative">
                  <Input
                    id={f.key}
                    inputMode="numeric"
                    value={form[f.key]}
                    onChange={(e) => handleChange(f.key, e.target.value)}
                    className="h-10 rounded-[8px] pr-14 text-sm font-medium"
                  />
                  <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-xs">
                    detik
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pemisah + tuning robot/face-tracking (diteruskan ke service dobot). */}
      <div className="border-t" />
      <RobotSettingsSection />
    </div>
  );
}
