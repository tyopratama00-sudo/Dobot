import { Check, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RobotFsmState, RobotSequence } from '../api/getRobotDetection';

// Gaya kartu pose — disamakan dengan kartu preset pada desain sebelumnya
// supaya tata letak kolom kanan tidak berubah.
const TILE =
  'relative flex min-h-0 flex-col items-center justify-center gap-1 rounded-xl border p-2 text-center transition-all duration-200';
const TILE_PENDING = 'border-white/10 bg-white/5';
const TILE_DONE = 'border-[#00d084]/40 bg-[#00d084]/15';
const TILE_ACTIVE =
  'border-white/60 bg-white/25 shadow-[0_0_20px_-2px_rgba(255,255,255,0.45)] scale-[1.04]';

interface SequenceProgressPanelProps {
  sequence?: RobotSequence | null;
  fsmState?: RobotFsmState;
  className?: string;
}

export function SequenceProgressPanel({
  sequence,
  fsmState = 'IDLE',
  className,
}: SequenceProgressPanelProps) {
  const total = sequence?.total ?? 10;
  const index = sequence?.index ?? 0;
  const secondsLeft = sequence?.seconds_left ?? 0;
  const complete = sequence?.complete ?? false;
  const isCapturing = fsmState === 'CAPTURING';

  return (
    <div
      className={cn(
        'grid min-h-0 flex-1 grid-cols-2 grid-rows-5 gap-3 2xl:gap-4',
        className,
      )}
    >
      {Array.from({ length: total }, (_, i) => {
        const poseNumber = i + 1;
        // Pose dianggap selesai begitu sequence sudah lewat darinya; saat
        // seluruh sequence beres, semuanya ditandai selesai.
        const done = complete || poseNumber < index;
        const active = !complete && poseNumber === index;

        return (
          <div
            key={poseNumber}
            className={cn(
              TILE,
              done ? TILE_DONE : active ? TILE_ACTIVE : TILE_PENDING,
            )}
          >
            {done ? (
              <Check
                size={26}
                strokeWidth={3}
                className="text-[#00d084]"
                aria-hidden="true"
              />
            ) : active && isCapturing ? (
              <Camera
                size={26}
                strokeWidth={2.5}
                className="text-white animate-pulse"
                aria-hidden="true"
              />
            ) : (
              <span
                className={cn(
                  'text-2xl 2xl:text-3xl font-bold tabular-nums',
                  active ? 'text-white' : 'text-white/45',
                )}
              >
                {poseNumber}
              </span>
            )}

            <span
              className={cn(
                'text-sm 2xl:text-base font-semibold',
                active ? 'text-white' : done ? 'text-white/70' : 'text-white/60',
              )}
            >
              Pose {poseNumber}
            </span>

            {/* Hitung mundur hanya pada pose yang sedang berjalan, supaya user
                tahu berapa lama lagi sebelum jepretan. */}
            {active && !isCapturing && (
              <span className="text-xs font-medium tabular-nums text-white/75">
                {Math.ceil(secondsLeft)}s
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
