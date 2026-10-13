'use client';

import { Button } from '@/components/ui/button';
import GlassCard from '@/components/shared/GlassCard';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-col items-center justify-center min-h-full px-4">
      <GlassCard className="p-10 flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">
          Something went wrong
        </h1>
        <p className="text-white/60 text-base mb-8">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <Button onClick={reset} className="w-full">
          Try Again
        </Button>
      </GlassCard>
    </main>
  );
}
