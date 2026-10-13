'use client';

import { Delete, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Keyboard on-screen untuk perangkat touchscreen (mis. input voucher). Tema
// disamakan dengan GlassCard: latar primary gelap transparan, border putih,
// tombol gradient. Layout khusus kode voucher: angka + huruf kapital.
const ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];

interface OnScreenKeyboardProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onEnter: () => void;
  onClose: () => void;
  /** Label tombol konfirmasi (default "Apply"). */
  enterLabel?: string;
  /** Judul di header keyboard. */
  title?: string;
  className?: string;
}

const KEY_BASE =
  'flex items-center justify-center rounded-2xl text-white font-semibold ' +
  'transition-all active:scale-95 select-none touch-manipulation';

export default function OnScreenKeyboard({
  onKeyPress,
  onBackspace,
  onClear,
  onEnter,
  onClose,
  enterLabel = 'Apply',
  title = 'On-screen keyboard',
  className,
}: OnScreenKeyboardProps) {
  return (
    <div
      className={cn(
        'bg-primary/75 border-2 border-white/75 rounded-3xl p-5',
        'shadow-[0px_5.38px_26.92px_0px_rgba(17,45,78,0.5)]',
        'w-[720px] max-w-full flex flex-col gap-3',
        className,
      )}
    >
      {/* Header: judul + tombol tutup keyboard. */}
      <div className="flex items-center justify-between px-1">
        <span className="text-white/70 text-lg font-medium tracking-wide">
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close keyboard"
          className={cn(KEY_BASE, 'gradient-primary border border-white/40 h-11 w-11')}
        >
          <X size={22} />
        </button>
      </div>

      {/* Baris karakter. */}
      {ROWS.map((row, i) => (
        <div key={i} className="flex justify-center gap-2.5">
          {row.map((char) => (
            <button
              key={char}
              type="button"
              onClick={() => onKeyPress(char)}
              className={cn(
                KEY_BASE,
                'gradient-primary border border-white/40 shadow-sm',
                'h-16 flex-1 min-w-0 text-2xl',
              )}
            >
              {char}
            </button>
          ))}
          {/* Backspace menempel di ujung baris huruf terakhir. */}
          {i === ROWS.length - 1 && (
            <button
              type="button"
              onClick={onBackspace}
              aria-label="Backspace"
              className={cn(
                KEY_BASE,
                'bg-blue-100/15 border border-blue-100/85 h-16 px-6',
              )}
            >
              <Delete size={26} />
            </button>
          )}
        </div>
      ))}

      {/* Baris aksi: Clear + Apply/Enter. */}
      <div className="flex gap-2.5 pt-1">
        <button
          type="button"
          onClick={onClear}
          className={cn(
            KEY_BASE,
            'bg-blue-100/15 border border-blue-100/85 h-16 px-8 text-lg',
          )}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onEnter}
          className={cn(
            KEY_BASE,
            'gradient-primary border border-white/60 h-16 flex-1 text-xl gap-2',
          )}
        >
          <Check size={24} />
          {enterLabel}
        </button>
      </div>
    </div>
  );
}
