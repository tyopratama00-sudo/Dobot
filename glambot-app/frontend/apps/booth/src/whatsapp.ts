/**
 * Optional WhatsApp number on the registration screen. Same rule as backend
 * NormalizeWhatsApp (the backend is authoritative): spaces, dashes, dots and
 * parentheses are removed, a leading '+' is dropped, a leading 0 becomes 62,
 * and the result is 10-15 digits not starting with 0.
 */
export function normalizeWhatsApp(typed: string): string | null {
  let n = typed.replace(/[\s.()-]/g, '').replace(/^\+/, '');
  if (n.startsWith('0')) n = `62${n.slice(1)}`;
  return /^[1-9]\d{9,14}$/.test(n) ? n : null;
}

/** Empty is fine (the number is optional); anything typed must be a valid number. */
export function isValidWhatsApp(typed: string): boolean {
  return typed.trim() === '' || normalizeWhatsApp(typed) !== null;
}
