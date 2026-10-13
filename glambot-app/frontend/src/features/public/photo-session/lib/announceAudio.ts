import { playBackendAudioForce } from '@/lib/audio';

/**
 * Putar narasi instruksional sesi foto.
 *
 * Dulu fungsi ini juga POST /detection/hold untuk membekukan pengenalan gesture
 * selama narasi berbunyi. Sejak kendali gesture diganti sequence pose otomatis,
 * tidak ada lagi yang perlu dibekukan — robot bergerak menurut jadwalnya sendiri
 * dan tidak menunggu input user — jadi endpoint itu dihapus dan fungsi ini
 * tinggal pemutar audio.
 *
 * Tetap memakai `force`: narasi instruksi harus menembus narasi prioritas
 * (mis. peringatan "waktu hampir habis"), yang akan arm-ulang sendiri lewat
 * onInterrupted-nya dan menyusul di celah berikutnya.
 */
export function playAnnounce(filename: string): void {
  playBackendAudioForce(filename);
}
