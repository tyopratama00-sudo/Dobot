'use client';

import { useState, useEffect } from 'react';
import { formatRupiah, formatPriceToK } from '@/lib/formats';
import GlassCard from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import { PrinterIcon, X } from 'lucide-react';
import { playBackendAudio } from '@/lib/audio';

interface PrintQuantityModalProps {
  isOpen: boolean;
  basePrice: number;
  pricePerPrint: number;
  onClose: () => void;
  onConfirm: (quantity: number) => void;
  isConfirming?: boolean;
}

export default function PrintQuantityModal({
  isOpen,
  basePrice,
  pricePerPrint,
  onClose,
  onConfirm,
  isConfirming = false,
}: PrintQuantityModalProps) {
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuantity(1);
      // Modal dibuka lewat tap kartu paket (interaksi user) → autoplay aman.
      playBackendAudio('jumlahCetak.mp3');
    }
  }, [isOpen]);

  const totalDisplay = basePrice + quantity * pricePerPrint;

  const decrement = () => setQuantity((prev) => Math.max(1, prev - 1));
  const increment = () => setQuantity((prev) => Math.min(10, prev + 1));

  if (!isOpen) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex  justify-center items-center mt-10 animate-[fadeIn_200ms_ease-out]"
      onClick={onClose}
    >
      <GlassCard
        maxWidth="max-w-[549px]"
        className="relative mx-4 backdrop-blur-sm"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-5 top-5 h-8 w-8 text-blue-100/55 hover:bg-transparent hover:text-white"
        >
          <X className="size-7.5" />
        </Button>

        <div className="flex flex-col items-center px-10 py-10">
          <PrinterIcon size={48} className="mb-5" color="#ffffff" />

          {/* Title */}
          <h2 className="text-[35px] font-bold text-white mb-2 leading-[52.5px]">
            Number of Prints
          </h2>

          {/* Subtitle */}
          <p className="text-[18px] leading-7 text-blue-100 mb-10">
            Each additional print: Rp {formatPriceToK(pricePerPrint)}
          </p>

          {/* Quantity Selector */}
          <div className="flex items-center justify-center gap-10 mb-10">
            <Button
              variant="outline"
              size="icon"
              onClick={decrement}
              disabled={quantity <= 1}
              className="h-16 w-16 text-3xl font-light hover:bg-white/25"
            >
              −
            </Button>

            <span className="text-7xl font-bold text-white leading-none min-w-15 text-center">
              {quantity}
            </span>

            <Button
              variant="outline"
              size="icon"
              onClick={increment}
              disabled={quantity >= 10}
              className="h-16 w-16 text-3xl font-light hover:bg-white/25"
            >
              +
            </Button>
          </div>

          {/* Total */}
          <p className="text-white/70 text-lg mb-8">
            Total:{' '}
            <span className="text-white font-bold text-xl">
              Rp {formatRupiah(totalDisplay)}
            </span>
          </p>

          {/* Confirm Button */}
          <Button
            variant="outline"
            onClick={() => onConfirm(quantity)}
            disabled={isConfirming}
          >
            {isConfirming ? 'Processing...' : 'Confirm'}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}
