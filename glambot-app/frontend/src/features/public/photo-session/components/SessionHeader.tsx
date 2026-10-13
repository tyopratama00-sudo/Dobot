import { Camera } from 'lucide-react';
import { formatTimeMMSS } from '@/lib/formatTime';
import { cn } from '@/lib/utils';

interface SessionHeaderProps {
  sessionTimeLeft?: number;
}

// Ambang "waktu menipis": mulai 30 detik terakhir dan TERUS berlaku saat timer
// sudah minus (overtime menunggu robot merampungkan capture). Di-export supaya
// narasi "habisFoto.mp3" di PhotoSessionPage memakai ambang yang SAMA —
// timer merah & peringatan suara di-arm bersamaan (audio punya floor sendiri,
// LOW_TIME_FLOOR_SEC, agar tetap bunyi selagi sisa waktu masih berguna).
export const URGENT_THRESHOLD_SEC = 30;

export function SessionHeader({ sessionTimeLeft = 60 }: SessionHeaderProps) {
  const formattedTime = formatTimeMMSS(sessionTimeLeft);
  const isUrgent = sessionTimeLeft <= URGENT_THRESHOLD_SEC;

  return (
    <div className="flex items-center justify-between bg-primary/80 backdrop-blur-md border border-white/10 px-5 py-3 rounded-2xl shadow-lg">
      {/* Left: icon + label */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-[#3f72af]/80 flex items-center justify-center shadow-inner">
          <Camera size={15} className="text-white" />
        </div>
        <span className="text-white font-normal text-2xl leading-5.75  tracking-[0.38px]">
          Photo Session
        </span>
      </div>

      {/* Right: timer — 30 detik terakhir (dan seterusnya saat minus/overtime)
          berubah merah + denyut membesar sedikit, seperti tombol "Tap to Start". */}
      <div
        className={cn(
          'text-[36px] tracking-[0.38px] leading-5.75 origin-center transition-colors duration-300',
          isUrgent
            ? 'text-[#ff5252] font-semibold animate-timer-urgent'
            : 'text-white font-normal',
        )}
      >
        {formattedTime}
      </div>
    </div>
  );
}
