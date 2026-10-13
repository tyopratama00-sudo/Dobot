import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Route guard admin (konvensi "proxy" Next.js 16, pengganti middleware).
// Nama cookie HARUS sama dengan ADMIN_TOKEN_KEY di src/lib/api-admin.ts.
const ADMIN_TOKEN_KEY = 'admin_token';

// Prefix route admin yang wajib login. /login sengaja tidak termasuk.
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/devices',
  '/frame',
  '/packages',
  '/settings',
  '/transaction',
  '/voucher',
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasToken = Boolean(req.cookies.get(ADMIN_TOKEN_KEY)?.value);

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Belum login + akses halaman admin → lempar ke /login (simpan tujuan asal).
  if (isProtected && !hasToken) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Sudah login tapi buka /login → langsung ke dashboard.
  if (pathname === '/login' && hasToken) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Jalankan di semua route halaman kecuali aset statis & API.
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon/|.*\\.).*)'],
};
