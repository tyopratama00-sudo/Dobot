import { Suspense } from 'react';
import type { Metadata } from 'next';
import SummaryPage from '@/features/public/payment/pages/SummaryPage';

export const metadata: Metadata = {
  title: 'Order Summary',
  description: 'Review your order before proceeding to payment',
};

function SummaryFallback() {
  return (
    <main className="flex flex-col items-center justify-center min-h-full px-4">
      <div className="w-full max-w-120 rounded-3xl bg-primary/80 backdrop-blur-xl border border-white/10 shadow-2xl p-8 animate-pulse">
        <div className="h-10 bg-white/10 rounded-lg w-3/4 mx-auto mb-8" />
        <div className="space-y-4 mb-6">
          <div className="flex justify-between">
            <div className="h-5 bg-white/10 rounded w-1/3" />
            <div className="h-5 bg-white/10 rounded w-1/4" />
          </div>
          <div className="flex justify-between">
            <div className="h-5 bg-white/10 rounded w-2/5" />
            <div className="h-5 bg-white/10 rounded w-1/4" />
          </div>
        </div>
        <div className="border-t border-white/15 pt-4 mb-8">
          <div className="flex justify-between">
            <div className="h-6 bg-white/10 rounded w-1/5" />
            <div className="h-6 bg-white/10 rounded w-1/3" />
          </div>
        </div>
        <div className="h-14 bg-white/10 rounded-2xl mb-8" />
        <div className="h-14 bg-white/10 rounded-full" />
      </div>
    </main>
  );
}

export default function PaymentSummaryRoute() {
  return (
    <Suspense fallback={<SummaryFallback />}>
      <SummaryPage />
    </Suspense>
  );
}
