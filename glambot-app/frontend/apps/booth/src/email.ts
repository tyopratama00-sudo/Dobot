/**
 * Email rules shared by the registration screen and (later) the QR screen "Ubah email".
 * Same rule as backend mailer.ValidAddress: a local part, '@', and a domain containing a dot.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Basic check that enables Lanjut: a non-empty name and a valid email. */
export function canSubmitRegistration(name: string, email: string): boolean {
  return name.trim().length > 0 && isValidEmail(email);
}
