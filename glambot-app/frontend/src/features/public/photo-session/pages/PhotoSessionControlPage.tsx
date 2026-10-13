'use client';

import { FaceDetectionPanel } from '../components/FaceDetectionPanel';
import { SequenceProgressPanel } from '../components/SequenceProgressPanel';
import { useState, useEffect } from 'react';
import { useGetSession } from '@/shared/api/session';
import { listenSessionBroadcast } from '../lib/broadcastChannel';
import { useRobotDetection } from '../api/getRobotDetection';

/**
 * Monitor 2 — Pose Sequence
 *
 * Selalu terbuka di monitor kedua dalam mode standby.
 * Aktif saat menerima SESSION_START broadcast → tampilkan status sesi yang
 * disambungkan langsung ke dobot robot service (:5001): liveview kamera deteksi
 * wajah (MJPEG /video_feed), status face tracking, dan posisi sequence pose
 * beserta hitung mundurnya (poll /detection). Kembali standby saat SESSION_END.
 */
export function PhotoSessionControlPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  // State real-time dari dobot. Poll hanya saat sesi aktif.
  const { detection, reachable, streamUrl } = useRobotDetection({
    enabled: isActive,
  });

  useGetSession({
    sessionId: sessionId ?? '',
    queryConfig: { enabled: !!sessionId },
  });

  // Listen broadcast dari Monitor 1
  useEffect(() => {
    const unsubscribe = listenSessionBroadcast({
      onStart: (id) => {
        setSessionId(id);
        setIsActive(true);
      },
      onEnd: (id) => {
        if (id !== sessionId) return;
        setIsActive(false);
        setSessionId(null);
      },
    });

    return unsubscribe;
  }, [sessionId]);

  // ── Standby UI ──────────────────────────────────────────────────────────────
  if (!isActive) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <p className="text-primary/40 text-2xl font-medium tracking-widest uppercase">
          Standby
        </p>
        <p className="text-white/20 text-sm">Waiting for next session...</p>
      </div>
    );
  }

  // ── Derive dari detection real ──────────────────────────────────────────────
  const fsmState = detection?.fsm_state ?? 'IDLE';
  const faceDetected = !!detection?.face_detected;
  const trackingActive = !!detection?.tracking_active;
  const sequence = detection?.sequence ?? null;

  // ── Active UI ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full flex flex-col overflow-hidden px-[79.7px] pb-[190.19px] pt-[120.16px] gap-6">
      <div className="flex flex-row gap-6 flex-1 min-h-0">
        {/* Left — Face Detection */}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <h2 className="text-primary font-medium text-[32px] tracking-[1.13px] shrink-0">
            Face Detection
          </h2>
          <div className="w-[875.31px] h-160.25">
            <FaceDetectionPanel
              streamUrl={streamUrl}
              reachable={reachable}
              fsmState={fsmState}
              faceDetected={faceDetected}
              trackingActive={trackingActive}
              sequence={sequence}
            />
          </div>
        </div>

        {/* Right — Pose Sequence (read-only, refleksi state robot) */}
        <div className="flex flex-col gap-3 w-80 shrink-0">
          <h2 className="text-primary font-medium text-[32px] tracking-[1.13px] shrink-0">
            Pose
          </h2>
          <div className="flex w-76.25 flex-1 min-h-0 flex-col rounded-2xl bg-primary/75 p-5">
            <SequenceProgressPanel sequence={sequence} fsmState={fsmState} />
          </div>
        </div>
      </div>
    </div>
  );
}
