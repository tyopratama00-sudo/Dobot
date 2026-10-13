import { useEffect, useState } from 'react';

/**
 * Input pencarian dengan debounce — dipakai bersama semua filter admin.
 * Nilai ketik disimpan lokal, ikut sinkron kalau `search` berubah dari luar,
 * dan `onSearchChange` dipanggil setelah `delayMs` diam.
 */
export function useDebouncedSearch(
  search: string,
  onSearchChange: (value: string) => void,
  delayMs = 300,
) {
  const [localSearch, setLocalSearch] = useState(search);
  const [lastExternalSearch, setLastExternalSearch] = useState(search);
  const isSearchPending = localSearch !== search;

  // Sinkronkan saat `search` diubah dari luar (adjust state saat render —
  // pola yang direkomendasikan React, bukan efek).
  if (search !== lastExternalSearch) {
    setLastExternalSearch(search);
    setLocalSearch(search);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  return { localSearch, setLocalSearch, isSearchPending };
}
