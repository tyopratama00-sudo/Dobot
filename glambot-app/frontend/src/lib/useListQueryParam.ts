'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Setter satu parameter URL untuk halaman daftar admin (frame, paket, voucher,
 * transaksi). Aturannya sama di semua halaman itu, jadi ditulis sekali di sini:
 *   - nilai kosong atau 'all' menghapus paramnya (bukan menyimpan "all"),
 *   - perubahan apa pun selain `page` mengembalikan paginasi ke halaman 1,
 *   - navigasi pakai `replace` supaya filter tidak menumpuk di history.
 */
export function useListQueryParam(basePath: string) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== 'all' && value !== '') {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      if (key !== 'page') params.set('page', '1');
      router.replace(`${basePath}?${params.toString()}`);
    },
    [basePath, router, searchParams],
  );
}
