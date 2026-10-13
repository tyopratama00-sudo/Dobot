'use client';

import { useCallback, useEffect, useState } from 'react';

// Countdown yang menyimpan `startedAt` di sessionStorage supaya refresh tidak
// mereset sisa waktu. Key biasanya memuat sessionId biar tidak bocor antar
// sesi; key = null mematikan persistence.
export interface PersistedCountdown {
  timeLeft: number;
  clear: () => void;
}

interface StoredState {
  startedAt: number;
  duration: number;
}

const NAMESPACE = 'glambot:timer:';

function readStored(key: string): StoredState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(NAMESPACE + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (
      typeof parsed?.startedAt !== 'number' ||
      typeof parsed?.duration !== 'number'
    ) {
      return null;
    }
    return { startedAt: parsed.startedAt, duration: parsed.duration };
  } catch {
    return null;
  }
}

function writeStored(key: string, state: StoredState) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(NAMESPACE + key, JSON.stringify(state));
  } catch {
    // sessionStorage might be unavailable (private mode) — ignore.
  }
}

function removeStored(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(NAMESPACE + key);
  } catch {
    // ignore
  }
}

function computeRemaining(startedAt: number, duration: number): number {
  const elapsedMs = Date.now() - startedAt;
  const remainingSec = Math.ceil(duration - elapsedMs / 1000);
  if (remainingSec < 0) return 0;
  if (remainingSec > duration) return duration;
  return remainingSec;
}

interface CountdownState {
  startedAt: number | null;
  timeLeft: number;
}

function initialState(key: string | null, duration: number): CountdownState {
  if (typeof window === 'undefined') {
    return { startedAt: null, timeLeft: duration };
  }
  if (!key) {
    return { startedAt: Date.now(), timeLeft: duration };
  }
  const stored = readStored(key);
  if (stored && stored.duration === duration) {
    return {
      startedAt: stored.startedAt,
      timeLeft: computeRemaining(stored.startedAt, duration),
    };
  }
  const startedAt = Date.now();
  writeStored(key, { startedAt, duration });
  return { startedAt, timeLeft: duration };
}

export function usePersistedCountdown(
  key: string | null,
  duration: number,
  paused = false,
): PersistedCountdown {
  // Lazy init: hitung startedAt + sisa waktu sebelum first paint supaya
  // tidak ada flash dari durasi penuh ke nilai sebenarnya.
  const [state, setState] = useState<CountdownState>(() =>
    initialState(key, duration),
  );

  // Re-init kalau key/duration berubah — pola "adjusting state during render"
  // (lebih ringan dari useEffect, tak perlu render kedua).
  const [prevKey, setPrevKey] = useState(key);
  const [prevDuration, setPrevDuration] = useState(duration);
  if (prevKey !== key || prevDuration !== duration) {
    setPrevKey(key);
    setPrevDuration(duration);
    setState(initialState(key, duration));
  }

  // Freeze time tick saat paused = true (geser startedAt maju agar elapsed time diam).
  useEffect(() => {
    if (!paused) return;

    const pauseInterval = setInterval(() => {
      setState((prev) => {
        if (!prev.startedAt) return prev;
        const newStartedAt = prev.startedAt + 250;
        if (key) writeStored(key, { startedAt: newStartedAt, duration });
        return { ...prev, startedAt: newStartedAt };
      });
    }, 250);

    return () => clearInterval(pauseInterval);
  }, [paused, key, duration]);

  // Tick dihitung ulang dari startedAt supaya tidak drift saat tab di-throttle.
  // Interval 250ms (bukan 1000ms) supaya perpindahan detik terdeteksi tepat
  // waktu — render tetap sekali per detik karena nilai sama mem-bail-out.
  useEffect(() => {
    if (state.startedAt === null || paused) return;

    const startedAt = state.startedAt;
    const tick = setInterval(() => {
      setState((prev) => {
        if (prev.startedAt === null) return prev;
        const next = computeRemaining(prev.startedAt, duration);
        if (next === prev.timeLeft) return prev;
        return { ...prev, timeLeft: next };
      });
    }, 250);

    // Avoid lint warning: startedAt unused; used hanya untuk dep tracking.
    void startedAt;
    return () => clearInterval(tick);
  }, [duration, state.startedAt, paused]);

  // Stabilkan referensi `clear` lewat useCallback. Tanpa ini, parent yang
  // menaruh `clear` di deps useEffect ikut re-run sia-sia tiap render.
  const clear = useCallback(() => {
    if (key) removeStored(key);
  }, [key]);

  return { timeLeft: state.timeLeft, clear };
}
