import { useEffect, useRef } from 'react';
import { useBooth } from '../store';

/** Keyboard di Layar from admin; missing = on. Off means the booth types on a hardware keyboard. */
export const useOnScreenKeyboard = () => useBooth((s) => s.config?.onScreenKeyboard !== false);

/**
 * Hardware key presses while `enabled` (Keyboard di Layar off and this screen is taking text).
 * `handle` returns true for a key it used: the browser default (focus moving on Tab, a focused
 * button firing on Enter/Space) is stopped so only the screen reacts.
 */
export function useHardwareKeys(enabled: boolean, handle: (e: KeyboardEvent) => boolean) {
  const latest = useRef(handle);
  latest.current = handle;
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || !latest.current(e)) return;
      e.preventDefault();
      (document.activeElement as HTMLElement | null)?.blur?.();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled]);
}
