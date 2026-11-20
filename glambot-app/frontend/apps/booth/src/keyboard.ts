/**
 * On-screen keyboard logic (no DOM): the layout and what each key does to the text.
 * Used by components/OnScreenKeyboard for the registration screen and the QR "Ubah email" dialog,
 * and by hardwareKey for the same fields when Keyboard di Layar is off.
 */

export const SHORTCUTS = ['@gmail.com', '@yahoo.com', '.com'] as const;

export const KEYBOARD_ROWS: string[][] = [
  [...'1234567890', 'backspace'],
  [...'qwertyuiop', '-', '_'],
  [...'asdfghjkl', '@', '.'],
  ['shift', ...'zxcvbnm', 'space'],
  [...SHORTCUTS],
];

export interface KeyboardState {
  value: string;
  /** One-shot: the next letter is uppercase, then Shift releases. */
  shift: boolean;
}

export function pressKey(s: KeyboardState, key: string, maxLength = Infinity): KeyboardState {
  if (key === 'shift') return { ...s, shift: !s.shift };
  if (key === 'backspace') return { ...s, value: s.value.slice(0, -1) };
  const text = key === 'space' ? ' ' : key.length === 1 && s.shift ? key.toUpperCase() : key;
  if (s.value.length + text.length > maxLength) return s;
  return { value: s.value + text, shift: key.length === 1 && /[a-z]/.test(key) ? false : s.shift };
}

/** Single characters the on-screen keyboard can type; the hardware keyboard is held to the same set. */
const TYPABLE = new Set(KEYBOARD_ROWS.flat().filter((k) => k.length === 1));

export type HardwareAction = { type: 'edit'; state: KeyboardState } | { type: 'next' | 'prev' | 'submit' | 'cancel' };

/**
 * A key press on the hardware keyboard (used when Keyboard di Layar is off), mapped onto
 * the same pressKey edits as the on-screen keys. null = the key does nothing.
 */
export function hardwareKey(s: KeyboardState, e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }, maxLength = Infinity): HardwareAction | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.key === 'Backspace') return { type: 'edit', state: pressKey(s, 'backspace', maxLength) };
  if (e.key === 'Tab') return { type: e.shiftKey ? 'prev' : 'next' };
  if (e.key === 'Enter') return { type: 'submit' };
  if (e.key === 'Escape') return { type: 'cancel' };
  if (e.key === ' ') return { type: 'edit', state: pressKey(s, 'space', maxLength) };
  const lower = e.key.toLowerCase();
  if (e.key.length !== 1 || !TYPABLE.has(lower)) return null;
  const upper = lower !== e.key;
  return { type: 'edit', state: pressKey(upper ? { ...s, shift: true } : s, lower, maxLength) };
}
