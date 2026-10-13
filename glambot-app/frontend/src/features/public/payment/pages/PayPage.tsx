'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import PaymentStatus from '../components/PaymentStatus';
import type { PaymentState } from '../hooks/usePayment';
import Timer from '@/components/shared/Timer';
import BackButton from '@/components/shared/BackButton';
import { playBackendAudio } from '@/lib/audio';

export default function PayPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get('sessionId') ?? '';

  // Tombol Back hanya boleh muncul selagi pembayaran masih 'waiting' DAN QRIS
  // belum tampil. Begitu QRIS muncul (user commit bayar) atau status pindah ke
  // processing/success (sesi sudah 'paid'), Back hilang — cegah mundur.
  const [payStatus, setPayStatus] = useState<PaymentState>('waiting');
  const [qrisReady, setQrisReady] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  if (!sessionId) return null;

  const handleSuccess = (sid: string) => {
    router.push(`/instruction?sessionId=${sid}`);
  };

  // Waktu bayar habis → beri tahu user pembayaran gagal (audio tetap lanjut
  // saat pindah ke Home karena di-cache di module scope), lalu kembali ke Home.
  const handleTimeUp = () => {
    playBackendAudio('pembayaranGagal.mp3');
    router.push('/');
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-full px-4">
      <Timer onTimeUp={handleTimeUp} />
      {payStatus === 'waiting' && !qrisReady && (
        <BackButton
          onClick={() => router.push(`/payment/summary?sessionId=${sessionId}`)}
        />
      )}
      <PaymentStatus
        sessionId={sessionId}
        onRetry={() => router.back()}
        onSuccess={handleSuccess}
        onStatusChange={setPayStatus}
        onQrisReady={() => setQrisReady(true)}
      />
    </main>
  );
}
