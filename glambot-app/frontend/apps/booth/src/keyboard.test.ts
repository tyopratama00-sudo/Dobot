import { expect, test } from 'vitest';
import { KEYBOARD_ROWS, hardwareKey, pressKey, type KeyboardState } from './keyboard';

const type = (keys: string[], start: KeyboardState = { value: '', shift: false }) => keys.reduce((s, k) => pressKey(s, k), start);

type Press = { key: string; shiftKey?: boolean; ctrlKey?: boolean };
/** Type on the hardware keyboard: edits apply, every other key leaves the text as it was. */
const typeHw = (keys: (string | Press)[], start: KeyboardState = { value: '', shift: false }, max = Infinity) =>
  keys.reduce((s, k) => {
    const a = hardwareKey(s, typeof k === 'string' ? { key: k, shiftKey: k.length === 1 && k !== k.toLowerCase() } : k, max);
    return a?.type === 'edit' ? a.state : s;
  }, start);

test('hardware keyboard types only the characters the on-screen keyboard has', () => {
  expect(typeHw([...'rina_1-x.y@gmail.com']).value).toBe('rina_1-x.y@gmail.com');
  expect(typeHw([...'a!b#c$%&*()+=/\\?,;:"\'<>[]{}~`é😀d']).value).toBe('abcd');
  expect(typeHw(['a', ' ', 'b']).value).toBe('a b');
});

test('hardware Shift capitalises, and the auto capital of a name still applies', () => {
  expect(typeHw([...'Rina P']).value).toBe('Rina P');
  // Name field starts on Shift: a plain r still becomes R, then Shift releases.
  expect(typeHw([...'rina'], { value: '', shift: true }).value).toBe('Rina');
});

test('hardware Backspace deletes; Tab, Enter and Esc move between fields, submit and cancel', () => {
  expect(typeHw([...'abc', 'Backspace']).value).toBe('ab');
  const s = { value: 'a', shift: false };
  expect(hardwareKey(s, { key: 'Tab' })).toEqual({ type: 'next' });
  expect(hardwareKey(s, { key: 'Tab', shiftKey: true })).toEqual({ type: 'prev' });
  expect(hardwareKey(s, { key: 'Enter' })).toEqual({ type: 'submit' });
  expect(hardwareKey(s, { key: 'Escape' })).toEqual({ type: 'cancel' });
  for (const key of ['ArrowLeft', 'Delete', 'F1', 'Shift', 'CapsLock']) expect(hardwareKey(s, { key })).toBeNull();
});

test('hardware typing stops at the field limit and ignores ctrl shortcuts', () => {
  expect(typeHw([...'abcdef'], undefined, 5).value).toBe('abcde');
  expect(typeHw(['a', { key: 'v', ctrlKey: true }]).value).toBe('a');
});

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
