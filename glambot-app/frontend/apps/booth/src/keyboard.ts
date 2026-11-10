/**
 * On-screen keyboard logic (no DOM): the layout and what each key does to the text.
 * Used by components/OnScreenKeyboard for the registration screen and the QR "Ubah email" dialog.
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
