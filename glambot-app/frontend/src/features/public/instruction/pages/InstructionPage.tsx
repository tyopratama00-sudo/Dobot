'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  instructionSteps,
  type InstructionStep,
  type InstructionHighlight,
} from '../data/steps';
import {
  GetReadyCard,
  SafetyRulesCard,
  PoseSequenceCard,
} from '../components/InstructionCards';
import { usePatchSessionStatus, useGetSession } from '@/shared/api/session';
import { sendSessionBroadcast } from '@/features/public/photo-session/lib/broadcastChannel';
import { playBackendAudio, playBackendAudioAfterCurrent } from '@/lib/audio';
import Timer from '@/components/shared/Timer';
import { useAppConfig } from '@/shared/api/config';

/**
 * Rangkaian narasi per step: diputar berurutan (yang berikutnya menunggu yang
 * sekarang selesai), dan selama sebuah cue berbunyi bagian kartu yang dirujuk
 * ikut ter-highlight — jadi user mendengar sekaligus melihat apa yang dimaksud.
 * `highlight` kosong = narasi umum, tidak menyorot apa pun.
 */
/**
 * Jeda antar narasi di halaman instruksi. Tanpa ini cue berikutnya menempel
 * persis di ekor cue sebelumnya dan terdengar buru-buru — user tidak sempat
 * melihat bagian yang baru disorot.
 */
const CUE_GAP_MS = 1000;

const STEP_CUES: Record<
  InstructionStep['type'],
  { file: string; highlight?: InstructionHighlight }[]
> = {
  'get-ready': [
    { file: 'introDengar.mp3' },
    { file: 'waktuSesi.mp3', highlight: 'duration' },
    { file: 'infoSingkat.mp3', highlight: 'activities' },
  ],
  safety: [
    { file: 'keselamatanNoM.mp3' },
    { file: 'deteksiSatu.mp3', highlight: 'guideline' },
  ],
  'pose-sequence': [
    { file: 'infoPreset.mp3' },
    { file: 'pilGesture.mp3', highlight: 'poses' },
    { file: 'pilAcam.mp3', highlight: 'camera' },
  ],
};

export default function InstructionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const router = useRouter();
  const touchStartX = useRef(0);
  const searchParams = useSearchParams();

  const sessionId = searchParams.get('sessionId') ?? '';
  const step = instructionSteps[currentStep];
  const isLast = currentStep === instructionSteps.length - 1;

  const { mutate } = usePatchSessionStatus();
  const { data: appConfig } = useAppConfig();
  const { data: session, isFetching: isSessionFetching } = useGetSession({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  // Durasi sesi (menit) mengikuti paket yang dipilih user — sama dengan durasi
  // timer di halaman foto (session.durationSecs). Undefined saat session belum
  // termuat sehingga kartu memakai default step.sessionDuration sementara.
  const sessionDurationMinutes =
    session?.durationSecs != null
      ? Math.round(session.durationSecs / 60)
      : undefined;

  // Semua hook harus dipanggil tanpa syarat (rules-of-hooks); early-return
  // untuk sessionId kosong ditangani SETELAH semua hook dideklarasikan.
  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  // Guard: sesi yang belum dibayar / kedaluwarsa tidak boleh masuk instruksi.
  // PENTING: tunggu data FRESH — jangan bertindak saat masih fetching, karena
  // cache `['session', id]` bisa berisi 'pending_payment' lama tepat setelah
  // bayar (status 'paid' belum sempat ter-refetch) → kalau tidak, user yang
  // baru bayar malah ke-redirect balik ke /package. Backend tetap menolak
  // transisi ke 'shooting' tanpa 'paid' sebagai batas keamanan sebenarnya.
  useEffect(() => {
    if (isSessionFetching) return;
    if (session?.status === 'pending_payment' || session?.status === 'expired') {
      router.replace('/package');
    }
  }, [session?.status, isSessionFetching, router]);

  // Tombol "Next" (get-ready & safety) baru muncul setelah SELURUH rangkaian
  // narasi step selesai, supaya user mendengarkan dulu. Direset tiap ganti step.
  const [audioDone, setAudioDone] = useState(false);
  // Bagian kartu yang sedang disorot mengikuti narasi yang berbunyi.
  const [highlight, setHighlight] = useState<InstructionHighlight | null>(null);

  // Panduan suara per step — rangkaian cue diputar berurutan saat masuk step
  // (keyed stepType).
  const stepType = step?.type;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset flag audio & sorotan tiap ganti step (keyed stepType), lalu mulai narasi.
    setAudioDone(false);
    setHighlight(null);

    const cues = stepType ? STEP_CUES[stepType] : undefined;
    if (!cues) return;

    let cancelled = false;
    let gapTimer = 0;

    // Jeda CUE_GAP_MS sebelum tiap cue — termasuk sebelum cue pertama (kartu
    // sempat terbaca dulu) dan sebelum tombol Next dibuka di akhir rangkaian.
    const schedule = (index: number) => {
      if (cancelled) return;
      gapTimer = window.setTimeout(() => playFrom(index), CUE_GAP_MS);
    };

    const playFrom = (index: number) => {
      if (cancelled) return;
      if (index >= cues.length) {
        // Rangkaian habis: tombol dibuka, sorotan dilepas lagi.
        setHighlight(null);
        setAudioDone(true);
        return;
      }
      const cue = cues[index];
      setHighlight(cue.highlight ?? null);
      // Cue pertama step get-ready menunggu "pembayaranBerhasil" (dari halaman
      // payment) selesai dulu; sisanya menyambung lewat callback onEnded, jadi
      // tidak ada dua narasi yang menumpuk.
      const next = () => schedule(index + 1);
      if (index === 0 && stepType === 'get-ready') {
        playBackendAudioAfterCurrent(cue.file, next);
      } else {
        playBackendAudio(cue.file, next);
      }
    };
    schedule(0);

    return () => {
      cancelled = true;
      window.clearTimeout(gapTimer);
    };
  }, [stepType]);

  if (!sessionId) return null;

  const goToPhotoSession = () => {
    mutate({ sessionId, status: 'shooting' });

    // Broadcast SESSION_START ke Monitor 2 yang sudah standby
    sendSessionBroadcast({ type: 'SESSION_START', sessionId });

    // Robot di-enable di PhotoSessionPage (saat halaman kamera benar-benar
    // tampil), bukan di sini — supaya robot tidak bergerak selagi user masih
    // di layar instruksi.
    router.push(`/photo-session?sessionId=${sessionId}`);
  };

  const handleNext = () => {
    if (isLast) {
      goToPhotoSession();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  // Swipe left/right to navigate between steps
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    const threshold = 50;

    if (diff > threshold && currentStep < instructionSteps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else if (diff < -threshold && currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <main
      className="flex flex-col items-center min-h-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Auto-advance ke photo session (durasi diatur admin; default 60s).
          Dirender setelah config termuat agar durasi pasti benar. */}
      {appConfig && (
        <Timer
          duration={appConfig.instructionTimeoutSecs}
          onTimeUp={goToPhotoSession}
        />
      )}

      <div className="text-center py-3.5">
        <h1 className="font-bold text-primary text-[62px]">
          Intro & Safety Instruction
        </h1>
      </div>

      {/* Animate step transition on key change */}
      <div
        key={currentStep}
        className="flex justify-center w-full pt-[clamp(40px,9vh,160px)] pb-[clamp(40px,6vh,96px)] animate-[slideUp_300ms_ease-out]"
      >
        {step.type === 'get-ready' ? (
          <GetReadyCard
            step={step}
            onNext={handleNext}
            buttonLabel="Next →"
            buttonReady={audioDone}
            sessionDurationMinutes={sessionDurationMinutes}
            highlight={highlight}
          />
        ) : step.type === 'safety' ? (
          <SafetyRulesCard
            step={step}
            onNext={handleNext}
            buttonLabel="Next →"
            buttonReady={audioDone}
            highlight={highlight}
          />
        ) : (
          <PoseSequenceCard
            step={step}
            onNext={handleNext}
            buttonLabel="Got it, Let's Go!"
            highlight={highlight}
          />
        )}
      </div>
    </main>
  );
}
