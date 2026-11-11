import { expect, test } from 'vitest';
import { KEYBOARD_ROWS, pressKey, type KeyboardState } from './keyboard';

const type = (keys: string[], start: KeyboardState = { value: '', shift: false }) => keys.reduce((s, k) => pressKey(s, k), start);

test('letters are lowercase; Shift capitalises the next letter only', () => {
  expect(type(['shift', 'r', 'i', 'n', 'a', 'space', 'shift', 'p']).value).toBe('Rina P');
  expect(type(['shift', 'shift', 'a']).value).toBe('a');
});

test('backspace removes the last character', () => {
  expect(type(['a', 'b', 'backspace']).value).toBe('a');
  expect(type(['backspace']).value).toBe('');
});

test('email keys and shortcuts type whole pieces', () => {
  expect(type(['r', '_', '1', '-', 'x', '.', 'y', '@gmail.com']).value).toBe('r_1-x.y@gmail.com');
  expect(type(['a', '@yahoo.com']).value).toBe('a@yahoo.com');
  expect(type(['a', '@', 'b', '.com']).value).toBe('a@b.com');
});

test('typing stops at the field limit', () => {
  expect(pressKey({ value: 'abc', shift: false }, '@gmail.com', 5).value).toBe('abc');
  expect(pressKey({ value: 'abcd', shift: false }, 'e', 5).value).toBe('abcde');
});

test('the layout has digits, lowercase letters, @ . _ - and the shortcut keys', () => {
  const keys = KEYBOARD_ROWS.flat();
  for (const k of [...'1234567890qwertyuiopasdfghjklzxcvbnm', '@', '.', '_', '-', 'shift', 'space', 'backspace', '@gmail.com', '@yahoo.com', '.com'])
    expect(keys).toContain(k);
});
