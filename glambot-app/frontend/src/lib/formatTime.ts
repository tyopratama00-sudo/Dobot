// formatTimeMMSS — format detik ke "MM:SS". Untuk nilai negatif (grace
// period saat sesi diperpanjang menunggu foto selesai) tampilkan dengan
// prefix "-" pakai nilai absolut, mis. -1 → "-00:01".
export function formatTimeMMSS(seconds: number): string {
  const isOvertime = seconds < 0;
  const abs = Math.abs(seconds);
  const minutes = Math.floor(abs / 60);
  const secs = abs % 60;
  return `${isOvertime ? '-' : ''}${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
