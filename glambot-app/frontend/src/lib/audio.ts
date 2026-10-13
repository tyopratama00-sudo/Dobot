import { resolveBaseUrl } from '@/lib/api-client';

const audioCache = new Map<string, HTMLAudioElement>();

// Clip narasi yang sedang berbunyi — dipakai untuk menunggu satu narasi selesai
// sebelum memutar yang berikutnya (satu "channel" suara).
let currentVoice: HTMLAudioElement | null = null;

function getAudio(filename: string): HTMLAudioElement {
  let audio = audioCache.get(filename);
  if (!audio) {
    audio = new Audio(`${resolveBaseUrl()}/storage/audio/${filename}`);
    audio.preload = 'auto';
    audioCache.set(filename, audio);
  }
  return audio;
}

// Semua narasi yang dipreload sekali di awal supaya play pertama tanpa jeda.
export const BACKEND_AUDIO_FILES = [
  // Home & paket
  'mulai.mp3',
  'selamatDatang.mp3',
  'jumlahCetak.mp3',
  // Pembayaran (termasuk hasil pemakaian voucher)
  'voucherBerhasil.mp3',
  'voucherGagal.mp3',
  'pembayaranDiproses.mp3',
  'pembayaranBerhasil.mp3',
  'pembayaranGagal.mp3',
  // Instruksi step 1 → 3 (tiap step punya rangkaian narasi, lihat
  // InstructionPage STEP_CUES)
  'introDengar.mp3',
  'waktuSesi.mp3',
  'infoSingkat.mp3',
  'keselamatanNoM.mp3',
  'deteksiSatu.mp3',
  'infoPreset.mp3',
  'pilGesture.mp3',
  'pilAcam.mp3',
  // Sesi foto
  'inisiasiGJ.mp3',
  'tahan3D.mp3',
  'unlock.mp3',
  'presetOk.mp3',
  'satu.mp3',
  'dua.mp3',
  'tiga.mp3',
  // Tutorial editor foto (step 1 → 5)
  'sentuhFrame.mp3',
  'seretFoto.mp3',
  'seretZoom.mp3',
  'filter.mp3',
  'pilihCetakFoto.mp3',
  // Layar hasil
  'fotoProses.mp3',
  'scanQr.mp3',
  'terimakasih.mp3',
  // Peringatan waktu menipis: habisEdit = editor foto (15 dtk terakhir),
  // habisFoto = sesi foto (20 dtk terakhir).
  'habisEdit.mp3',
  'habisFoto.mp3',
];

/** Preload audio ke cache tanpa memutarnya — aman sebelum interaksi user. */
export function preloadBackendAudio(
  filenames: string[] = BACKEND_AUDIO_FILES,
): void {
  if (typeof window === 'undefined') return;
  for (const filename of filenames) {
    const audio = getAudio(filename);
    try {
      audio.load();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Narasi PRIORITAS: selama clip ini berbunyi, `playBackendAudio` biasa
 * DILEWATI (bukan diantre — cue robot real-time, telat malah menyesatkan).
 * Hanya `playBackendAudioForce` (countdown jepret) yang boleh menembus, dan
 * saat itu `onInterrupted` dipanggil supaya pemanggil bisa menjadwal ulang.
 */
let priorityVoice: HTMLAudioElement | null = null;
let priorityInterrupted: (() => void) | null = null;

const clearPriority = () => {
  priorityVoice = null;
  priorityInterrupted = null;
};

/**
 * Jadwal `playBackendAudioAfterCurrent` yang masih menunggu narasi sekarang
 * selesai. Disimpan di modul supaya BISA DIBATALKAN — dulu `setTimeout`
 * pengamannya tidak pernah dilepas, jadi narasi halaman sebelumnya (mis.
 * "intro" dari instruction) bisa tiba-tiba nyala di halaman sesi foto sampai
 * beberapa detik setelah user pindah.
 */
let pendingAfterCurrent: (() => void) | null = null;

const cancelPendingAfterCurrent = () => {
  const cancel = pendingAfterCurrent;
  pendingAfterCurrent = null;
  cancel?.();
};

/**
 * Ada narasi prioritas yang sedang dilindungi? Dibaca dari latch
 * `priorityVoice`, bukan `audio.paused` — `play()` asinkron jadi clip sempat
 * berstatus paused dan cue di jeda itu bisa lolos menyela.
 */
export function isPriorityAudioPlaying(): boolean {
  return priorityVoice !== null;
}

/**
 * Ada suara apa pun di channel? Dipakai narasi "boleh mengalah" (mis.
 * peringatan waktu) supaya hanya bunyi saat senyap. Beda dari
 * isPriorityAudioPlaying: ini melihat suara aktual.
 */
export function isVoiceBusy(): boolean {
  return !!currentVoice && !currentVoice.paused && !currentVoice.ended;
}

/**
 * Putar clip dari `/storage/audio/` (Audio element di-cache, gagal diam-diam
 * saat autoplay block / file hilang). `onEnded` selalu dipanggil, termasuk
 * saat play() gagal atau event 'ended' tak fire.
 *
 * Return `false` kalau cue dilewati karena ada narasi prioritas — pemanggil
 * dengan efek samping lain (mis. playAnnounce untuk narasi instruksional)
 * WAJIB mengeceknya.
 */
export function playBackendAudio(
  filename: string,
  onEnded?: () => void,
): boolean {
  if (typeof window === 'undefined') return false;
  const audio = getAudio(filename);

  // Ada narasi prioritas berbunyi → jangan potong; lewati cue ini. onEnded
  // tetap dipanggil supaya pemanggil yang memakainya sebagai gate tidak hang.
  if (audio !== priorityVoice && isPriorityAudioPlaying()) {
    onEnded?.();
    return false;
  }

  playAudioElement(audio, onEnded);
  return true;
}

/**
 * Putar narasi PRIORITAS. `onInterrupted` dipanggil kalau ditembus
 * `playBackendAudioForce`, supaya pemanggil bisa memutarnya ulang nanti.
 */
export function playBackendAudioPriority(
  filename: string,
  opts?: { onEnded?: () => void; onInterrupted?: () => void },
): void {
  if (typeof window === 'undefined') return;
  const audio = getAudio(filename);
  priorityVoice = audio;
  priorityInterrupted = opts?.onInterrupted ?? null;

  playAudioElement(audio, () => {
    if (priorityVoice === audio) clearPriority();
    opts?.onEnded?.();
  });
}

/**
 * Putar narasi yang BOLEH menembus prioritas — khusus rangkaian jepret foto
 * (countdown auto-capture & konfirmasi preset).
 */
export function playBackendAudioForce(
  filename: string,
  onEnded?: () => void,
): void {
  if (typeof window === 'undefined') return;

  // Beri tahu clip prioritas bahwa ia terpotong, lalu lepas proteksinya.
  if (isPriorityAudioPlaying() && getAudio(filename) !== priorityVoice) {
    const notify = priorityInterrupted;
    clearPriority();
    notify?.();
  } else {
    clearPriority();
  }

  playAudioElement(getAudio(filename), onEnded);
}

/** Mesin pemutar bersama — dipakai ketiga varian di atas. */
function playAudioElement(
  audio: HTMLAudioElement,
  onEnded?: () => void,
): void {
  // "Terbaru menang" juga berlaku untuk yang MASIH DIJADWALKAN: begitu ada
  // narasi baru diputar, antrean after-current lama dibatalkan supaya tidak
  // menyusul di halaman yang sudah berbeda konteksnya.
  cancelPendingAfterCurrent();

  // Satu channel narasi: hentikan voice yang sedang berbunyi (kalau beda clip)
  // supaya dua narasi tidak menumpuk. "Terbaru menang" — cocok untuk cue
  // real-time robot yang statenya berganti cepat. Clip yang sama cukup di-rewind.
  if (currentVoice && currentVoice !== audio && !currentVoice.paused) {
    try {
      currentVoice.pause();
      currentVoice.currentTime = 0;
    } catch {
      /* ignore */
    }
  }

  try {
    audio.currentTime = 0;
  } catch {
    /* ignore */
  }
  currentVoice = audio;

  if (onEnded) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      audio.removeEventListener('ended', finish);
      onEnded();
    };
    audio.addEventListener('ended', finish, { once: true });
    // Pengaman kalau 'ended' tak fire: pakai durasi clip + margin, fallback 8s.
    const fallbackMs =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration * 1000 + 500
        : 8000;
    window.setTimeout(finish, fallbackMs);
    audio.play().catch(finish);
    return;
  }

  audio.play().catch(() => {
    /* autoplay blocked or load error — silent */
  });
}

/**
 * Hentikan SATU clip saja (kalau memang sedang berbunyi) — dipakai saat pemicu
 * narasinya ditutup lebih cepat dari suaranya, mis. tombol Skip di tutorial
 * editor. Sengaja bukan `stopBackendAudio`: narasi lain yang tidak ada
 * hubungannya (mis. peringatan waktu editor) tidak boleh ikut terpotong.
 */
export function stopBackendAudioFile(filename: string): void {
  if (typeof window === 'undefined') return;
  const audio = audioCache.get(filename);
  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    /* ignore */
  }
  if (currentVoice === audio) currentVoice = null;
  // Clip ini kebetulan yang sedang dilindungi → lepas latch-nya, kalau tidak
  // semua narasi berikutnya ikut terblokir.
  if (priorityVoice === audio) clearPriority();
}

/**
 * Hentikan SEMUA audio & reset ke awal (menyapu seluruh cache, bukan cuma
 * `currentVoice`). Dipakai saat sesi berakhir supaya suara sesi tidak
 * menyambung ke halaman berikutnya.
 */
export function stopBackendAudio(): void {
  if (typeof window === 'undefined') return;
  // Termasuk narasi yang baru DIJADWALKAN tapi belum sempat bunyi — kalau
  // tidak, ia tetap menyusul beberapa detik kemudian di halaman berikutnya.
  cancelPendingAfterCurrent();
  for (const audio of audioCache.values()) {
    try {
      if (!audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    } catch {
      /* ignore */
    }
  }
  currentVoice = null;
  // Lepas proteksi juga — kalau tidak, clip prioritas yang baru saja dihentikan
  // akan terus memblokir semua narasi di halaman berikutnya.
  clearPriority();
}

/**
 * Jalankan `cb` saat narasi selesai (atau langsung kalau senyap); return
 * cleanup untuk membatalkan. `currentVoice` bertahan lintas navigasi SPA, jadi
 * halaman berikutnya bisa menunggu narasi halaman sebelumnya.
 */
export function whenVoiceIdle(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const v = currentVoice;
  if (!v || v.paused || v.ended) {
    cb();
    return () => {};
  }

  let done = false;
  let timer = 0;
  const finish = () => {
    if (done) return;
    done = true;
    v.removeEventListener('ended', finish);
    window.clearTimeout(timer);
    cb();
  };

  v.addEventListener('ended', finish, { once: true });
  const remainingMs =
    Number.isFinite(v.duration) && v.duration > 0
      ? Math.max(0, (v.duration - v.currentTime) * 1000) + 500
      : 8000;
  timer = window.setTimeout(finish, remainingMs);

  return () => {
    if (done) return;
    done = true;
    v.removeEventListener('ended', finish);
    window.clearTimeout(timer);
  };
}

/**
 * Putar SETELAH narasi sekarang selesai — cegah dua narasi bertabrakan.
 *
 * Jadwalnya BISA dibatalkan (lihat `pendingAfterCurrent`): kalau ada narasi
 * lain diputar duluan, atau `stopBackendAudio` dipanggil saat pindah halaman,
 * clip ini batal — bukan menyusul di layar yang sudah lain.
 */
export function playBackendAudioAfterCurrent(
  filename: string,
  onEnded?: () => void,
): void {
  if (typeof window === 'undefined') return;

  const prev = currentVoice;
  const next = getAudio(filename);

  // Tidak ada yang berbunyi (atau clip yang sama) → langsung mainkan.
  if (!prev || prev === next || prev.paused || prev.ended) {
    playBackendAudio(filename, onEnded);
    return;
  }

  // Antrean sebelumnya (kalau ada) kalah dari yang ini.
  cancelPendingAfterCurrent();

  let settled = false;
  let timer = 0;
  const detach = () => {
    settled = true;
    prev.removeEventListener('ended', start);
    window.clearTimeout(timer);
  };
  const start = () => {
    if (settled) return;
    detach();
    // Lepas dulu supaya playAudioElement di dalam playBackendAudio tidak
    // membatalkan jadwal ini sendiri.
    pendingAfterCurrent = null;
    playBackendAudio(filename, onEnded);
  };

  prev.addEventListener('ended', start, { once: true });

  // Pengaman kalau 'ended' tak fire: tetap mainkan setelah durasi wajar.
  const remainingMs =
    Number.isFinite(prev.duration) && prev.duration > 0
      ? Math.max(0, (prev.duration - prev.currentTime) * 1000) + 300
      : 6000;
  timer = window.setTimeout(start, remainingMs);

  pendingAfterCurrent = () => {
    if (settled) return;
    detach();
  };
}
