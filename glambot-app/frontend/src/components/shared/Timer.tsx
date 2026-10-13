'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePersistedCountdown } from '@/lib/usePersistedCountdown';
import { formatTimeMMSS } from '@/lib/formatTime';
import { cn } from '@/lib/utils';

// 15 detik terakhir → timer merah + denyut membesar (sama seperti header sesi
// foto) sebagai peringatan waktu menipis.
const URGENT_THRESHOLD_SEC = 15;

interface TimerProps {
  duration?: number;
  onTimeUp?: () => void;
  // Opsional: kalau di-pass, sisa waktu disimpan di sessionStorage dan
  // refresh halaman tetap melanjutkan hitungan (bukan reset ke `duration`).
  // Biasanya sertakan sessionId di key supaya tidak bocor antar sesi.
  storageKey?: string | null;
  // Kalau true, 15 detik terakhir → timer merah + denyut (peringatan waktu
  // menipis). Sengaja opt-in supaya HANYA dipakai di sesi foto & edit foto,
  // bukan di layar lain (mis. get-photos).
  urgentWhenLow?: boolean;
  // Dipanggil saat status "urgent" (<=15 dtk) berubah — parent bisa memunculkan
  // efek tambahan (mis. aura merah full-screen di editor foto).
  onUrgentChange?: (urgent: boolean) => void;
  // Pause countdown (mis. saat modal onboarding / petunjuk terbuka).
  paused?: boolean;
}

export default function Timer({
  duration = 120,
  onTimeUp,
  storageKey = null,
  urgentWhenLow = false,
  onUrgentChange,
  paused = false,
}: TimerProps) {
  const { timeLeft, clear } = usePersistedCountdown(
    storageKey,
    duration,
    paused,
  );
  const router = useRouter();
  // Pastikan onTimeUp / fallback router.push hanya fire SEKALI walaupun
  // efek re-run akibat onTimeUp ref berubah saat parent re-render (misal
  // karena mutation pending yang trigger render baru).
  const firedRef = useRef(false);
  const onTimeUpRef = useRef(onTimeUp);
  // Sinkronkan ref setelah render (bukan saat render) — dibaca di effect di bawah.
  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (timeLeft > 0) return;
    if (firedRef.current) return;
    firedRef.current = true;
    clear();
    if (onTimeUpRef.current) {
      onTimeUpRef.current();
    } else {
      router.push('/');
    }
  }, [timeLeft, router, clear]);

  const isUrgent = urgentWhenLow && timeLeft <= URGENT_THRESHOLD_SEC;

  // Laporkan perubahan status urgent ke parent (via effect, bukan saat render).
  const onUrgentChangeRef = useRef(onUrgentChange);
  useEffect(() => {
    onUrgentChangeRef.current = onUrgentChange;
  }, [onUrgentChange]);
  useEffect(() => {
    onUrgentChangeRef.current?.(isUrgent);
  }, [isUrgent]);

  return (
    <div className="fixed p-8 top-4 right-4 z-50 pointer-events-none">
      <div
        className={cn(
          'text-[40px] font-bold origin-center transition-colors duration-300',
          isUrgent
            ? 'text-[#ff5252] animate-timer-urgent'
            : 'text-primary',
        )}
      >
        {formatTimeMMSS(timeLeft)}
      </div>
    </div>
  );
}
