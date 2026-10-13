import { apiClient, resolveBaseUrl } from '@/lib/api-client';

/**
 * Matikan robot di akhir sesi foto.
 *
 * Robot yang gagal dimatikan artinya lengan masih bisa bergerak padahal tidak
 * ada sesi dan tidak ada yang mengawasi — jadi kegagalan di sini TIDAK boleh
 * ditelan diam-diam (dulu `.catch(() => {})`). Backend sendiri sudah mencoba
 * ulang beberapa kali sebelum membalas error, jadi di sini cukup satu jaring
 * tambahan: emergency stop.
 */
export async function disableRobot(): Promise<void> {
  try {
    await apiClient.post('/api/robot/disable');
    return;
  } catch (err) {
    console.warn('[PhotoSession] robot/disable gagal:', err);
  }

  try {
    await apiClient.post('/api/robot/stop');
    console.warn('[PhotoSession] robot dihentikan lewat emergency stop');
  } catch (err) {
    console.error(
      '[PhotoSession] robot/stop juga gagal — robot mungkin MASIH AKTIF, cek fisik:',
      err,
    );
  }
}

/**
 * Jaring terakhir saat tab/jendela kiosk ditutup atau di-refresh: request XHR
 * biasa bisa ikut dibatalkan saat halaman dibongkar, `sendBeacon` tidak.
 * Fire-and-forget — responsnya memang tidak bisa dibaca.
 */
export function disableRobotBeacon(): void {
  if (typeof navigator === 'undefined' || !navigator.sendBeacon) return;
  try {
    navigator.sendBeacon(`${resolveBaseUrl()}/api/robot/disable`);
  } catch {
    /* halaman sedang dibongkar — tidak ada lagi yang bisa dilakukan */
  }
}
