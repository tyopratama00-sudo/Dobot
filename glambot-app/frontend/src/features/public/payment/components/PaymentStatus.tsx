'use client';

import { useState, useEffect, useRef } from 'react';
import GlassCard from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import { usePayment, type PaymentState } from '../hooks/usePayment';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import { formatRupiah } from '@/lib/formats';
import { playBackendAudio, playBackendAudioAfterCurrent } from '@/lib/audio';

interface PaymentStatusProps {
  sessionId: string;
  onRetry: () => void;
  onSuccess?: (sessionId: string) => void;
  // Lapor perubahan status ke parent (PayPage) agar bisa menyembunyikan tombol
  // Back begitu pembayaran tidak lagi 'waiting' (mencegah back setelah paid).
  onStatusChange?: (status: PaymentState) => void;
  // Lapor saat QRIS sudah tampil → parent menyembunyikan tombol Back (user
  // sudah commit untuk bayar, jangan biarkan mundur ke summary).
  onQrisReady?: () => void;
}

function QrisPreview({ src }: { src: string }) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return (
      <div className="w-70 h-70 rounded-lg bg-slate-100 flex items-center justify-center px-6 text-center">
        <p className="text-slate-600 text-sm leading-6">
          Failed to load QR image. Wait a few seconds then refresh or create a
          new payment.
        </p>
      </div>
    );
  }

  return (
    // Midtrans QRIS comes from an external URL and is intentionally rendered as a plain image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="QRIS Payment"
      width={280}
      height={280}
      className="rounded-lg block"
      onError={() => setLoadFailed(true)}
    />
  );
}

export default function PaymentStatus({
  sessionId,
  onRetry,
  onSuccess,
  onStatusChange,
  onQrisReady,
}: PaymentStatusProps) {
  const { status, qrisUrl, totalPrice, isPending } = usePayment({
    sessionId,
    onSuccess,
  });

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (qrisUrl) onQrisReady?.();
  }, [qrisUrl, onQrisReady]);

  // Narasi status pembayaran — tiap status diputar sekali. 'success'/'gagal'
  // pakai AfterCurrent agar tidak menabrak ekor "pembayaranDiproses".
  const playedPayStatusRef = useRef<Set<PaymentState>>(new Set());
  useEffect(() => {
    const played = playedPayStatusRef.current;
    if (played.has(status)) return;

    if (status === 'processing') {
      played.add(status);
      playBackendAudio('pembayaranDiproses.mp3');
    } else if (status === 'success') {
      played.add(status);
      playBackendAudioAfterCurrent('pembayaranBerhasil.mp3');
    } else if (status === 'failed' || status === 'expired') {
      played.add(status);
      playBackendAudioAfterCurrent('pembayaranGagal.mp3');
    }
  }, [status]);

  // Processing state — user has paid, verifying payment
  if (status === 'processing') {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-125">
        <StatusAnimation status="processing" />
        <h1 className="text-5xl font-bold text-primary leading-20 mb-1">
          Processing payment...
        </h1>
        <p className="text-primary/50 text-2xl leading-10">
          Please wait a moment
        </p>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="p-10 flex flex-col items-center text-center">
        <StatusAnimation status="success" />
        <h1 className="text-5xl font-bold text-primary leading-20 mb-1">
          Payment Successful!
        </h1>
        <p className="text-primary/50 text-2xl leading-10">
          Let&apos;s begin your session!
        </p>
      </div>
    );
  }

  // Failed / Expired state
  if (status === 'failed' || status === 'expired') {
    return (
      <div className="p-10 flex flex-col items-center text-center">
        <StatusAnimation status={status} />
        <h1 className="text-5xl font-bold text-primary leading-20 mb-1">
          {status === 'expired' ? 'Payment Expired!' : 'Payment Failed!'}
        </h1>
        <p className="text-primary/50 text-2xl leading-10">
          {status === 'expired'
            ? 'Time has run out, please try again'
            : 'Please make the payment again'}
        </p>
        <Button className="mt-20 w-full" onClick={onRetry}>
          Back to payment
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-125">
        <StatusAnimation status="waiting" />
        <h1 className="text-5xl font-bold text-primary leading-20 mb-1">
          Preparing payment...
        </h1>
        <p className="text-primary/50 text-2xl leading-10">
          Please wait a moment
        </p>
      </div>
    );
  }

  // Waiting state — QRIS displayed immediately
  return (
    <div className="w-full max-w-149.25 flex justify-center px-4 py-6">
      <GlassCard className="shadow-[0px_10px_30px_rgba(17,45,78,0.35)]">
        <div className="flex flex-col items-center justify-center gap-10 px-8 py-10 text-center">
          {/* Header */}
          <div>
            <h1 className="text-[42.82px] font-bold leading-[1.1] text-white">
              Scan to Pay
            </h1>
            <p className="mt-3 text-[19px] leading-7 text-white/40">
              Use any QRIS-compatible payment app
            </p>
          </div>

          {/* QR Code */}
          {qrisUrl ? (
            <div className="rounded-2xl bg-white p-4 shadow-[0px_0px_0px_1px_rgba(255,255,255,0.25)]">
              <QrisPreview key={qrisUrl} src={qrisUrl} />
            </div>
          ) : (
            <div className="rounded-2xl border border-white/15 bg-white/5 px-6 py-8 text-center">
              <p className="text-sm text-white">
                QRIS is not ready yet. Payment is still processing, please wait.
              </p>
            </div>
          )}

          {/* Price */}
          {totalPrice !== null && (
            <p className="text-[33.3px] font-semibold leading-tight text-white">
              Rp {formatRupiah(totalPrice)}
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
