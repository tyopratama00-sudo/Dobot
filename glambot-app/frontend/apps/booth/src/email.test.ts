import { expect, test } from 'vitest';
import { canSubmitRegistration, isValidEmail, suggestEmail } from './email';

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

test('a mistyped common domain gets a one-tap correction', () => {
  expect(suggestEmail('rina@gmial.com')).toBe('rina@gmail.com');
  expect(suggestEmail('rina@gmail.con')).toBe('rina@gmail.com');
  expect(suggestEmail('rina@gmailcom')).toBe('rina@gmail.com');
  expect(suggestEmail('rina@yaho.com')).toBe('rina@yahoo.com');
  expect(suggestEmail('rina@yahoo.co.di')).toBe('rina@yahoo.co.id');
  expect(suggestEmail('rina@hotmial.com')).toBe('rina@hotmail.com');
  expect(suggestEmail('rina@outlok.com')).toBe('rina@outlook.com');
  expect(suggestEmail('rina@iclod.com')).toBe('rina@icloud.com');
  expect(suggestEmail(' Rina@GMAIL.CON ')).toBe('Rina@gmail.com');
});

test('no suggestion for a correct, unknown or unfinished address', () => {
  for (const ok of ['rina@gmail.com', 'rina@yahoo.com', 'rina@yahoo.co.id', 'rina@hotmail.com', 'rina@outlook.com', 'rina@icloud.com']) {
    expect(suggestEmail(ok)).toBeNull();
  }
  for (const other of ['rina@ui.ac.id', 'rina@telkom.net', 'rina@mail.com', 'rina@ymail.com', 'rina@live.com', 'rina@kantor.co.id']) {
    expect(suggestEmail(other)).toBeNull();
  }
  for (const unfinished of ['', 'rina', 'rina@', '@gmial.com', 'rina@g', 'ri na@gmial.com']) expect(suggestEmail(unfinished)).toBeNull();
});
