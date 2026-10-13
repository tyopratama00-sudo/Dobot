import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveRobotUrl } from '@/lib/api-client';

/**
 * State sequence pose otomatis di dobot (app/core/sequence.py).
 * IDLE      — sesi belum mulai
 * MOVING    — kamera bergerak ke pose berikutnya
 * TRACKING  — diam di pose, face tracking j5/j6 menjaga wajah di tengah
 * CAPTURING — countdown 3-2-1 + shutter; lengan sengaja dibekukan
 * DONE      — 10 pose selesai
 */
export type RobotFsmState =
  | 'IDLE'
  | 'MOVING'
  | 'TRACKING'
  | 'CAPTURING'
  | 'DONE';

export interface RobotSequence {
  /** Pose ke berapa (1-based). 0 = belum mulai. */
  index: number;
  /** Total pose dalam sequence (biasanya 10). */
  total: number;
  /** Nomor preset robot untuk pose ini. */
  preset: number | null;
  /** Nama preset di file konfigurasi (mis. "P21"). */
  preset_name: string | null;
  /** Sisa detik slot pose yang sedang berjalan. */
  seconds_left: number;
  /** Panjang slot pose ini (detik) — untuk mengubah seconds_left jadi persen. */
  slot_sec: number;
  /** Kemajuan SELURUH sequence 0-100 (bukan slot tunggal). */
  percent: number;
  /** True saat 10 pose sudah selesai — frontend memakai ini untuk mengakhiri sesi. */
  complete: boolean;
}

export interface RobotDetection {
  session_active: boolean;
  face_detected: boolean;
  /** Posisi wajah relatif titik bidik, -0.5..0.5. + = kanan / bawah. */
  face_offset: { x: number; y: number } | null;
  confidence: number | null;
  method: string;
  /** True saat FaceTracker sedang mengoreksi j5/j6. */
  tracking_active: boolean;
  fsm_state: RobotFsmState;
  status: string;
  sequence: RobotSequence;
  robot: {
    connected: boolean;
    enabled: boolean;
    current_preset: number | null;
    ip: string;
  };
}

const POLL_MS = 150;

interface UseRobotDetectionOptions {
  enabled?: boolean;
}

/**
 * Polling endpoint /detection dobot (Flask :5001) untuk state real-time:
 * wajah terdeteksi, posisi sequence, dan progress. Juga menyediakan URL stream
 * MJPEG (/video_feed) untuk liveview kamera deteksi wajah.
 */
export function useRobotDetection({ enabled = true }: UseRobotDetectionOptions = {}) {
  const robotUrl = useMemo(() => resolveRobotUrl(), []);
  const [detection, setDetection] = useState<RobotDetection | null>(null);
  const [reachable, setReachable] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setDetection(null);
      setReachable(false);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const poll = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const res = await fetch(`${robotUrl}/detection`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RobotDetection;
        if (!active) return;
        setDetection(data);
        setReachable(true);
      } catch {
        if (!active) return;
        setReachable(false);
      } finally {
        busyRef.current = false;
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);

    return () => {
      active = false;
      clearInterval(id);
      controller.abort();
    };
  }, [enabled, robotUrl]);

  const streamUrl = enabled ? `${robotUrl}/video_feed` : null;

  return { detection, reachable, robotUrl, streamUrl };
}
