import { expect, test } from 'vitest';
import { canSubmitRegistration, isValidEmail } from './email';

test('email needs a local part, @ and a domain with a dot (same rule as the backend)', () => {
  for (const ok of ['rina@gmail.com', 'r.p_1-x@yahoo.co.id', 'RINA@GMAIL.COM']) expect(isValidEmail(ok)).toBe(true);
  for (const bad of ['', 'rina', 'rina@', '@gmail.com', 'rina@gmail', 'ri na@gmail.com', 'rina@@gmail.com']) expect(isValidEmail(bad)).toBe(false);
});

test('Lanjut needs a name and a valid email', () => {
  expect(canSubmitRegistration('Rina', 'rina@gmail.com')).toBe(true);
  expect(canSubmitRegistration('   ', 'rina@gmail.com')).toBe(false);
  expect(canSubmitRegistration('Rina', 'rina@gmail')).toBe(false);
  expect(canSubmitRegistration(' Rina ', ' rina@gmail.com ')).toBe(true);
});
