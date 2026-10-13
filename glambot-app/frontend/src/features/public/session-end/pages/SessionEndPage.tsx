'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { GetPhotosScreen } from '../components/GetPhotosScreen';
import { DoneScreen } from '../components/DoneScreen';

type ScreenType = 'get-photos' | 'done';

export function SessionEndPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  // Persist current sub-screen di sessionStorage supaya refresh saat di
  // DoneScreen tidak melempar user balik ke GetPhotosScreen (yang akan
  // memulai ulang QR timer 30s).
  const screenStorageKey = sessionId
    ? `glambot:session-end-screen:${sessionId}`
    : null;

  // Lazy init: baca sessionStorage SEBELUM first paint untuk hindari flash
  // GetPhotos → Done saat user refresh di state Done.
  const [currentScreen, setCurrentScreen] = useState<ScreenType>(() => {
    if (typeof window === 'undefined' || !screenStorageKey) return 'get-photos';
    try {
      const stored = window.sessionStorage.getItem(screenStorageKey);
      if (stored === 'done' || stored === 'get-photos') return stored;
    } catch {
      // ignore
    }
    return 'get-photos';
  });

  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  useEffect(() => {
    if (!screenStorageKey || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(screenStorageKey, currentScreen);
    } catch {
      // ignore
    }
  }, [screenStorageKey, currentScreen]);

  if (!sessionId) return null;

  const handleGetPhotosComplete = () => {
    setCurrentScreen('done');
  };

  const handleSessionEnd = () => {
    if (screenStorageKey && typeof window !== 'undefined') {
      try {
        window.sessionStorage.removeItem(screenStorageKey);
      } catch {
        // ignore
      }
    }
    router.push('/');
  };

  return (
    <>
      {currentScreen === 'get-photos' && (
        <GetPhotosScreen
          onComplete={handleGetPhotosComplete}
          sessionId={sessionId}
        />
      )}
      {currentScreen === 'done' && (
        <DoneScreen
          onSessionEnd={handleSessionEnd}
          sessionId={sessionId}
        />
      )}
    </>
  );
}
