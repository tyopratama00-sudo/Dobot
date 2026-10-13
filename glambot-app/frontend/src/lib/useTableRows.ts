'use client';

import { useCallback, useMemo, useState } from 'react';

export type SortDir = 'asc' | 'desc';

/**
 * Seleksi baris via checkbox untuk tabel admin (frame, transaksi, recent
 * order). Set-nya selalu diganti baru supaya React melihat perubahannya.
 */
export function useRowSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  /** Centang/lepas sekelompok id sekaligus (checkbox header). */
  const toggleAll = useCallback((ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        ids.forEach((id) => next.add(id));
      } else {
        ids.forEach((id) => next.delete(id));
      }
      return next;
    });
  }, []);

  return { selectedIds, toggleRow, toggleAll };
}

/**
 * Urutkan baris tabel berdasarkan satu kolom: angka dibandingkan numerik,
 * sisanya lewat localeCompare. Nilai null/undefined dianggap string kosong
 * supaya baris tanpa data tidak melempar error.
 */
export function useSortedRows<T>(
  data: T[],
  sortKey: keyof T,
  sortDir: SortDir,
): T[] {
  return useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey] ?? '';
      const bVal = b[sortKey] ?? '';
      const cmp =
        typeof aVal === 'number' && typeof bVal === 'number'
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);
}
