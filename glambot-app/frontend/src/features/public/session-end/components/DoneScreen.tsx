'use client';

import Timer from '@/components/shared/Timer';
import { CloudDownload, Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useAppConfig } from '@/shared/api/config';
import { playBackendAudio } from '@/lib/audio';

interface DoneScreenProps {
  onSessionEnd: () => void;
  sessionId: string;
}
export function DoneScreen({ onSessionEnd, sessionId }: DoneScreenProps) {
  const { data: appConfig } = useAppConfig();

  // Ucapan terima kasih — main sekali saat layar tampil.
  const thanksAudioFiredRef = useRef(false);
  useEffect(() => {
    if (!thanksAudioFiredRef.current) {
      thanksAudioFiredRef.current = true;
      playBackendAudio('terimakasih.mp3');
    }
  }, []);

  return (
    <div className="min-h-full w-full flex flex-col items-center justify-center relative overflow-hidden">
      {appConfig && (
        <Timer
          duration={appConfig.doneScreenTimeoutSecs}
          onTimeUp={onSessionEnd}
          storageKey={`done-screen:${sessionId}`}
        />
      )}

      {/* Robot Icon */}
      <div className="mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- aset SVG statik lokal; app sengaja pakai <img> (lihat next.config images) */}
        <img src="/robot 1.svg" alt="Robot" className="w-30" />
      </div>

      {/* Aligned content block */}
      <div className="flex flex-col items-start">
        {/* Thank You with sparkles */}
        <div className="relative mb-3">
          <Sparkles
            size={60}
            className="text-primary absolute -left-12 top-1"
            strokeWidth={1.5}
            fill="currentColor"
          />
          <h1 className="text-[128px] font-bold bg-linear-to-tl gradient-text ">
            Thank You!
          </h1>
        </div>

        {/* Subtitle + QR row */}
        <div className="flex items-start gap-6 mb-4">
          {/* Text */}
          <div className="flex flex-col">
            <p className="text-primary text-2xl font-medium leading-relaxed">
              Your photos are ready on Google Drive.
            </p>
            <p className="text-primary text-2xl font-medium leading-relaxed">
              See you in the next session!
            </p>
          </div>

          {/* QR Code — primary color */}
          <div className="flex  gap-4 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- aset SVG statik lokal; app sengaja pakai <img> (lihat next.config images) */}
            <img
              src="/qr-d.svg"
              alt="Scan Feedback"
              className="w-17.5 h-17.5"
            />
            <span className="text-lg bg-linear-to-b gradient-text">
              Scan <br /> Feedback
            </span>
          </div>
        </div>

        <div className="flex  gap-2 bg-primary/8 border border-primary/15 px-4 py-2 rounded-full">
          <CloudDownload size={14} className="text-primary/50" />
          <span className="text-[12px] text-primary/60 font-medium">
            Drive link valid for 3 days
          </span>
        </div>
      </div>

      {/* Gdrive badge */}
    </div>
  );
}
