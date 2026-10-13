export function formatPriceToK(price: number): string {
  if (price >= 1000) {
    const result = price / 1000;
    return `${result}K`;
  }
  return price.toString();
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

// Format mata uang IDR lengkap dengan prefix "Rp" (mis. "Rp 45.000"), tanpa
// desimal. Sumber tunggal untuk komponen admin yang sebelumnya masing-masing
// mendeklarasikan formatCurrency identik.
export function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
}

// Tanggal ringkas gaya tabel/panel admin, mis. "28 Jul 2026". Sumber tunggal
// supaya format tanggal tidak berbeda-beda antar halaman.
export function formatDateShort(value: string | Date): string {
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// Tanggal + jam, mis. "28 Jul 2026, 21.05" — dipakai tabel & panel transaksi.
export function formatDateTimeShort(value: string | Date): string {
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
