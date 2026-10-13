'use client';

import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  onClick: () => void;
  label?: string;
}

/**
 * Tombol Back kiosk (kiri-atas). HANYA untuk langkah pra-pembayaran —
 * setelah `paid` jangan ditampilkan supaya tidak memicu double-charge.
 */
export default function BackButton({ onClick, label = 'Back' }: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed top-4 left-4 z-50 flex items-center gap-2 rounded-full border-2 border-white/75 bg-primary/75 px-5 py-3 text-white/90 shadow-[0px_5.38px_26.92px_0px_rgba(17,45,78,0.5)] backdrop-blur-md transition-colors hover:bg-[#3F72AF]/60 hover:text-white active:bg-[#3F72AF]"
    >
      <ArrowLeft className="h-6 w-6" />
      <span className="text-lg font-semibold">{label}</span>
    </button>
  );
}
