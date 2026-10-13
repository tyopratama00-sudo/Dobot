'use client';

import { AlertCircle } from 'lucide-react';
import GlassCard from '@/components/shared/GlassCard';

interface ErrorStateProps {
  onRetry: () => void;
}

export function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <div className="w-full flex items-center justify-center px-4">
      <GlassCard
        variant="default"
        className="flex flex-col items-center text-center px-8 py-10 gap-4"
      >
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
          <AlertCircle className="w-9 h-9 text-red-400" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold text-white">Failed to load photos</h1>
        <p className="text-white/70 text-base leading-relaxed">
          Something went wrong while fetching your photos. Check your internet
          connection and try again.
        </p>
        <button
          onClick={onRetry}
          className="mt-2 min-h-11 min-w-11 px-6 rounded-xl bg-white/20 border border-white/40 text-white font-semibold text-base hover:bg-white/30 active:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          aria-label="Try loading photos again"
        >
          Try Again
        </button>
      </GlassCard>
    </div>
  );
}
