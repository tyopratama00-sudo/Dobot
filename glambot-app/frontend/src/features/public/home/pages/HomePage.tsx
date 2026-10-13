'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { playBackendAudio, stopBackendAudio } from '@/lib/audio';
import { resolveRobotUrl } from '@/lib/api-client';
import {
  SESSION_HEARTBEAT_MS,
  listenSessionBroadcast,
} from '@/features/public/photo-session/lib/broadcastChannel';

// Cadence ulang ajakan "mulai" (ms).
const LOOP_INTERVAL_MS = 5_000;
// Seberapa sering cek presence ke robot (ms). Presence tak perlu serapat deteksi.
const PRESENCE_POLL_MS = 1_000;
// Sesi dianggap sudah berakhir kalau heartbeat-nya hilang selama ini. Longgar
// (>2× cadence) supaya satu heartbeat yang telat tidak bikin ajakan menyela.
const SESSION_HEARTBEAT_TIMEOUT_MS = SESSION_HEARTBEAT_MS * 3;

export default function Home() {
  const router = useRouter();

  // Ajakan "mulai" hanya berbunyi saat ADA gerakan di depan kamera deteksi
  // (endpoint /presence robot), supaya ruangan kosong tidak berisik. Ruangan
  // kosong → tidak ada yang diputar (diam). Ada orang → putar tiap 5s; putaran
  // PERTAMA langsung berbunyi karena lastPlay awal 0 (sudah lewat interval).
  // Throttle ini juga bikin aman dari spam saat orang keluar-masuk cepat atau
  // robot flapping. Play bisa kena autoplay block browser sampai ada interaksi —
  // playBackendAudio menelan error itu diam-diam.
  //
  // Fail-safe: kalau robot tak terjangkau (proses mati / jaringan putus), jatuh
  // ke perilaku lama (loop terus) supaya kiosk tidak malah BISU karena gangguan.
  //
  // BISU SELAMA SESI FOTO. Ini penting: presence membaca kamera deteksi, dan
  // selama sesi foto user justru BERDIRI PERSIS di depan kamera itu — jadi
  // presence selalu true. Kalau jendela ini masih terbuka di belakang (mis.
  // monitor kedua yang lupa dipindah ke /photo-session/control, atau tab lama
  // yang tak ditutup), ajakan "sentuh layar" akan menyela sesi foto tiap 5
  // detik — persis keluhan "tiba-tiba ada audio mulai di sesi foto".
  //
  // Statusnya dibaca dari heartbeat SESSION_START yang dipancarkan halaman
  // sesi foto tiap beberapa detik (bukan sekali di awal), jadi jendela yang
  // baru dibuka / di-reload di TENGAH sesi pun ikut bisu. Sesi dianggap habis
  // saat SESSION_END datang ATAU heartbeat berhenti.
  useEffect(() => {
    const robotUrl = resolveRobotUrl();
    let cancelled = false;
    let busy = false;
    let lastPlay = 0;
    let lastHeartbeat = 0;

    const sessionActive = () =>
      lastHeartbeat > 0 &&
      Date.now() - lastHeartbeat < SESSION_HEARTBEAT_TIMEOUT_MS;

    const unsubscribe = listenSessionBroadcast({
      onStart: () => {
        const wasIdle = !sessionActive();
        lastHeartbeat = Date.now();
        // Ajakan yang mungkin sedang berbunyi ikut dihentikan, jangan biarkan
        // penggalannya menimpa narasi sesi foto.
        if (wasIdle) stopBackendAudio();
      },
      onEnd: () => {
        lastHeartbeat = 0;
      },
    });

    const play = () => {
      playBackendAudio('mulai.mp3');
      lastPlay = Date.now();
    };
    const playThrottled = () => {
      if (sessionActive()) return;
      if (Date.now() - lastPlay >= LOOP_INTERVAL_MS) play();
    };

    const tick = async () => {
      if (busy) return;
      if (sessionActive()) return;
      busy = true;
      try {
        const res = await fetch(`${robotUrl}/presence`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { present?: boolean };
        if (cancelled) return;
        // Ada gerakan → putar (throttle 5s). Kosong → diam, tak ada yang diputar.
        if (data.present) playThrottled();
      } catch {
        // Robot tak terjangkau → fallback ke loop terus (perilaku lama).
        if (cancelled) return;
        playThrottled();
      } finally {
        busy = false;
      }
    };

    tick();
    const id = window.setInterval(tick, PRESENCE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsubscribe();
    };
  }, []);

  // Sentuh di mana pun pada halaman → lanjut ke /package. Sapaan diputar saat
  // tap — interaksi user ini sekaligus meng-"unlock" autoplay browser untuk
  // suara di halaman berikutnya.
  const handleStart = () => {
    // Hentikan undangan "mulai" yang mungkin sedang loop dulu, supaya salam
    // tidak menabrak potongan kata undangan (transisi suara bersih).
    stopBackendAudio();
    playBackendAudio('selamatDatang.mp3');
    router.push('/package');
  };

  return (
    // `fixed inset-0` (bukan `min-h-full`) supaya area tap benar-benar seluruh
    // layar: layout publik membungkus halaman dalam container `max-w-360`
    // (1440px), jadi di layar kiosk yang lebih lebar ada pita mati di kiri &
    // kanan yang tidak memicu tap — padahal konsepnya "tap anywhere to start".
    // Dengan fixed, <main> lepas dari container dan menempel ke viewport (pola
    // yang sama sudah dipakai PhotoSessionPage).
    <main
      onClick={handleStart}
      className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer select-none"
    >
      <div className="flex flex-col items-center animate-float-y">
        <p className="text-primary text-[34px] tracking-[13px]">Experience The</p>

        <h1 className="mt-5 font-changa text-[210px] leading-[0.9] font-black gradient-text">
          GLAMBOT
        </h1>

        <p className="mt-5 text-[#2b4260] text-[32px] font-medium tracking-[4px]">
          The camera finds your face and poses for you
        </p>
      </div>

      {/* Target sentuh menggantikan tombol "Tap to Start": cincin riak yang
          memuai keluar dari titik inti. Seluruh halaman tetap bisa di-tap, ini
          murni petunjuk visual (pointer-events-none). */}
      <div className="mt-10 flex flex-col items-center pointer-events-none">
        <div className="relative flex items-center justify-center w-44 h-44">
          {/* Cincin riak berlapis — delay berbeda supaya mengalir terus. Ring
              yang masih menunggu delay TIDAK lagi tampil pekat/solid di awal:
              animasi pakai fill-mode `backwards` (lihat --animate-tap-ring),
              jadi selama delay ring mengikuti keyframe 0% (opacity 0). */}
          {[0, 0.8, 1.6].map((delay) => (
            <span
              key={delay}
              className="absolute inset-0 rounded-full border-4 border-primary/40 animate-tap-ring"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}

          {/* Titik inti yang berdenyut halus. */}
          <div className="w-18 h-18 rounded-full gradient-primary shadow-[0_0_40px_10px_rgba(17,45,78,0.25)] animate-pulse-glow" />
        </div>
      </div>
    </main>
  );
}
