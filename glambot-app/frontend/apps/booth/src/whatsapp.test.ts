import { expect, test } from 'vitest';
import { isValidWhatsApp, normalizeWhatsApp } from './whatsapp';
import { canSubmitRegistration } from './email';

test.each([
  ['0812-3456-7890', '6281234567890'],
  ['+62 812 3456 7890', '6281234567890'],
  ['(0812) 3456.7890', '6281234567890'],
  ['6281234567890', '6281234567890'],
  ['+1 (415) 555-2671', '14155552671'],
])('%s is normalised to %s, as the backend stores it', (typed, stored) => {
  expect(normalizeWhatsApp(typed)).toBe(stored);
});

test.each(['0812345', '62812345678901234', '0812abc34567', '--', '+62 812 34', '08123456789/1'])('%s is not a WhatsApp number', (typed) => {
  expect(normalizeWhatsApp(typed)).toBeNull();
  expect(isValidWhatsApp(typed)).toBe(false);
});

test('the number is optional: empty is valid', () => {
  expect(isValidWhatsApp('')).toBe(true);
  expect(isValidWhatsApp('  ')).toBe(true);
});

test('Lanjut needs a valid or empty WhatsApp number on top of name and email', () => {
  expect(canSubmitRegistration('Rina', 'rina@gmail.com', '')).toBe(true);
  expect(canSubmitRegistration('Rina', 'rina@gmail.com', '081234567890')).toBe(true);
  expect(canSubmitRegistration('Rina', 'rina@gmail.com', '0812')).toBe(false);
  expect(canSubmitRegistration('', 'rina@gmail.com', '081234567890')).toBe(false);
});
