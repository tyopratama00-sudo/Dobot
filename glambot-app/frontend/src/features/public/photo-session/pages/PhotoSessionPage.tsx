'use client';

import {
  SessionHeader,
  URGENT_THRESHOLD_SEC,
} from '../components/SessionHeader';
import { CameraPreview } from '../components/CameraPreview';
import EndSessionButton from '../components/EndSessionButton';
import { FaceDetectionPanel } from '../components/FaceDetectionPanel';
import { SequenceProgressPanel } from '../components/SequenceProgressPanel';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useGetSession } from '@/shared/api/session';
import {
  SESSION_HEARTBEAT_MS,
  sendSessionBroadcast,
} from '../lib/broadcastChannel';
import { disableRobot, disableRobotBeacon } from '../lib/robotPower';
import { useLiveStream } from '../api/getLivePreview';
import { useRobotConfig } from '../api/getRobotConfig';
import { useRobotDetection } from '../api/getRobotDetection';
import { apiClient } from '@/lib/api-client';
import {
  playBackendAudioPriority,
  stopBackendAudio,
  isVoiceBusy,
} from '@/lib/audio';
import { playAnnounce } from '../lib/announceAudio';
import { usePersistedCountdown } from '@/lib/usePersistedCountdown';
import { cn } from '@/lib/utils';

// Hard cap untuk grace period setelah timer 0: kalau robot stuck atau webhook
// /done tidak fire, paksa end sesi setelah ini supaya kiosk tidak hang.
const MAX_GRACE_SEC = 30;

// Floor untuk narasi "waktu foto hampir habis": ia di-arm di URGENT_THRESHOLD_SEC
// (30 dtk, sama dengan ambang timer merah) tapi WAJIB sempat bunyi selagi sisa
// waktu > floor ini. Kalau tak ketemu celah bersih sebelum floor, sengaja di-drop
// (peringatan yang telat tak berguna). Window 30→10 selebar 20 dtk — pasti memuat
// minimal satu siklus gerakan, jadi hampir selalu ada celah bersih.
const LOW_TIME_FLOOR_SEC = 10;

// Frame ala layar Preview Camera (lihat CameraPreview): ring tebal primary +
// offset + shadow biru. Dipakai agar 2 card kanan (Face Detection & Pose
// Sequence) tampil senada dengan preview.
const PREVIEW_FRAME =
  'rounded-[28px] border-0 ring-[6px] ring-primary ring-offset-2 ring-offset-transparent shadow-[0_20px_60px_-15px_rgba(63,114,175,0.45)]';

export function PhotoSessionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) router.replace('/package');
  }, [sessionId, router]);

  // Play inisiasiGJ.mp3 sekali saat halaman foto terbuka
  useEffect(() => {
    if (sessionId) playAnnounce('inisiasiGJ.mp3');
  }, [sessionId]);

  const { data: session, isFetching: isSessionFetching } = useGetSession({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  // Enable robot TEPAT saat masuk sesi foto (halaman kamera tampil). Fire
  // sekali; gate pada sesi valid agar sesi pending/expired yang akan di-redirect
  // tidak ikut menyalakan robot. Disable-nya ada di end-effect di bawah, jadi
  // enable↔disable seimbang dan dimiliki oleh halaman yang sama.
  const enableFiredRef = useRef(false);
  // Dipakai bersama end-effect & cleanup unmount agar disable robot hanya
  // dikirim SEKALI (tidak dobel) dan tidak terlewat.
  const robotDisabledRef = useRef(false);
  useEffect(() => {
    if (!sessionId || isSessionFetching || !session) return;
    if (session.status === 'pending_payment' || session.status === 'expired')
      return;
    if (enableFiredRef.current) return;
    enableFiredRef.current = true;

    apiClient.post('/api/robot/enable').catch((err) => {
      console.warn('[PhotoSession] robot/enable failed:', err);
    });
  }, [sessionId, session, isSessionFetching]);

  // Safety-net: kalau halaman ditinggalkan lewat jalur SELAIN end-flow normal
  // (tombol back browser, redirect eksternal), pastikan robot tetap dimatikan
  // saat unmount. Guard robotDisabledRef mencegah dobel dengan disable di
  // end-effect. Fire hanya bila robot memang sempat di-enable.
  //
  // `pagehide` menutup lubang terakhir: tab/jendela kiosk yang ditutup atau
  // di-refresh TIDAK menjalankan cleanup React sampai tuntas, dan XHR yang
  // sedang jalan ikut dibatalkan — jadi di situ dipakai sendBeacon.
  useEffect(() => {
    const onPageHide = () => {
      if (!enableFiredRef.current || robotDisabledRef.current) return;
      disableRobotBeacon();
    };
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('pagehide', onPageHide);
      if (enableFiredRef.current && !robotDisabledRef.current) {
        robotDisabledRef.current = true;
        void disableRobot();
      }
    };
  }, []);

  // Guard: sesi belum dibayar / kedaluwarsa di-redirect. Tunggu data FRESH
  // (jangan react saat fetching) agar cache 'pending_payment' basi tidak salah redirect.
  useEffect(() => {
    if (isSessionFetching) return;
    if (session?.status === 'pending_payment' || session?.status === 'expired') {
      router.replace('/package');
    }
  }, [session?.status, isSessionFetching, router]);

  // Timer durasi sesi dari package — kalau halaman di-refresh sisa waktu
  // dihitung dari awal sesi (bukan reset). Key null saat session belum load
  // agar storage tidak ditulis dengan durasi fallback yang salah.
  const sessionDuration = session?.durationSecs;
  const { timeLeft: sessionTimeLeft, clear: clearSessionTimer } =
    usePersistedCountdown(
      sessionId && sessionDuration != null ? `photo-session:${sessionId}` : null,
      sessionDuration ?? 300,
    );
  // Pastikan blok "session end" (broadcast + disable robot + navigate) cuma
  // fire SEKALI walaupun effect re-run akibat dep `session` (dari useGetSession)
  // refresh/refetch saat sessionTimeLeft sudah 0.
  const endFiredRef = useRef(false);
  const endTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (endTimeoutRef.current) clearTimeout(endTimeoutRef.current);
    };
  }, []);

  const {
    frameUrl,
    hasError,
    errorMessage,
    handleStreamError,
    retryStream,
  } = useLiveStream();

  // State real-time dari dobot (Flask :5001) untuk panel Face Detection:
  // liveview kamera deteksi wajah + state sequence + progress. Poll selama
  // halaman sesi foto terbuka (sesi valid). Beda dari `frameUrl` di atas yang
  // adalah preview kamera backend — panel deteksi butuh stream dobot sendiri.
  const {
    detection: robotDetection,
    reachable: robotReachable,
    streamUrl: robotStreamUrl,
  } = useRobotDetection({ enabled: !!sessionId });

  const robotFsmState = robotDetection?.fsm_state ?? 'IDLE';
  const robotFaceDetected = !!robotDetection?.face_detected;
  const robotTrackingActive = !!robotDetection?.tracking_active;
  const robotSequence = robotDetection?.sequence ?? null;
  const sequenceComplete = robotSequence?.complete ?? false;
  // Kemajuan seluruh sequence (0-100) — dipakai bar di kartu Face Detection.
  const sequencePercent = robotSequence?.percent ?? 0;

  // Sesi sedang berakhir (timer habis / user minta selesai) → jangan mulai
  // narasi/cue sesi lagi, supaya tidak ada audio yang menyambung ke layar
  // loading sebelum editor/hasil. Dibaca DI DALAM effect audio (bukan sebagai
  // dep); disinkronkan via effect di bawah.
  const endingRef = useRef(false);

  // Tidak ada lagi cue audio berbasis FSM di sini. Sejak kendali gesture
  // dihapus, narasi sesi tinggal tiga dan semuanya sudah punya pemicu sendiri:
  //  • sambutan  → inisiasiGJ.mp3, sekali saat halaman terbuka (effect di atas)
  //  • ganti pose → presetOk.mp3, dipicu CameraPreview saat current_preset naik
  //  • countdown  → tiga/dua/satu.mp3, dipicu CameraPreview dari auto_capture
  // unlock.mp3 & tahan3D.mp3 tidak lagi dipakai (keduanya milik alur unlock
  // gesture yang sudah tidak ada).

  // Safeguard: jangan akhiri sesi selama robot gerak / countdown shutter jalan
  // supaya foto terakhir tidak ke-cut. Poll 250ms (di-share dgn CameraPreview).
  // `isFetched` menahan end-effect di edge case "refresh tepat saat timer 0":
  // tanpa itu robotConfig undefined → robotBusy=false → grace check ke-skip.
  const { data: robotConfig, isFetched: robotConfigFetched } = useRobotConfig();
  // "Sedang menjepret" — dipakai untuk menukar preview besar ke liveview Canon.
  // Sengaja HANYA jendela countdown: di sequence otomatis current_preset praktis
  // selalu > 0, jadi memakainya seperti dulu akan membuat kamera deteksi tidak
  // pernah tampil sama sekali.
  const robotBusy =
    robotConfig?.auto_capture_active === true || robotFsmState === 'CAPTURING';
  // Sesi dianggap "masih dipakai" selama sequence pose belum selesai — dari
  // kamera bergerak (MOVING), menahan pose + face tracking (TRACKING), sampai
  // countdown & shutter (sudah tercakup robotBusy). Kalau timer paket habis di
  // tengah pose, sesi tidak berhenti mendadak: ia ditahan dan masuk logika grace
  // (waktu minus) sampai hard-cap MAX_GRACE_SEC.
  const robotEngaged =
    robotBusy || robotFsmState === 'MOVING' || robotFsmState === 'TRACKING';

  // Latch "capture sedang berlangsung": sekali robot engaged, tetap dianggap
  // aktif sampai robot benar-benar idle STABIL (debounce CAPTURE_SETTLE_MS).
  // Karena `robotEngaged` kini menutup SELURUH urutan capture lewat FSM
  // (termasuk MOVING & COOLDOWN), debounce ini hanya perlu menjembatani skew
  // antar-poll (fsm 150ms vs config 250ms) & celah transisi FSM sub-detik —
  // BUKAN menunggu proses simpan foto. Jadi dibuat pendek supaya begitu robot
  // balik LOCKED (capture betul-betul beres) sesi langsung selesai tanpa jeda.
  const CAPTURE_SETTLE_MS = 800;
  const [captureActive, setCaptureActive] = useState(false);
  const captureReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    if (robotEngaged) {
      if (captureReleaseTimerRef.current) {
        clearTimeout(captureReleaseTimerRef.current);
        captureReleaseTimerRef.current = null;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- latch dari state robot eksternal; butuh efek.
      setCaptureActive(true);
    } else if (!captureReleaseTimerRef.current) {
      // Robot idle → tunggu settle sebelum melepas latch (biar bukan cuma celah
      // transisi FSM sesaat). Kalau engaged lagi sebelum timer habis, timer di-
      // clear di cabang atas pada run berikutnya.
      captureReleaseTimerRef.current = setTimeout(() => {
        captureReleaseTimerRef.current = null;
        setCaptureActive(false);
      }, CAPTURE_SETTLE_MS);
    }
  }, [robotEngaged]);
  useEffect(() => {
    return () => {
      if (captureReleaseTimerRef.current)
        clearTimeout(captureReleaseTimerRef.current);
    };
  }, []);

  // Narasi "waktu foto hampir habis" — sekali saja, dijamin terdengar dengan lead
  // waktu yang berguna. Di-arm saat masuk URGENT_THRESHOLD_SEC (30 dtk, ambang
  // yang SAMA dengan timer merah) dan wajib sempat bunyi selagi sisa > FLOOR (10).
  //
  // Aturannya: narasi ini PRIORITAS terhadap cue robot BIASA (tahan), tapi
  // MENGALAH pada dua hal yang lebih penting:
  //  • Jepret (presetOk + countdown 3-2-1) = playBackendAudioForce.
  //  • Instruksi (unlock/inisiasi) = playAnnounce → juga force sekarang, supaya
  //    instruksi tak pernah ke-skip ("unlock dulu, baru peringatan").
  // Kalau salah satunya menembus, onInterrupted membuka latch → peringatan diulang
  // di celah bersih berikutnya.
  //
  // Supaya peringatan tidak (a) mulai lalu langsung dipotong, atau (b) memotong
  // instruksi yang sedang/menjelang berbunyi, ia hanya mulai saat robot TIDAK
  // engaged (captureActive false — di luar seluruh rangkaian unlock→jepret) DAN
  // channel narasi senyap (isVoiceBusy false — mis. inisiasi LOCKED belum kelar).
  // Window 30→10 cukup lebar untuk memuat satu siklus gerakan (<20s), jadi hampir
  // selalu ada celah idle-senyap sebelum floor.
  //
  // Sengaja playBackendAudioPriority: ia mengalah pada aba-aba jepret
  // (presetOk + countdown 3-2-1, yang pakai playBackendAudioForce), jadi tidak
  // pernah menimpa momen foto.
  //
  // CATATAN: dulu ini juga menunggu `captureActive` false. Dengan sequence
  // otomatis robot engaged nyaris sepanjang sesi, jadi syarat itu membuat
  // peringatan TAK PERNAH berbunyi. Kini cukup menunggu channel narasi senyap
  // (isVoiceBusy) — peringatan tetap tidak memotong narasi lain, tapi pasti
  // sempat terdengar sebelum floor.
  const lowTimeAudioFiredRef = useRef(false);
  useEffect(() => {
    if (lowTimeAudioFiredRef.current) return;
    if (
      sessionTimeLeft > URGENT_THRESHOLD_SEC ||
      sessionTimeLeft <= LOW_TIME_FLOOR_SEC
    )
      return;
    if (isVoiceBusy()) return;
    lowTimeAudioFiredRef.current = true;
    playBackendAudioPriority('habisFoto.mp3', {
      onInterrupted: () => {
        lowTimeAudioFiredRef.current = false;
      },
    });
  }, [sessionTimeLeft]);

  // Grace counter (detik) saat sessionTimeLeft sudah 0 tapi robot masih busy.
  // Dipakai untuk tampilkan timer negatif (-1, -2, ...) sebagai indikator
  // sesi diperpanjang sementara untuk merampungkan foto.
  const [graceSeconds, setGraceSeconds] = useState(0);

  // User menekan "Selesai sekarang" → percepat alur dengan men-trigger jalur
  // akhir sesi yang sama (broadcast + disable robot + navigate), termasuk
  // safeguard robot-busy & grace. Jadi end bisa terpicu oleh timer ATAU ini.
  const [endRequested, setEndRequested] = useState(false);
  // Tampilkan overlay animasi "menunggu" sebelum navigasi ke halaman berikutnya.
  const [showTransition, setShowTransition] = useState(false);

  // Sequence pose 1→10 tuntas → akhiri sesi lewat jalur yang SAMA dengan timer
  // habis / tombol "Selesai", jadi broadcast, disable robot, dan navigasi ke
  // editor/hasil tidak perlu diduplikasi. Inilah cara normal sesi berakhir
  // sekarang; timer paket tinggal jadi batas atas.
  useEffect(() => {
    if (!sequenceComplete) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dipicu state robot eksternal; butuh efek.
    setEndRequested(true);
  }, [sequenceComplete]);

  // "Sedang menuju akhir sesi" — sequence selesai, timer habis, atau user minta
  // selesai. Dipakai untuk state tombol (disabled + label "Menyelesaikan foto…").
  const endingNow = endRequested || sessionTimeLeft === 0;

  // Sinkronkan ref "sedang mengakhiri sesi" agar bisa dibaca di dalam effect
  // audio (yang sengaja tidak memasukkan endingNow ke deps supaya tak re-run).
  useEffect(() => {
    endingRef.current = endingNow;
  }, [endingNow]);

  // Heartbeat "sesi foto sedang berjalan" ke jendela lain (Monitor 2, dan
  // jendela mana pun yang masih tertinggal di Home). SESSION_START yang cuma
  // dikirim sekali dari halaman instruction tidak terdengar oleh jendela yang
  // dibuka/di-reload belakangan — dan jendela Home yang tidak tahu ada sesi
  // akan memutar ajakan "sentuh layar" menimpa narasi sesi foto. Berhenti
  // sendiri saat sesi masuk fase berakhir; SESSION_END tetap dikirim di
  // end-effect di bawah.
  useEffect(() => {
    if (!sessionId || endingNow) return;
    const beat = () => sendSessionBroadcast({ type: 'SESSION_START', sessionId });
    beat();
    const id = setInterval(beat, SESSION_HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [sessionId, endingNow]);

  // Grace tick: hanya jalan saat sessionTimeLeft sudah 0 DAN robot masih
  // dipakai (menjepret ATAU user sedang unlock). Mulai dari 1 supaya tampilan
  // langsung "-00:01" tanpa nampung "00:00" sesaat.
  useEffect(() => {
    if (!endingNow || !captureActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset counter timer grace; tak ada cara derive tanpa efek karena ada interval.
      setGraceSeconds(0);
      return;
    }
    setGraceSeconds(1);
    const id = setInterval(() => {
      setGraceSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [endingNow, captureActive]);

  const graceExpired = graceSeconds >= MAX_GRACE_SEC;
  const inGrace = endingNow && captureActive && !graceExpired;
  // Timer yang ditampilkan: negatif saat overtime (menunggu foto selesai).
  const displayTimeLeft = inGrace ? -graceSeconds : sessionTimeLeft;

  // Panel kanan (progress pose + tombol "Selesai") sekarang SELALU tampil.
  // Dulu ia disembunyikan saat robot sibuk; dengan sequence otomatis robot
  // praktis sibuk terus, jadi aturan lama akan membuatnya tidak pernah muncul —
  // padahal justru panel inilah yang memberi tahu user pose ke berapa dan
  // berapa detik lagi.
  //
  // Liveview besar bergantian: DEFAULT tampil kamera deteksi wajah (robot), lalu
  // PINDAH ke liveview Canon saat countdown 3-2-1 mulai. CameraPreview selalu
  // ter-mount di bawah supaya logika countdown/freeze tetap jalan; overlay
  // deteksi wajah yang disembunyikan.
  const showCanonPreview = robotBusy;

  useEffect(() => {
    if (!endingNow || !sessionId) return;
    // Tunggu first poll selesai dulu sebelum decide — kalau tidak, robotBusy
    // bisa false hanya karena query masih loading, dan kita lewatkan grace
    // check (mis. user refresh tepat saat sessionTimeLeft sudah 0).
    if (!robotConfigFetched) return;
    // Tahan end sesi selama SATU capture masih berlangsung — dari user unlock,
    // gerak preset, sampai robot beres capture (latch captureActive menahan lewat
    // celah transisi FSM sesaat). Baru lepas setelah robot idle stabil, atau saat
    // grace hard-cap tercapai.
    if (captureActive && !graceExpired) return;
    if (endFiredRef.current) return;
    endFiredRef.current = true;

    // Sesi benar-benar berakhir → hentikan semua narasi/cue sesi supaya tidak
    // ada audio yang menyambung ke layar loading sebelum editor/hasil.
    stopBackendAudio();

    sendSessionBroadcast({ type: 'SESSION_END', sessionId });

    // Sesi selesai → bersihkan entri timer di sessionStorage
    clearSessionTimer();

    // Sesi selesai → matikan robot. Tandai agar cleanup unmount tidak dobel.
    // disableRobot sudah punya fallback emergency stop kalau disable gagal.
    robotDisabledRef.current = true;
    void disableRobot();

    const isPrint = session?.packageCode === 'vip';
    const target = isPrint
      ? `/photo-editor?sessionId=${sessionId}`
      : `/session-end?sessionId=${sessionId}`;

    // Tampilkan loader transisi saat sesi berakhir — bagian dari rangkaian
    // side-effect akhir sesi (audio stop, broadcast, robot disable, navigasi),
    // jadi setState sinkron di sini disengaja.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowTransition(true);

    // Tampilkan dulu loading screen "Preparing…" sejenak sebelum pindah ke
    // editor/hasil — supaya transisi terasa mulus (bukan lompat mendadak). Jeda
    // dibuat pendek: cukup untuk memperlihatkan loader, tanpa terasa lama.
    // VIP: photo-editor dulu untuk pilih frame + foto, lalu session-end.
    // Digital: langsung session-end (tampil QR untuk scan di HP).
    endTimeoutRef.current = setTimeout(() => {
      router.push(target);
    }, 1200);
  }, [
    endingNow,
    sessionId,
    session,
    router,
    clearSessionTimer,
    captureActive,
    graceExpired,
    robotConfigFetched,
  ]);

  if (!sessionId) return null;

  return (
    // Kiosk fullscreen: pakai `fixed inset-0` agar halaman menempel ke viewport
    // dan LEPAS dari container `max-w-360 mx-auto` layout publik (kalau ikut
    // container, bar + preview terkunci 1440px di tengah pada layar lebar).
    // Fixed juga out-of-flow → tidak memicu scroll horizontal di container.
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <div className="px-10 pt-6 shrink-0">
        <SessionHeader sessionTimeLeft={displayTimeLeft} />
      </div>

      <main className="flex flex-1 min-h-0 gap-6 px-10 pb-6 pt-3">
        {/* Kiri — Preview Camera */}
        <div className="flex flex-1 flex-col gap-3 min-h-0 min-w-0">
          <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0 text-left">
            Preview Camera
          </h2>
          {/* Frame ring biru dipindah ke wrapper ini (bukan di CameraPreview)
              karena `overflow-hidden` — yang dibutuhkan agar panel deteksi ter-
              clip rapi saat slide keluar — akan memotong ring milik anak. Ring/
              shadow milik elemen sendiri TIDAK ikut ter-clip oleh overflow-nya. */}
          <div className="relative flex-1 min-h-0 overflow-hidden rounded-[28px] ring-[6px] ring-primary ring-offset-2 ring-offset-transparent shadow-[0_20px_60px_-15px_rgba(63,114,175,0.45)]">
            <CameraPreview
              frameUrl={frameUrl}
              sessionId={sessionId}
              hasError={hasError}
              errorMessage={errorMessage}
              onError={handleStreamError}
              onRetry={retryStream}
            />
            {/* Overlay liveview deteksi wajah — menutup preview Canon selama
                kamera bergerak & menahan pose. Begitu countdown 3-2-1 mulai
                (showCanonPreview true), overlay SLIDE keluar ke kiri → tampil
                liveview Canon (CameraPreview di bawah) untuk countdown & hasil.
                Tetap ter-mount (transform di-toggle) supaya perpindahan kamera
                mulus, bukan berkedip; di-clip oleh wrapper (overflow-hidden).
                Freeze hasil (z-50, fixed) tetap menang di atas overlay ini. */}
            <div
              className={cn(
                'absolute inset-0 z-30 rounded-[28px] overflow-hidden transition-transform duration-500 ease-in-out',
                showCanonPreview
                  ? '-translate-x-[105%] pointer-events-none'
                  : 'translate-x-0',
              )}
            >
              <FaceDetectionPanel
                streamUrl={robotStreamUrl}
                reachable={robotReachable}
                fsmState={robotFsmState}
                faceDetected={robotFaceDetected}
                trackingActive={robotTrackingActive}
                sequence={robotSequence}
                className="h-full rounded-[28px]"
              />
            </div>
          </div>
        </div>

        {/* Kanan — 2 kartu: Face Detection (bar + status wajah, ringkas) di
            atas, lalu Pose Sequence yang mengisi sisa tinggi. Selalu tampil
            selama sesi — user perlu tahu pose ke berapa dan sisa waktunya. */}
        <div className="flex w-[26rem] 2xl:w-[30rem] shrink-0 flex-col gap-4 min-h-0 animate-[slideInRight_350ms_ease-out]">
          {/* Face Detection — kartu ringkas: bar kemajuan sequence + status
              wajah/tracking. */}
          <div className="flex shrink-0 flex-col gap-3">
            <h2 className="text-primary font-medium text-2xl tracking-[0.47px]">
              Face Detection
            </h2>
            <div
              className={cn(
                'flex flex-col gap-3 bg-primary/75 px-5 py-4',
                PREVIEW_FRAME,
              )}
            >
              {/* Label progress + persen */}
              <div className="flex items-center justify-between">
                <span className="text-base font-medium text-white/80">
                  Session progress
                </span>
                <span className="text-lg font-bold tabular-nums text-white">
                  {Math.round(sequencePercent)}%
                </span>
              </div>

              {/* Bar kemajuan sequence — warna tema (blue-100) di atas track
                  gelap supaya tetap jelas. */}
              <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-blue-100 transition-all duration-200 ease-linear"
                  style={{
                    width: `${Math.max(0, Math.min(100, sequencePercent))}%`,
                  }}
                />
              </div>

              {/* Status wajah & face tracking */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/55">Face</span>
                <span className="font-medium text-white">
                  {robotFaceDetected
                    ? robotTrackingActive
                      ? 'Terkunci — kamera mengikuti'
                      : 'Terdeteksi'
                    : 'Mencari…'}
                </span>
              </div>
            </div>
          </div>

          {/* Pose Sequence — mengisi sisa tinggi kolom. Menandai pose yang sudah
              lewat, pose yang sedang berjalan (+ hitung mundur), dan sisanya. */}
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0">
              Pose Sequence
            </h2>
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col gap-4 bg-primary/75 p-5',
                PREVIEW_FRAME,
              )}
            >
              <SequenceProgressPanel
                sequence={robotSequence}
                fsmState={robotFsmState}
              />

              {/* Tombol "Selesai sekarang" — selalu tampil di bawah kartu. */}
              <EndSessionButton
                onEnd={() => setEndRequested(true)}
                ending={endingNow}
                className="w-full justify-center"
              />
            </div>
          </div>
        </div>
      </main>

      {showTransition && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center backdrop-blur-lg">
          <StatusAnimation status="processing" className="w-32 h-32" />
          <p className="mt-4 text-xl font-medium text-white/80 animate-pulse">
            Preparing your photos...
          </p>
        </div>
      )}
    </div>
  );
}
