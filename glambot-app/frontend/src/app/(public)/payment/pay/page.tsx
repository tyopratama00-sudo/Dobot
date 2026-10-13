import { Suspense } from 'react';
import type { Metadata } from 'next';
import PayPage from '@/features/public/payment/pages/PayPage';

export const metadata: Metadata = {
  title: 'Payment',
  description: 'Complete your payment via QRIS',
};

function PayFallback() {
  return (
    <main className="flex flex-col items-center justify-center min-h-full px-4">
      <div className="w-full max-w-120 rounded-3xl bg-primary/80 backdrop-blur-xl border border-white/10 shadow-2xl p-8 flex flex-col items-center animate-pulse">
        <div className="h-8 bg-white/10 rounded-lg w-1/2 mb-2" />
        <div className="h-5 bg-white/10 rounded w-2/3 mb-6" />
        <div className="bg-white/10 rounded-2xl w-78 h-78 mb-6" />
        <div className="h-5 bg-white/10 rounded w-1/4 mb-6" />
        <div className="h-4 bg-white/10 rounded w-1/3 mb-8" />
        <div className="h-12 bg-white/10 rounded-full w-40" />
      </div>
    </main>
  );
}

export default function PaymentPayRoute() {
  return (
    <Suspense fallback={<PayFallback />}>
      <PayPage />
    </Suspense>
  );
}
