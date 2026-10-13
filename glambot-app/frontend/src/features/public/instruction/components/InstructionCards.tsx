import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import GlassCard from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import type { InstructionStep, InstructionHighlight } from '../data/steps';
import {
  Hand,
  Ruler,
  LayoutGrid,
  Sparkles,
  ShieldCheck,
  CircleAlert,
  ShieldAlert,
  Ban,
  WifiOff,
  CupSoda,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Arm 3D memakai WebGL (react-three-fiber) — harus client-only, tidak boleh
// ikut di-render saat SSR. Dimuat lazy supaya bundle instruction page tidak
// membawa three.js untuk step 1 & 2 yang tidak memakainya.
const RobotArm3D = dynamic(() => import('./RobotArm3D'), { ssr: false });

// Pemetaan kunci ikon (dari data steps) ke komponen lucide.
const RULE_ICONS: Record<string, LucideIcon> = {
  ruler: Ruler,
  zone: LayoutGrid,
  hand: Hand,
  fun: Sparkles,
  close: ShieldAlert,
  touch: Ban,
  sensor: WifiOff,
  food: CupSoda,
};

/**
 * Kelas "terselect & maju ke depan": bagian yang sedang disebut narasi diberi
 * cincin + bayangan lalu di-scale sedikit, sisanya diredupkan. Dipakai lewat
 * `spotlight()` di bawah supaya konsisten di ketiga kartu.
 */
const SPOTLIGHT_ON =
  'scale-[1.05] ring-4 ring-white/70 shadow-[0px_20px_55px_rgba(17,45,78,0.65)] z-10';
// Versi untuk kartu besar (step pose sequence): scale-nya dikecilkan supaya kartu
// selebar ±560px tidak menyenggol tepi layar saat maju ke depan.
const SPOTLIGHT_ON_LARGE =
  'scale-[1.02] ring-4 ring-white/70 shadow-[0px_20px_55px_rgba(17,45,78,0.65)] z-10';
const SPOTLIGHT_OFF = 'opacity-45';

/**
 * `active` null = tidak ada narasi menyorot apa pun → semua tampil normal
 * (tidak ada yang diredupkan).
 */
function spotlight(
  active: boolean | null,
  onClass: string = SPOTLIGHT_ON,
): string {
  if (active === null) return '';
  return active ? onClass : SPOTLIGHT_OFF;
}

interface CardProps {
  step: InstructionStep;
  onNext: () => void;
  buttonLabel: string;
  // Tombol baru boleh diklik/terlihat saat narasi suara step ini selesai.
  // Default true supaya kartu tanpa gating audio tetap menampilkan tombol.
  buttonReady?: boolean;
  // Bagian yang sedang disebut narasi (lihat STEP_CUES di InstructionPage).
  highlight?: InstructionHighlight | null;
}

interface GetReadyCardProps extends CardProps {
  // Durasi sesi (menit) dari paket yang dipilih user. Kalau undefined
  // (mis. session belum termuat) jatuh ke step.sessionDuration sebagai default.
  sessionDurationMinutes?: number;
}

/** Circular ring showing the session duration (mm:00), busur ter-animasi. */
function DurationRing({ minutes }: { minutes: number }) {
  const size = 260;
  const stroke = 13;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  // Busur "naik-turun" terus-menerus: offset dianimasikan bolak-balik antara
  // isi rendah (~55%) dan tinggi (~92%) lewat keyframe CSS (bukan sekali di awal).
  const offHigh = c * (1 - 0.92); // paling terisi
  const offLow = c * (1 - 0.55); // paling kosong
  const keyframes = `@keyframes durationRingPulse {
    0%, 100% { stroke-dashoffset: ${offLow}px; }
    50% { stroke-dashoffset: ${offHigh}px; }
  }`;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <style>{keyframes}</style>
      <svg width={size} height={size} className="-rotate-[125deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(249,247,247,0.12)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#DBE2EF"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offLow}
          style={{ animation: 'durationRingPulse 3s ease-in-out infinite' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[62px] font-bold leading-none text-white tabular-nums">
          {minutes}:00
        </span>
        <span className="mt-3 text-[16px] font-semibold uppercase tracking-[0.35em] text-white/45">
          Duration
        </span>
      </div>
    </div>
  );
}

/** "Get Ready" step — numbered activity list + session duration ring. */
export function GetReadyCard({
  step,
  onNext,
  buttonLabel,
  buttonReady = true,
  sessionDurationMinutes,
  highlight,
}: GetReadyCardProps) {
  const minutes = sessionDurationMinutes ?? step.sessionDuration ?? 5;
  // Narasi "waktuSesi" menyorot ring, "infoSingkat" menyorot daftar aktivitas.
  // Selain kedua cue itu (null) tidak ada yang disorot maupun diredupkan.
  const spot =
    highlight === 'duration' || highlight === 'activities' ? highlight : null;
  return (
    <GlassCard maxWidth="max-w-[960px]" className="px-14 py-12">
      <div className="flex flex-col items-center">
        <h2 className="mb-14 text-center text-[46px] font-bold leading-tight text-white">
          {step.heading}
        </h2>

        {/* Grup list + ring di-center sebagai satu blok (justify-center) supaya
            margin kiri & kanan simetris; gap-14 mengatur jarak list↔ring. */}
        <div className="flex w-full flex-row items-center justify-center gap-14">
          {/* Kiri — daftar aktivitas bernomor. Saat "infoSingkat" berbunyi
              ketiganya menyala berurutan (delay bertingkat), mengikuti narasi
              yang menyebut tiga info itu satu per satu. */}
          <div className="flex w-[440px] shrink-0 flex-col gap-4">
            {step.activities?.map((activity, i) => (
              <GlassCard
                key={activity.label}
                variant="secondary"
                className={cn(
                  'flex w-full items-center gap-5 rounded-2xl px-6 py-5 transition-all duration-500',
                  spotlight(spot === null ? null : spot === 'activities'),
                )}
                style={{
                  transitionDelay:
                    spot === 'activities' ? `${i * 700}ms` : '0ms',
                }}
              >
                <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-[#F9F7F7]/15 text-[24px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-[28px] font-bold leading-8 text-white">
                  {activity.label}
                </span>
              </GlassCard>
            ))}
          </div>

          {/* Kanan — ring durasi sesi, maju ke depan saat "waktuSesi" berbunyi */}
          <div
            className={cn(
              'rounded-full transition-all duration-500',
              spotlight(spot === null ? null : spot === 'duration'),
            )}
          >
            <DurationRing minutes={minutes} />
          </div>
        </div>

        <Button
          variant="outline"
          onClick={onNext}
          className={cn(
            'mt-14 transition-opacity duration-300',
            !buttonReady && 'opacity-0 pointer-events-none',
          )}
        >
          {buttonLabel}
        </Button>
      </div>
    </GlassCard>
  );
}

/** Satu baris aturan sebagai kartu: kotak ikon + teks. */
function RuleCard({
  text,
  icon,
  tone,
}: {
  text: string;
  icon?: string;
  tone: 'do' | 'dont';
}) {
  const Icon = icon ? RULE_ICONS[icon] : null;
  const isDo = tone === 'do';
  return (
    <GlassCard
      variant="secondary"
      className={cn(
        'flex w-full items-center gap-4 rounded-2xl px-5 py-3.5 border',
        isDo
          ? 'bg-[#3F72AF]/20 border-[#3F72AF]/30'
          : 'bg-[#D62F2F]/15 border-[#D62F2F]/30',
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
          isDo ? 'bg-[#3F72AF]/35' : 'bg-[#D62F2F]/25',
        )}
      >
        {Icon && (
          <Icon
            size={24}
            className={isDo ? 'text-blue-100' : 'text-red-400'}
          />
        )}
      </span>
      <span className="text-[22px] font-semibold leading-7 text-white">
        {text}
      </span>
    </GlassCard>
  );
}

/** "Safety & Rules" step — Do / Don't columns. */
export function SafetyRulesCard({
  step,
  onNext,
  buttonLabel,
  buttonReady = true,
  highlight,
}: CardProps) {
  // Narasi "deteksiSatu" menyorot baris guideline ("only one person's hand"),
  // kolom Do/Don't diredupkan selama itu.
  const guidelineActive = highlight === 'guideline';
  return (
    <GlassCard maxWidth="max-w-[1120px]" className="py-8 px-10 overflow-hidden">
      <div className="flex flex-col items-center">
        <h2 className="text-[46px] font-bold text-white leading-tight mb-6">
          {step.heading}
        </h2>

        <div
          className={cn(
            'grid grid-cols-2 gap-8 lg:gap-10 items-start w-full transition-all duration-500',
            guidelineActive && SPOTLIGHT_OFF,
          )}
        >
          {/* Do column */}
          <div className="flex flex-col">
            <div className="flex items-center justify-center gap-3 mb-4">
              <ShieldCheck size={28} className="text-blue-100 shrink-0" />
              <span className="text-[26px] font-bold leading-7 text-white">
                Do
              </span>
            </div>
            <div className="flex flex-col gap-3.5">
              {step.doRules?.map((rule, idx) => (
                <RuleCard
                  key={`do-${idx}`}
                  text={rule.text}
                  icon={rule.icon}
                  tone="do"
                />
              ))}
            </div>
          </div>

          {/* Don't column */}
          <div className="flex flex-col">
            <div className="flex items-center justify-center gap-3 mb-4">
              <CircleAlert size={28} className="text-red-400 shrink-0" />
              <span className="text-[26px] font-bold leading-7 text-red-400">
                Don&apos;t
              </span>
            </div>
            <div className="flex flex-col gap-3.5">
              {step.dontRules?.map((rule, idx) => (
                <RuleCard
                  key={`dont-${idx}`}
                  text={rule.text}
                  icon={rule.icon}
                  tone="dont"
                />
              ))}
            </div>
          </div>
        </div>

        {step.guideline && (
          <GlassCard
            variant="secondary"
            maxWidth="max-w-full"
            className={cn(
              'mt-6 w-full flex items-center justify-center gap-5 rounded-2xl px-7 py-5 transition-all duration-500',
              guidelineActive && SPOTLIGHT_ON,
            )}
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F9F7F7]/12">
              <Hand size={30} className="text-blue-100" />
            </span>
            <p className="text-white text-[26px] font-medium leading-8 whitespace-nowrap">
              {step.guideline}
            </p>
          </GlassCard>
        )}

        <Button
          variant="outline"
          onClick={onNext}
          className={cn(
            'mt-6 transition-opacity duration-300',
            !buttonReady && 'opacity-0 pointer-events-none',
          )}
        >
          {buttonLabel}
        </Button>
      </div>
    </GlassCard>
  );
}

/** "Automatic Poses" step. */
export function PoseSequenceCard({
  step,
  onNext,
  buttonLabel,
  highlight,
}: CardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  // "pilGesture" menyorot kartu kanan (daftar pose), "pilAcam" kartu kiri
  // (panggung robot + kamera). Di luar kedua cue itu keduanya tampil normal.
  const spot =
    highlight === 'poses' || highlight === 'camera' ? highlight : null;
  const [hasCompletedFirstLoop, setHasCompletedFirstLoop] = useState(false);

  useEffect(() => {
    if (!step.poses || step.poses.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        const nextIndex = (prev + 1) % step.poses!.length;
        if (nextIndex === 0 && prev === step.poses!.length - 1) {
          setHasCompletedFirstLoop(true);
        }
        return nextIndex;
      });
    }, 1400);
    return () => clearInterval(interval);
  }, [step.poses]);

  // Pose robot per preset ada di ../lib/armKinematics.ts (PRESET_POSES).

  return (
    // Lebar dikunci ke lebar container publik (max-w-360) dengan padding
    // simetris, jadi margin kiri & kanan kartu selalu sama.
    <div className="flex w-full max-w-360 flex-row items-stretch gap-7 px-10">
      {/* Kiri — panggung 3D robot + kamera */}
      <GlassCard
        maxWidth="max-w-none"
        className={cn(
          'flex w-[560px] shrink-0 flex-col p-9 transition-all duration-500',
          spotlight(spot === null ? null : spot === 'camera', SPOTLIGHT_ON_LARGE),
        )}
      >
        <h3 className="text-[36px] font-bold leading-[1.15] text-white">
          Camera Movement
        </h3>

        {/* Robot arm 3D dengan DSLR terpasang di flange-nya. Kamera ikut
            bergerak karena memang menempel di ujung arm — bukan dua
            animasi terpisah.

            Panggung sengaja diperbesar (kartu 500→560px, min-h 280→360px) untuk
            membesarkan arm TANPA menggeser kamera: memperbesar kanvas menaikkan
            ukuran piksel arm sambil membiarkan framing NDC apa adanya, jadi
            tidak ada risiko preset terpotong seperti kalau jarak kamera
            dipendekkan (lihat catatan cameraPosition di bawah). */}
        <div className="relative mt-7 min-h-90 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {/* Panggung di sini nyaris persegi, bukan lanskap seperti versi lama,
              jadi FOV horizontalnya jauh lebih sempit. Jarak bukan kira-kira:
              memproyeksikan seluruh titik joint kesepuluh preset lewat matriks
              pandang ini memberi |NDC| terburuk 1,18 pada jarak 2,1 (terpotong)
              dan 0,91 pada 2,6 — memusatkan ulang pandangan tidak membantu
              karena sapuan arm memang sudah terpusat di basis.

              Setelah subjudul dihapus, panggung tumbuh lebih tinggi daripada
              lebar (rasio ±1,01 → ±0,96), sehingga FOV horizontal menyempit dan
              |NDC| naik ±5% — pada 2,46 itu menyerempet 1,0 alias mulai
              terpotong. Karena itu jaraknya dimundurkan ke 2,55: arm tetap
              tampil ±15% lebih besar (kanvasnya jauh lebih tinggi) tanpa ada
              preset yang kena crop. */}

          <RobotArm3D
            presetIndex={activeIndex}
            // Kamera memandang lurus ke −Z (tanpa orbit), jadi menaikkan X = pan
            // murni: framing bergeser sedikit ke KIRI tanpa mengubah sudut
            // head-on ("lurus ke depan"). 0.67 → 0.70 = geseran kecil; jangan
            // terlalu besar supaya preset terkiri tidak menyerempet tepi.
            cameraPosition={[0.7, 0.4, 2.55]}
            className="absolute inset-0"
          />
          <span className="absolute bottom-4 left-4 rounded-full bg-black/40 px-3.5 py-1.5 text-sm font-semibold text-white/80 backdrop-blur-sm">
            Preset {activeIndex + 1}
          </span>
        </div>
      </GlassCard>

      {/* Kanan — grid pose + tombol lanjut */}
      <GlassCard
        maxWidth="max-w-none"
        className={cn(
          'flex flex-1 flex-col p-9 transition-all duration-500',
          spotlight(
            spot === null ? null : spot === 'poses',
            SPOTLIGHT_ON_LARGE,
          ),
        )}
      >
        <div className="text-center">
          <h2 className="text-[44px] font-bold leading-tight text-white">
            {step.heading}
          </h2>
          <p className="mt-2 text-[18px] leading-7 text-white/40">
            {step.subheading}
          </p>
        </div>

        {/* Grid pose — nomor urut saja. Ikon tangan dihapus bersama kendali
            gesture; yang perlu dipahami user sekarang cuma "ada 10 pose dan
            kamera yang berpindah sendiri", dan itu ditunjukkan oleh panggung 3D
            di kiri yang ikut berganti mengikuti pose aktif. */}
        <div className="mt-8 grid grid-cols-5 gap-4">
          {step.poses?.map((pose, i) => {
            const isActive = i === activeIndex;

            return (
              <GlassCard
                key={i}
                variant="secondary"
                className={cn(
                  'flex h-[150px] flex-col items-center justify-center rounded-2xl border px-2 py-4 text-center transition-all duration-300',
                  isActive
                    ? 'scale-[1.04] border-white/15 bg-[#3f72af]/65 shadow-lg'
                    : 'border-transparent',
                )}
              >
                <span
                  className={cn(
                    'text-[40px] font-bold leading-none tabular-nums transition-colors duration-300',
                    isActive ? 'text-white' : 'text-white/35',
                  )}
                >
                  {i + 1}
                </span>

                <span className="mt-3 text-base font-semibold text-white">
                  {pose.name}
                </span>
              </GlassCard>
            );
          })}
        </div>

        {/* Bar bawah — tombol lanjut. Tanpa kartu latar (tombolnya langsung di
            atas kartu induk), tapi tinggi barisnya tetap dipesan lewat padding
            supaya layout tidak melompat saat tombol masih tersembunyi
            (menunggu satu putaran penuh animasi). */}
        <div className="mt-7 flex items-center justify-center px-6 py-4">
          <Button
            onClick={onNext}
            className={cn(
              'rounded-full bg-primary px-8 py-6 text-xl text-white shadow-[0_4px_20px_rgba(17,45,78,0.5)] transition-opacity duration-300 hover:bg-primary/90',
              !hasCompletedFirstLoop && 'pointer-events-none opacity-0',
            )}
          >
            {buttonLabel}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
