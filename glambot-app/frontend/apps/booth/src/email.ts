/**
 * Email rules shared by the registration screen and (later) the QR screen "Ubah email".
 * Same rule as backend mailer.ValidAddress: a local part, '@', and a domain containing a dot.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Domains worth correcting a typo towards. */
const COMMON_DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.co.id', 'hotmail.com', 'outlook.com', 'icloud.com'];
/** Real domains one typo away from a common one: never "correct" them. */
const KNOWN_DOMAINS = new Set(['mail.com', 'ymail.com', 'gmx.com']);
/** Most edits a domain may be from a common one to count as a likely typo. */
const MAX_EDITS = 2;

/** Edit distance where swapping two neighbouring letters ("gmial") counts as one edit. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * "Maksudmu @gmail.com?": the address with its domain swapped for the closest
 * common domain, when the typed domain is a likely typo of one. Null for a
 * correct, unknown or unfinished address.
 */
export function suggestEmail(email: string): string | null {
  const m = /^([^\s@]+)@([^\s@]+)$/.exec(email.trim());
  if (!m) return null;
  const [, local, typed] = m;
  const domain = typed.toLowerCase();
  if (COMMON_DOMAINS.includes(domain) || KNOWN_DOMAINS.has(domain)) return null;
  let best: string | null = null;
  let bestEdits = MAX_EDITS + 1;
  for (const c of COMMON_DOMAINS) {
    const edits = editDistance(domain, c);
    if (edits < bestEdits) [best, bestEdits] = [c, edits];
  }
  return best ? `${local}@${best}` : null;
}

/** Basic check that enables Lanjut: a non-empty name and a valid email. */
export function canSubmitRegistration(name: string, email: string): boolean {
  return name.trim().length > 0 && isValidEmail(email);
}
