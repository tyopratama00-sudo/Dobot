# Glambot Photo Booth

Aplikasi photo booth kiosk dengan integrasi robot kamera + auto-capture berbasis gesture/preset. Kamera memakai **Canon DSLR** via [digiCamControl](https://digicamcontrol.com/). Dilengkapi **dashboard admin** untuk kelola frame, paket, voucher, transaksi, dan perangkat — semua data bisa diedit dari UI tanpa sentuh database.

---

## Daftar Isi

1. [Update Terbaru](#update-terbaru)
2. [Arsitektur](#arsitektur)
3. [Tech Stack](#tech-stack)
4. [Prerequisites](#prerequisites)
5. [Instalasi](#instalasi)
6. [Konfigurasi Environment](#konfigurasi-environment)
7. [Setup Database](#setup-database)
8. [Menjalankan Aplikasi](#menjalankan-aplikasi)
9. [Admin Dashboard](#admin-dashboard)
10. [Production Build](#production-build)
11. [Struktur Project](#struktur-project)
12. [Skema Database](#skema-database)
13. [API Endpoints](#api-endpoints)
14. [User Flow](#user-flow)
15. [Integrasi Robot](#integrasi-robot)
16. [Mode Kamera](#mode-kamera)
17. [Audio Cues](#audio-cues)
18. [Animated GIF Output](#animated-gif-output)
19. [Safeguard Sesi Foto](#safeguard-sesi-foto)
20. [Testing dengan curl](#testing-dengan-curl)
21. [Troubleshooting](#troubleshooting)

---

## Update Terbaru

Ringkasan perubahan terbaru (per Juli 2026):

### Set narasi baru + narasi bertahap di halaman intro & tutorial editor (baru)

Seluruh voice-over diganti ke rekaman baru; isi `backend/storage/audio/` sekarang **hanya** file set baru (nama lama seperti `intro.mp3`, `presetSlow.mp3`, `presetTerkonfirmasi.mp3`, `waktuHabis*.mp3` sudah dihapus, `pilihFoto.mp3` tidak dipakai lagi). Daftar lengkap + trigger-nya ada di [Audio Cues](#audio-cues).

Yang berubah lebih dari sekadar nama file:

- **Tiap step instruksi kini punya rangkaian narasi**, bukan satu clip. Urutannya didefinisikan di `STEP_CUES` ([`InstructionPage.tsx`](frontend/src/features/public/instruction/pages/InstructionPage.tsx)) dan diputar berantai lewat callback `onEnded` — clip berikutnya baru mulai setelah yang sekarang benar-benar selesai. Tombol *Next* baru muncul setelah **seluruh** rangkaian habis.
- **Sorotan mengikuti suara.** Selama sebuah cue berbunyi, bagian kartu yang sedang dibicarakan maju ke depan (scale + ring) dan sisanya diredupkan — ring durasi saat `waktuSesi`, tiga kartu info (berurutan, delay bertingkat) saat `infoSingkat`, baris "only one person's hand" saat `deteksiSatu`, kartu gesture lalu panggung kamera saat `pilGesture`/`pilAcam`. Implementasinya `spotlight()` di [`InstructionCards.tsx`](frontend/src/features/public/instruction/components/InstructionCards.tsx).
- **Tutorial editor foto bersuara**: tiap step [`PhotoEditorOnboarding`](frontend/src/features/public/photo-editor/components/PhotoEditorOnboarding.tsx) punya narasinya sendiri (step 1–5), menggantikan satu narasi "pilih foto" saat editor terbuka. Tombol *Next* baru muncul setelah narasi step itu habis; **putaran pertama tidak punya tombol Skip** dan tidak bisa ditutup lewat tap-di-luar/Escape (`onInteractOutside`/`onEscapeKeyDown` di-preventDefault) — Skip baru tersedia kalau user membuka ulang tutorial dari tombol bantuan, dan tiap dibuka ulang selalu mulai lagi dari step 1.
- **Voucher bersuara**: hasil apply voucher di summary memutar `voucherBerhasil`/`voucherGagal` ([`useVoucher.ts`](frontend/src/features/public/payment/hooks/useVoucher.ts)). Kode salah tetap balik HTTP 200 dengan `valid:false`, jadi cabangnya dari `result.valid` — bukan `onError`.
- **Jendela hold deteksi ikut disesuaikan** dengan panjang file baru (unlock 3.31s, inisiasiGJ 2.57s): `ANNOUNCE_HOLD_SEC` di [`announceAudio.ts`](frontend/src/features/public/photo-session/lib/announceAudio.ts) → 3.8 / 3.0, dan default `UNLOCK_ANNOUNCE_SEC` / `LOCKED_ANNOUNCE_SEC` di [`dobot/app/config.py`](dobot/app/config.py) disamakan. Kalau file audio diganti lagi, **dua tempat ini harus ikut diubah** — kalau tidak, robot melepas deteksi sebelum narasi selesai.

### Perbaikan: preview blank hitam setelah jepretan pertama — liveview balik ke polling per frame (baru)

Gejalanya: foto pertama mulus, sesudah itu Preview Camera hitam sampai sesi habis. Penyebabnya penggantian ke **satu koneksi MJPEG** di rilis sebelumnya:

- `StreamLiveView` menutup koneksi setelah "20 kegagalan beruntun" — komentar bilang ±10 detik, tapi itu angka warisan versi lama yang `sleep 500ms`; loop barunya tick 100 ms jadi nyatanya cuma **±2 detik**, lebih pendek dari satu window capture (tunggu file full-res sampai 6 detik). Praktis stream mati di tengah **setiap** jepretan.
- Setelah 3× reconnect gagal, `useLiveStream` menyetel `hasError` yang mengosongkan `frameUrl` → `<img>` di-unmount → tak ada lagi yang mencoba menyambung. Preview mati permanen sampai user menekan *Try again* — yang di kiosk tidak pernah terjadi.

Perbaikannya: **kembali ke logika liveview `be full 12.5`** yang terbukti jalan normal — polling JPEG per frame `GET /api/robot/liveview` (~10 fps) yang digambar ke `<canvas>` ([`CameraPreview`](frontend/src/features/public/photo-session/components/CameraPreview.tsx) + [`getLivePreview.ts`](frontend/src/features/public/photo-session/api/getLivePreview.ts)). Bedanya mendasar: tiap frame adalah request yang **berdiri sendiri**, jadi frame yang gagal saat digiCam sibuk menjepret cukup dilewati dan frame berikutnya jalan lagi — tidak ada koneksi panjang yang sekali mati tak bisa pulih. Error UI baru muncul setelah ±20 frame gagal beruntun (~2 detik).

Endpoint `/api/robot/liveview/stream` tetap ada (berguna untuk cek langsung dari browser) dan dikembalikan ke perilaku 12.5: tanpa batas kegagalan, jeda 500 ms saat gagal supaya tidak ikut menghantam digiCam yang sedang sibuk. Kiosk tidak memakainya.

Dua pengaman kecil yang ditambahkan di atas basis 12.5: `isMountedRef` di-set `true` tiap mount (remount StrictMode dulu mematikan timer freeze), dan `pendingRef` ikut dilepas saat loop polling (re-)start — tanpa itu satu frame yang menggantung bikin *Try again* tidak berefek sama sekali.

### Keselamatan enable/disable robot (baru)

Tiga lubang di jalur mode kerja dobot, semuanya bisa meninggalkan lengan **aktif tanpa sesi**:

1. **Urutan tidak dijamin.** Handler `/api/robot/enable` menjalankan `services.EnableRobot()` di goroutine lalu langsung balas `200`. Kalau sesi cepat berakhir (user menekan "Selesai sekarang", atau halaman ditinggalkan), disable bisa mendarat DULUAN dan enable menyusul sesudahnya. Sekarang handler-nya sinkron, plus gerbang [`robotModeMu`](backend/services/robot.go) yang membuat enable/disable/stop berjalan satu per satu — urutan mendarat = urutan permintaan.
2. **Disable menyerah pada kegagalan pertama.** `DisableRobot` sekarang mencoba **3×** (jeda 700 ms), dan kalau tetap gagal jatuh ke **emergency stop** `/robot/stop` sebelum menyerah. Flag lokal `RobotEnabled` hanya di-set `false` kalau robot benar-benar mengkonfirmasi, supaya `/api/robot/config` tidak melaporkan "mati" untuk robot yang nyatanya masih hidup.
3. **Frontend menelan errornya.** Cleanup unmount dulu memakai `.catch(() => {})`. Sekarang lewat [`robotPower.ts`](frontend/src/features/public/photo-session/lib/robotPower.ts): gagal disable → coba emergency stop → kalau itu pun gagal, `console.error` yang jelas. Ditambah listener `pagehide` yang memakai `navigator.sendBeacon` — tab kiosk yang ditutup/di-refresh membatalkan XHR yang sedang jalan, beacon tidak.

### Perbaikan: narasi nyasar di sesi foto (baru)

Gejalanya: di tengah sesi foto tiba-tiba terdengar ajakan "sentuh layar untuk memulai". Dua sebab terpisah:

- **Jendela lain yang tertinggal di Home.** Ajakan `mulaiNew.mp3` dipicu presence kamera gesture — dan selama sesi foto user justru berdiri persis di depan kamera itu, jadi presence selalu `true`. Jendela mana pun yang masih terbuka di `/` (mis. monitor kedua yang lupa dipindah ke `/photo-session/control`) akan menyela tiap 5 detik. Perbaikannya: halaman sesi foto memancarkan **heartbeat** `SESSION_START` tiap `SESSION_HEARTBEAT_MS` (3 detik) lewat BroadcastChannel, dan Home bisu selama heartbeat itu terdengar. Dipakai heartbeat, bukan sekali kirim, supaya jendela yang dibuka/di-reload di TENGAH sesi ikut tahu — ini juga menyembuhkan Monitor 2 yang nyangkut di "Standby" kalau di-reload di tengah sesi. Flag `enabled` robot sengaja TIDAK dipakai sebagai penanda sesi: `ROBOT_ENABLED` bisa di-set `true` sejak startup.
- **Timer `playBackendAudioAfterCurrent` yang bocor.** `setTimeout` pengamannya tidak pernah dibatalkan, jadi narasi halaman sebelumnya (mis. `intro.mp3` dari instruction) bisa menyusul beberapa detik kemudian di halaman sesi foto. Sekarang jadwalnya disimpan di modul dan dibatalkan oleh narasi baru mana pun atau `stopBackendAudio()`.

### Tap area penuh di Home + highlight preset aktif
- **Home** ([`HomePage.tsx`](frontend/src/features/public/home/pages/HomePage.tsx)) — `<main>` dipindah ke `fixed inset-0`. Sebelumnya `min-h-full` di dalam container `max-w-360` layout publik bikin ada pita mati kiri-kanan di layar kiosk >1440px yang tidak memicu tap, padahal konsepnya "tap anywhere to start".
- **Grid Gesture Controls** ([`PhotoSessionPage.tsx`](frontend/src/features/public/photo-session/pages/PhotoSessionPage.tsx)) — kartu preset kini punya state "ter-select" untuk preset yang gesture-nya SEDANG dibaca robot, jadi user tahu preset mana yang akan dikonfirmasi selagi bar progress terisi. Highlight dipetakan dari `gesture_id` (1-10, sejajar `Preset N`), **bukan** `robot_preset` — panel kanan disembunyikan saat robot bergerak (`showGuide = !robotBusy`) sehingga highlight berbasis `robot_preset` praktis tak pernah terlihat. Highlight "preset terakhir dipakai" di grid dihapus, begitu juga kartu *Previous Preset* — kolom kanan sekarang tinggal 2 kartu (Gesture Detection + Gesture Controls) supaya grid preset dapat ruang lebih lega.

### Pembersihan duplikasi lapisan admin (baru)
Audit blok-kembar otomatis menemukan 12 pasangan duplikat; sisa sekarang 3 dan semuanya bukan duplikasi nyata (blok import yang sama + pemanggilan `DataPagination` yang memang beda argumen). Yang disatukan:

| Dulu tersebar di | Sekarang |
|---|---|
| `updateParam` di 4 halaman daftar | [`useListQueryParam`](frontend/src/lib/useListQueryParam.ts) |
| Seleksi baris + memo sorting di 4 tabel | [`useRowSelection`, `useSortedRows`](frontend/src/lib/useTableRows.ts) |
| 9 `<Select>` filter + daftar 12 bulan × 2 | [`FilterSelect`, `MONTH_FILTER_OPTIONS`](frontend/src/components/admin/shared/FilterSelect.tsx) |
| 3 dialog hapus | [`ConfirmDeleteDialog`](frontend/src/components/admin/shared/ConfirmDeleteDialog.tsx) |
| Baris info 3 kartu perangkat | [`InfoRow`](frontend/src/components/admin/shared/InfoRow.tsx) |
| Ikon Revenue di 2 stat card | [`RevenueIcon`](frontend/src/components/admin/shared/RevenueIcon.tsx) |
| Status transaksi (label+warna) di 4 file | [`TRANSACTION_STATUS_CONFIG`](frontend/src/features/admin/transaction/utils/status.ts) |
| Tipe timer config di 2 file | satu `AppConfig`, `TimerSettings` jadi alias |
| Baca `app_settings` di 2 handler Go | `readAppSettings` (pasangan `upsertAppSettings`) |

Semua murni pemindahan kode: markup, kelas Tailwind, teks, dan urutan pemanggilan dipertahankan apa adanya.

### Laporan PDF: mark robot + tema brand (baru)
- **Ikon robot aplikasi** ([`robot 1.svg`](frontend/public/robot%201.svg)) tampil di pita header (di atas app-badge putih, karena gradien navy→biru-nya butuh alas terang) dan mungil di footer tiap halaman. jsPDF tidak bisa menggambar SVG, jadi [`loadRobotIcon`](frontend/src/lib/pdf.ts) merasterisasinya ke PNG **saat export** langsung dari aset yang sama dengan UI — tanpa salinan base64 di bundle yang bisa basi. Kalau aset gagal dimuat, laporan tetap terbit memakai `drawRobotMark`, mark lengan robot versi vektor sebagai cadangan.
- Karena rasterisasi itu asinkron, `exportDashboardToPDF`/`exportTransactionsToPDF` sekarang `async` (kedua pemanggilnya memang sudah `async` + try/catch).
- **Palet disamakan dengan brand.** Sebelumnya laporan memakai ungu `rgb(138,56,245)` yang tidak dipakai di UI mana pun. Sekarang: pita header navy `#112D4E`, aksen/kepala tabel `#3F72AF`, baris selang-seling `#EDF2F8` — sama dengan tema kiosk di `public.css` sekaligus senada dengan livery robot (badan putih, aksen biru). Status tetap semantik: sukses `#0F8A5C`, gagal `#C0392B`.
- Nama konstanta ikut jadi semantik (`PDF_BRAND`, `PDF_ACCENT`, `PDF_SUCCESS`, `PDF_DANGER`, `PDF_MUTED`) supaya tidak ada lagi variabel bernama `PURPLE` yang isinya biru.

> Cara melihat hasil PDF tanpa menjalankan dashboard: kompilasi helper-nya (`npx tsc src/lib/pdf.ts src/lib/formats.ts --outDir <tmp> --module commonjs --esModuleInterop --skipLibCheck`), panggil dari Node dengan `jspdf` + `jspdf-autotable`, lalu rasterisasi PDF-nya memakai pdf.js di browser. Catatan: pdf.js **harus** disajikan via `http://` (worker-nya diblokir di `file://`) dan jangan pakai `--virtual-time-budget` di Chrome headless — flag itu membekukan worker sehingga dokumen tidak pernah selesai dimuat.

### Penyetelan visual robot arm 3D (baru)
Sudut joint & FK tidak tersentuh; yang berubah hanya cara menampilkannya.

**`SCENE_YAW` = 110°**, satu nilai untuk semua preset ([`armKinematics.ts`](frontend/src/features/public/instruction/lib/armKinematics.ts)). Patokannya arah bidik DSLR (sumbu −X link 7). Dari FK kesepuluh preset dengan kamera kartu di azimut 15,3°, yaw yang membuat bidikan tepat mengarah ke penonton:

| Preset | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Yaw ideal | 102° | 102° | 76° | 136° | 105° | 105° | 132° | 89° | 102° | 108° |

Rata-rata melingkarnya 105,7° — itu asal nilai 105,9° yang dipakai semula. Angka final 110° ditentukan dari penilaian di layar: pada 105,9° robot terbaca sedikit menghadap kiri, pada 113,9° sedikit ke kanan (terukur: bidikan preset 1 meleset 12,2° ke kanan), jadi diambil di antaranya.

> ⚠️ Pernah dicoba menghitung yaw **per pose** (`yaw = azimut kamera − J1`) supaya bidang tekuk selalu menghadap penonton. Hasilnya justru salah arah — preset 1 jadi 196,9° dan robot tampak menghadap ke kanan. Jangan diulang tanpa mengecek ke layar dulu.
>
> Konsekuensi yang diterima: preset dengan J1 jauh berbeda (3, 4, 7, 8) tetap terlihat menyerong 20–34°. Kalau salah satunya mengganggu, tambahkan trim kecil khusus preset itu — jangan geser nilai global, karena preset lain ikut bergeser.

Offset J1 juga diperbaiki dari `136.5` → **`149.5`** mm. Angka lama berasal dari pencocokan cincin flange, tapi bbox mesh menunjukkan pedestal (`1c.glb`) berakhir di Y 149,5 sementara badan J1 (`2c.glb`) mulai di Y 0 — jadi pada 136,5 skirt J1 tenggelam 13 mm dan **menelan cincin biru**, menyisakan busur sepotong yang terbaca seperti sambungan miring. Di 149,5 kedua permukaan bersentuhan persis: cincin utuh, tanpa celah.

> ⚠️ Jangan menaikkannya lebih dari 149,5 — flange baut di dalam pedestal langsung terekspos. Untuk menggeser arm di dalam frame kartu (bukan memisah sambungan), pakai `ARM_FLOOR_Y` di [`RobotArm3D.tsx`](frontend/src/features/public/instruction/components/RobotArm3D.tsx) yang menggerakkan seluruh rig.
>
> Cara memeriksa perubahan semacam ini tanpa menebak: jalankan `npm run dev`, lalu screenshot `/arm-lab?hud=0&view=front&dist=0.32&target=0,-0.26,0` (Chrome headless pun bisa). Hindari `dist` di bawah ~0,2 — kamera menembus dinding pedestal dan isi bautnya terlihat, itu artefak near-plane, bukan cacat model.

### Optimalisasi: preview satu koneksi, helper bersama, route dev dipagari (baru)
- ~~**Live preview kiosk pindah ke MJPEG.**~~ **DIBATALKAN** — perpindahan ke satu koneksi `GET /api/robot/liveview/stream` bikin preview blank hitam setelah jepretan pertama. Preview kembali ke polling JPEG per frame; lihat *Preview blank hitam setelah jepretan pertama* di bagian atas. Freeze instan saat shutter tetap ada lewat snapshot `<canvas>` (`crossOrigin="anonymous"`, backend sudah mengirim header CORS).
- **Helper dipakai bersama:** [`lib/pdf.ts`](frontend/src/lib/pdf.ts) baru (palet, header brand, footer, penamaan file) untuk kedua laporan PDF admin; `formatIDR` & `formatDateShort` di [`lib/formats.ts`](frontend/src/lib/formats.ts) menggantikan formatter rupiah/tanggal yang tadinya ditulis ulang di 4 + 7 tempat; `resolveBaseUrl`/`resolveRobotUrl` kini berbagi satu implementasi. Perilaku & tampilan tidak berubah.
- **`/arm-lab` 404 di produksi.** Halaman kalibrasi lengan 3D tetap bisa dipakai saat `npm run dev`, tapi tidak lagi bisa dibuka dari kiosk yang sudah di-build.

### Rapikan komentar & dokumentasi kode
- Blok komentar panjang di seluruh repo dipadatkan (dari 101 blok ≥4 baris jadi 28; rasio komentar 5,9% → 4,7%) tanpa membuang alasan "kenapa"-nya. Riwayat versi panjang di `gif_live.go` diringkas jadi aturan singkat: **bump suffix versi file GIF tiap kali logika compositing berubah**.

### UI Touchscreen — keyboard on-screen, tap-to-place editor, home animasi
Penyesuaian UX untuk kiosk **layar sentuh** (tanpa mouse/keyboard fisik):
- **Home** ([`HomePage.tsx`](frontend/src/features/public/home/pages/HomePage.tsx)) — tombol "Tap to Start" dihapus (seluruh halaman memang sudah bisa di-tap). Diganti indikator sentuh animatif: cincin riak memuai (`tapRing`) + titik inti berdenyut, dan judul "GLAMBOT" diperbesar & mengambang halus (`floatY`).
- **Voucher keyboard on-screen** ([`OnScreenKeyboard.tsx`](frontend/src/components/shared/OnScreenKeyboard.tsx)) — input voucher di `/payment/summary` kini `readOnly`; menyentuhnya memunculkan keyboard alfanumerik bertema (senada GlassCard) yang **slide masuk dari kanan** sembari kartu ringkasan bergeser halus ke kiri.
- **Photo editor tap-to-place** ([`PreviewArea.tsx`](frontend/src/features/public/photo-editor/components/PreviewArea.tsx) + [`PhotoSelectionPanel.tsx`](frontend/src/features/public/photo-editor/components/PhotoSelectionPanel.tsx)) — **drag & drop diganti tap**: tap foto (armed) → tap slot untuk menempatkannya. Tiap slot diberi **nomor**; mengganti foto slot cukup tap foto lain lalu tap slotnya (tanpa drag). Reposisi dalam slot & toolbar zoom/rotate tetap.
- **Kartu unlock gesture** ([`PhotoSessionPage.tsx`](frontend/src/features/public/photo-session/pages/PhotoSessionPage.tsx)) — fase locked kini punya pengingat "Only one person's hand at a time" + gambar telapak lebih besar, layout dirapikan.

### Gesture Detection live + tuning robot dari admin (baru)
- Panel **Gesture Detection** di `/photo-session` (dan Monitor 2 `/photo-session/control`) kini menampilkan **data nyata** dari service dobot: liveview kamera deteksi tangan (MJPEG `/video_feed`) + state FSM lock/unlock + progress bar, di-poll dari `GET {robot}/detection` tiap 150ms (lihat [`getRobotDetection.ts`](frontend/src/features/public/photo-session/api/getRobotDetection.ts)).
- **Robot & Gesture Tuning** di halaman admin `/settings` — atur speed/akselerasi robot + timing gesture/safety (7 field). Disimpan di `app_settings`, diteruskan **live** ke dobot (`POST {robot}/config/runtime`) tanpa restart, plus dibaca dobot saat start via `GET /api/robot-settings`.
- Cue suara real-time robot: `GestureTerdeteksi.mp3` (mulai unlock/preset terbaca), `unlock.mp3` (kunci terbuka), dan re-prompt `inisiasi.mp3` saat user diam. `presetBerikutnya.mp3` dihapus. `playBackendAudio` kini "satu channel" — narasi baru menghentikan yang lama supaya tidak menumpuk.
- Env frontend baru `NEXT_PUBLIC_ROBOT_URL` (default `http://localhost:5001`) + helper `resolveRobotUrl` (auto-derive dari hostname kalau diakses via LAN).
- Durasi sesi di kartu instruction ("Get Ready") kini ikut paket yang dipilih (`session.durationSecs`), bukan hardcode.

### Narasi suara penuh di sepanjang alur kiosk (baru)
- Voice-over Bahasa Indonesia kini menemani **tiap halaman** — dari sapaan di Home sampai "terima kasih" di akhir sesi (lihat [Audio Cues](#audio-cues) untuk daftar lengkap).
- [`lib/audio.ts`](frontend/src/lib/audio.ts) dapat helper baru: `preloadBackendAudio` (buffer semua clip saat boot → tanpa jeda), `playBackendAudioAfterCurrent` & `whenVoiceIdle` (koordinasi lintas halaman supaya dua narasi tidak bertabrakan), plus callback `onEnded` di `playBackendAudio`.
- **Gating interaksi**: kartu paket & tombol "Next" di instruction baru aktif setelah narasinya selesai, supaya user mendengarkan panduan dulu.
- Jarak aman ke robot arm di instruction diturunkan **3m → 2m**.

### Data default kini permanen & editable (penting)
- Seed `packages`, `frames`, `vouchers` di [`init.sql`](backend/migrations/init.sql) diubah dari `ON CONFLICT … DO UPDATE` → **`DO NOTHING`** (insert-only).
- **Sebelumnya** setiap server restart menimpa kembali data default (frame-164…167, paket regular/vip, voucher) ke nilai seed — sehingga edit admin (mis. ganti nama frame) **balik lagi** setiap boot.
- **Sekarang** seed hanya mengisi data awal pada install baru; **dashboard admin jadi sumber kebenaran**. Semua data default bisa diedit dan tidak ter-reset saat build/restart ulang.

### Photo editor (VIP) — canvas
- Fix crash `Cannot read properties of null (reading 'clearRect')` saat ganti frame dengan dimensi berbeda — canvas Fabric kini di-handle via instance hidup (ref), bukan closure basi.
- Canvas dirender di **ruang koordinat asli frame** (`canvas_width`/`canvas_height`), bukan lagi hardcode 464×696 — posisi slot selalu pas walau frame beda dimensi.
- Dukungan shape slot `circle` (selain `rect`/`ellipse`), dengan fallback aman ke `rect` untuk shape tak dikenal.

### Admin — frame & paket
- Form frame: tombol **Next** tidak lagi macet di Step 1, rasio canvas dikunci **2:3** (mis. 464×696), dan slot di-normalisasi id-nya di backend (`ensureSlotIDs`) supaya tiap slot punya id unik & stabil.
- Paket: tambah field **`print_unit_price`** (harga cetak ekstra per-paket) — menggantikan hardcode `vip = 15000` di kode lama. Disimpan juga sebagai snapshot di tabel `sessions`.

### Halaman Photo Session
- Bar "Photo Session" + area preview kini **full-screen** (`fixed inset-0`), lepas dari batas `max-w` layout publik, agar pas di layar kiosk lebar.

---

## Arsitektur

```
┌─────────────────────────────┐         ┌────────────────────────────┐
│  Frontend (Next.js 16)      │         │  Backend (Go + Chi)        │
│  Port 3000                  │ ◀────▶  │  Port 8080                 │
│  - Kiosk UI                 │   HTTP  │  - REST API                │
│  - Photo editor             │   CORS  │  - Storage files           │
│  - QR code generation       │         │  - Robot proxy             │
└────────────┬────────────────┘         └─────┬──────────────────────┘
             │                                │
             │ User scan QR di HP             │ ┌──────────────────┐
             ↓                                ├▶│  PostgreSQL      │
   ┌─────────────────────────┐                │ │  sessions,       │
   │  /download-photos/[id]  │                │ │  photos, frames, │
   │  (HP browser)           │                │ │  vouchers, txns  │
   └─────────────────────────┘                │ └──────────────────┘
                                              │
                                              │ ┌──────────────────┐
                                              ├▶│  digiCamControl  │
                                              │ │  Port 5513       │
                                              │ │  (Canon DSLR)    │
                                              │ └──────────────────┘
                                              │
                                              │ ┌──────────────────┐
                                              └▶│  Robot (eksternal)│
                                                │  via ngrok/LAN   │
                                                │  POST /preset    │
                                                └──────────────────┘
                                                       │
                                                       ↓ callback
                                          POST /api/robot/move
                                          POST /api/robot/done
                                          POST /api/robot/webhook
```

---

## Tech Stack

### Backend
- **Go 1.21+** — main runtime
- **[Chi v5](https://github.com/go-chi/chi)** — HTTP router
- **[lib/pq](https://github.com/lib/pq)** — PostgreSQL driver
- **[uuid](https://github.com/google/uuid)** — ID generation
- **[Midtrans Go SDK](https://github.com/Midtrans/midtrans-go)** — payment gateway
- **JWT (HMAC-SHA256) + bcrypt** — auth dashboard admin (login + token)
- **[Google Drive API](https://developers.google.com/drive)** — upload hasil sesi ke Drive (opsional)

### Frontend
- **Next.js 16** (Turbopack, App Router)
- **React 19**
- **TypeScript 5**
- **Tailwind CSS 4**
- **TanStack Query 5** — server state
- **Axios** — HTTP client
- **Fabric.js 5** — canvas for photo editor
- **qrcode.react** — QR code generation
- **lottie-react** — loading animations
- **lucide-react** — icons
- **Radix UI** — primitives (dialog, slot)
- **Recharts** — grafik dashboard admin
- **react-hook-form + Zod** — form + validasi (form admin)
- **xlsx, jsPDF (+autotable)** — export transaksi ke Excel/PDF
- **sonner** — toast notifications
- **date-fns, react-day-picker** — util & picker tanggal
- **next-themes** — tema (light/dark)

### Eksternal (opsional)
- **digiCamControl** — control Canon DSLR (Windows only)
- **PostgreSQL 14+**
- **Midtrans Sandbox** — untuk QRIS payment testing

---

## Prerequisites

Pastikan sudah ter-install:

| Tool | Versi minimum | Catatan |
|---|---|---|
| Go | 1.21+ | [Download](https://go.dev/dl/) |
| Node.js | 20.x+ | LTS recommended |
| npm | 10.x+ | Bundled dengan Node |
| PostgreSQL | 14+ | Native install atau Docker |
| Git | latest | |
| digiCamControl | 2.1+ | **Opsional**, untuk mode Canon |

---

## Instalasi

### 1. Clone repository

```bash
git clone <repo-url>
cd glambot-app
```

### 2. Setup PostgreSQL

**Cukup buat database kosong** — backend akan **auto-run migration** saat startup pertama. Tidak perlu manual `psql -f`.

```bash
psql -U postgres -c "CREATE DATABASE photobooth;"
```

Backend saat `go run .` akan baca [`backend/migrations/init.sql`](backend/migrations/init.sql) dan apply semua schema + seed otomatis. Idempotent, jadi restart kedua kali tidak akan duplicate atau break.

Kalau mau jalankan manual (debugging, fresh seed, dll):
```bash
psql -U postgres -d photobooth -f backend/migrations/init.sql
```

Migration ini berisi:

- **7 tables** + indexes: `packages`, `frames`, `sessions`, `transactions`, `vouchers`, `voucher_usage`, `photos`
- **2 packages** default: `regular` (Digital, Rp 45k) + `vip` (Print, Rp 65k, popular)
- **4 frames** default dengan slot coordinates lengkap: `frame-164` (6 rect), `frame-165` (6 rect), `frame-166` (4 rect), `frame-167` (6 ellipse)
- **4 vouchers** default:
  - `GLAMBOT10` — 10% off, min Rp 50k
  - `FREESHIP` — Rp 15k flat off
  - `GLAMSHINE` — 50% off, no minimum
  - `GLAMHERO` — 100% off (gratis), no minimum
- **1 admin** default di-seed otomatis oleh backend saat startup (kalau tabel `admins` kosong) — kredensial dari env `ADMIN_EMAIL` / `ADMIN_PASSWORD` (lihat [Admin Dashboard](#admin-dashboard))

Idempotent via `CREATE TABLE IF NOT EXISTS` + `ON CONFLICT DO NOTHING` (**insert-only**) — aman dijalankan berulang. Seed hanya mengisi data awal pada install baru; **re-run TIDAK menimpa data yang sudah ada**, jadi edit via dashboard admin (nama frame, harga paket, slot, voucher) tetap aman walau server di-restart.

### 3. Setup Backend

```bash
cd backend
cp .env.example .env
# Edit .env sesuai kebutuhan (lihat section Konfigurasi Environment)
go mod download
```

### 4. Setup Frontend

```bash
cd ../frontend
cp .env.example .env.local
# Edit .env.local sesuai kebutuhan
npm install
```

---

## Konfigurasi Environment

### Backend (`backend/.env`)

```ini
# Server
APP_PORT=8080
APP_ENV=development

# PostgreSQL
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/photobooth?sslmode=disable

# Midtrans (opsional, untuk QRIS payment)
MIDTRANS_SERVER_KEY=Mid-server-xxxxxxxxxxxxxxxx
MIDTRANS_CLIENT_KEY=Mid-client-xxxxxxxxxxxxxxxx
MIDTRANS_ENV=sandbox

# Storage
STORAGE_PATH=./storage

# digiCamControl HTTP API (untuk Canon)
DIGICAM_BASE_URL=http://localhost:5513/api

# Session
PAYMENT_EXPIRY_MINS=2          # jendela bayar QRIS sebelum transaksi expired (default 2)
SESSION_EXPIRY_HOURS=72
CLEANUP_INTERVAL_HOURS=24

# CORS allowed origin
FRONTEND_URL=http://localhost:3000

# Camera: Canon-only via digiCamControl (lihat DIGICAM_BASE_URL).

# Robot integration (opsional)
ROBOT_API_URL=https://your-robot-ngrok.ngrok-free.dev
ROBOT_ENABLED=false

# Admin dashboard auth
# JWT_SECRET dipakai menandatangani token login admin (HMAC-SHA256) — WAJIB
# diganti di production. ADMIN_EMAIL/ADMIN_PASSWORD = kredensial admin default
# yang di-seed sekali saat tabel admins masih kosong.
JWT_SECRET=ganti-dengan-secret-acak-panjang
ADMIN_EMAIL=admin@glambot.com
ADMIN_PASSWORD=admin123

# Google Drive upload (opsional) — upload hasil tiap sesi ke Drive, lalu QR di
# halaman download mengarah ke folder publiknya. Kosongkan untuk menonaktifkan.
# Cara dapat refresh token: isi CLIENT_ID/SECRET, lalu `go run ./cmd/gdrive-token`.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GOOGLE_DRIVE_FOLDER_ID=
```

### Frontend (`frontend/.env.local`)

```ini
# Backend API URL
# - Kosongkan untuk auto-detect dari hostname (recommended kalau akses dari HP via LAN)
# - Set ke http://localhost:8080 untuk dev di mesin sendiri
# - Set ke http://192.168.x.x:8080 untuk cross-device testing
NEXT_PUBLIC_API_URL=http://localhost:8080

# QR code download URL override (opsional)
# Set kalau kiosk diakses via localhost tapi QR harus encode LAN IP
# NEXT_PUBLIC_DOWNLOAD_PUBLIC_URL=http://192.168.1.150:3000

# URL service dobot (Flask :5001) untuk panel Gesture Detection
# - Kosongkan untuk auto-derive dari hostname halaman + :5001 (cocok kiosk & LAN)
# - Set ke http://localhost:5001 untuk dev satu mesin
NEXT_PUBLIC_ROBOT_URL=http://localhost:5001
```

---

## Setup Database

### Verifikasi seed berhasil

```bash
psql -U postgres -d photobooth -c "SELECT id, code, name, base_price FROM packages ORDER BY id;"
psql -U postgres -d photobooth -c "SELECT id, name, photo_slots FROM frames ORDER BY sort_order;"
psql -U postgres -d photobooth -c "SELECT code, discount_type, discount_value, min_price FROM vouchers ORDER BY discount_value DESC;"
```

Hasil yang diharapkan:
- **2 packages** (`regular` = Digital, `vip` = Print)
- **4 frames** (`frame-164`, `frame-165`, `frame-166`, `frame-167`)
- **4 vouchers** (`GLAMHERO` 100%, `GLAMSHINE` 50%, `GLAMBOT10` 10%, `FREESHIP` Rp 15k)

### Re-run migration

Migration `init.sql` idempotent — aman di-jalankan kapan saja (baik via backend startup atau manual):

```bash
psql -U postgres -d photobooth -f backend/migrations/init.sql
```

Akan:
- Skip table yang sudah ada (NOTICE: "already exists")
- **Tidak menimpa** data packages/frames/vouchers yang sudah ada (`ON CONFLICT DO NOTHING`) — edit admin aman, hanya baris baru pada install fresh yang di-insert
- Jalankan compatibility migrations (tambah kolom baru via `ADD COLUMN IF NOT EXISTS`, backfill nilai kosong/null saja)

> ⚠️ **Reset paksa ke data default:** karena seed sekarang insert-only, untuk mengembalikan satu baris ke nilai seed kamu harus hapus dulu barisnya (mis. `DELETE FROM frames WHERE id = 'frame-164';`) lalu re-run migration. Atau cukup edit lewat dashboard admin.

### Tambah frame baru manual

Frame metadata disimpan di tabel `frames` dengan slot coordinates di kolom `slots` (JSONB). File PNG/SVG-nya di-store di `backend/storage/frames/`.

```sql
INSERT INTO frames (id, name, file_path, thumb_url, photo_slots, canvas_width, canvas_height, slots, sort_order)
VALUES (
  'frame-custom',
  'Frame Custom',
  'frames/frame-custom.svg',
  '/storage/frames/frame-custom.svg',
  3,
  464,
  696,
  '[
    {"id":"slot-1","shape":"rect","x":20,"y":40, "width":420,"height":190,"label":"Top"},
    {"id":"slot-2","shape":"rect","x":20,"y":250,"width":420,"height":190,"label":"Middle"},
    {"id":"slot-3","shape":"rect","x":20,"y":460,"width":420,"height":190,"label":"Bottom"}
  ]'::jsonb,
  5
);
```

Lalu copy file `frame-custom.svg` ke `backend/storage/frames/`.

---

## Menjalankan Aplikasi

### Satu perintah (disarankan)

```powershell
.\start.ps1
```

Atau double-click `start.bat`. Skrip [`start.ps1`](start.ps1) menyalakan ketiga service sekaligus di **satu window Windows Terminal, 3 pane** (backend kiri, frontend kanan-atas, dobot kanan-bawah), lalu membuka Chrome kiosk ke `http://localhost:3000` setelah frontend benar-benar melayani request.

> **Frontend jalan mode production**, bukan dev: `npm run build` dulu lalu `npm run start`. Tidak ada HMR dan perubahan kode baru kelihatan setelah start ulang — tukarannya navigasi antar halaman instan karena tidak ada compile-on-demand, yang memang yang dimau di kiosk. Kalau lagi ngoding dan butuh HMR, pakai `-Dev`.
>
> **Build cuma jalan kalau ada yang berubah.** Start kedua dan seterusnya tanpa ngedit apa pun langsung `npm run start` — hitungan detik, bukan menit.

Urutannya:

1. **Cek prasyarat** — `go`/`npm` di PATH, `backend/.env`, `dobot/.env`, `frontend/.env.local`, `dobot/venv/`, `frontend/node_modules/`. Kalau ada yang kurang, langsung berhenti sambil menyebut mana yang kurang dan cara memperbaikinya.
2. **Bunuh proses yang masih pegang port** 8080 / 3000 / 5001. Ini yang paling sering jadi biang "gagal bind tanpa pesan jelas" — `go run .` di Windows spawn child exe yang tidak ikut mati waktu terminalnya ditutup paksa. Perlu diingat: skripnya tidak pilih-pilih, **apa pun** yang pegang ketiga port itu dimatikan tanpa nanya. Kalau kamu lagi jalanin project lain di `:3000`, matikan dulu.
3. **Bersihin cache ringan** — `__pycache__` dobot dihapus, profil browser di-reset. `frontend/.next` **tidak** dihapus supaya `next build` bisa incremental; pakai `-Clean` kalau memang butuh build dari nol.
4. **Nyalakan service secara berantai** — `backend → dobot → frontend`, detailnya di bawah.
5. **Buka kiosk** dengan `--user-data-dir` temp yang dibuang tiap start, jadi cache browser selalu bersih.

Skripnya nunggu sampai `http://localhost:3000` benar-benar merespons — bukan cuma sampai portnya kebuka — baru Chrome dilaunch, jadi kiosk tidak pernah kebuka ke halaman yang belum jadi. Batas tunggunya 10 menit (15 menit kalau `-Clean`, 4 menit kalau `-Dev`); itu batas atas, bukan lama tunggu.

#### Urutan start & saling tunggu

Ketiga service tidak dinyalakan barengan begitu saja. Tiap pane nunggu gilirannya sendiri dengan cara ngecek port pendahulunya:

```
backend    ──────────────────────────▶  langsung jalan (go build, lalu listen :8080)
                │
dobot           └─ nunggu :8080 ─────▶  python main.py, listen :5001
                                  │
frontend   ── next build ─────────┴───▶ nunggu :8080 + :5001, baru npm run start
           (jalan duluan, tidak antre)
```

Kuncinya ada di baris ketiga: **`next build` sengaja dijalankan di awal tanpa nunggu siapa pun.** Build tidak butuh backend maupun dobot, dan dia bagian yang paling lama — jadi dia dibiarkan overlap dengan boot backend + dobot. Waktu build kelar, dua-duanya biasanya sudah siap dan frontend lanjut tanpa jeda. Yang benar-benar diantre cuma `npm run start`-nya. Kalau build dilewati (tidak ada perubahan), frontend langsung masuk antrean.

Kenapa urutannya harus begitu:

- **Dobot nunggu backend** bukan cuma biar rapi. Dobot narik tuning robot (speed, timing yang diatur admin) dari `/api/robot-settings` saat boot lewat `apply_backend_overrides()` di [`main.py`](dobot/main.py). Dia punya retry sendiri, tapi kalau backend sudah siap duluan, fetch pertamanya langsung kena — jadi nilai yang dipakai benar-benar dari DB, bukan fallback `.env`.
- **Frontend nunggu dua-duanya** supaya halaman pertama yang dibuka kiosk tidak ketemu API yang belum listen.

Kalau ada yang tidak nyala sampai batas waktu (backend 3 menit, dobot 4 menit), service berikutnya **tetap distart** sambil nampilin peringatan di pane-nya. Ini disengaja: kiosk yang blank jauh lebih susah didiagnosa daripada kiosk yang nyala dengan satu fitur error, dan dashboard admin tetap kepakai penuh walau dobot mati.

Flag yang tersedia:

| Flag | Efek |
|---|---|
| `-Dev` | Frontend pakai `npm run dev` (HMR) — buat ngoding, bukan kiosk |
| `-Rebuild` | Paksa `next build` walau tidak ada perubahan |
| `-Clean` | Hapus `frontend/.next` dulu — build dari nol, bukan incremental |
| `-NoRobot` | Dobot jalan `--no-robot` (vision saja, tanpa hardware) |
| `-NoBrowser` | Jangan buka Chrome, cuma nyalakan service |

#### Kapan `next build` jalan, kapan dilewati

Sesudah build sukses, skrip menyimpan sidik jari SHA-256 dari semua input build ke `frontend/.next/.glambot-build-stamp`. Di start berikutnya sidik jari itu dihitung ulang (~0,5 detik) dan dibandingkan — kalau sama persis, build dilewati.

Yang ikut dihitung: seluruh isi `src/` dan `public/`, lalu `package.json`, `package-lock.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `components.json`, `eslint.config.mjs`, dan **`.env` / `.env.local` / `.env.production`**.

> File `.env*` sengaja ikut dan ini bagian yang paling penting. Semua `NEXT_PUBLIC_*` di-**inline ke bundle klien saat build**, bukan dibaca waktu runtime. Kalau `NEXT_PUBLIC_API_URL` diganti (misal dari `localhost` ke IP LAN untuk akses HP) tapi build-nya dilewati, bundle lama tetap dipakai dan kiosk masih nembak API yang lama — gagalnya diam-diam, halaman kelihatan normal tapi datanya tidak masuk.

Yang **tidak** ikut: `node_modules/` (sudah terwakili `package-lock.json`), `.next/`, dan `*.tsbuildinfo` — dua terakhir itu output, bukan input.

Yang dibandingkan **isi file**, bukan timestamp. Jadi `git checkout`/`git pull` yang nulis ulang file dengan isi identik tidak memicu rebuild percuma, sementara edit sekecil apa pun tetap kedeteksi. Build juga dipaksa kalau `.next/BUILD_ID` tidak ada — penanda itu cuma dibuat `next build`, jadi ketiadaannya berarti `.next` bukan hasil build production dan `npm run start` bakal nolak jalan.

Port dibaca otomatis dari `APP_PORT` (backend/.env) dan `PORT` (dobot/.env), jadi kalau diubah di `.env` skripnya ikut menyesuaikan. Kalau Windows Terminal tidak terpasang, otomatis fallback ke 3 window console terpisah.

#### Nyalain & matiin

**Nyalain:** double-click `start.bat`, atau `.\start.ps1` dari PowerShell di root repo. Tunggu sampai Chrome kiosk kebuka sendiri — itu tandanya ketiganya sudah siap.

**Matiin — urutannya begini:**

1. **Keluar dari kiosk:** `Alt+F4`. Mode kiosk tidak punya title bar jadi tidak ada tombol X.
2. **Matiin service:** klik salah satu pane di Windows Terminal, tekan `Ctrl+C`, ulangi untuk dua pane lainnya. Pane-nya sengaja tidak langsung nutup (`-NoExit`) supaya log terakhirnya masih kebaca.
3. **Tutup window-nya:** `Alt+F4` atau klik X. Windows Terminal akan konfirmasi karena masih ada 3 pane — iyakan saja.

Pakai `Ctrl+C`, jangan langsung tutup window, karena ketiganya punya rutinitas bersih-bersih yang cuma jalan kalau dapat sinyal interrupt:

- **Backend** — `srv.Shutdown()` nunggu request yang lagi jalan selesai (maks 10 detik) lalu nutup koneksi DB ([`main.go`](backend/main.go)). Kalau dikill paksa saat lagi compose foto, hasilnya bisa setengah jadi.
- **Dobot** — blok `finally: runtime.stop()` ([`main.py`](dobot/main.py)) melepas handle kamera dan men-disable lengan robot. Kalau dikill paksa, kamera bisa ke-lock (`CAMERA_INDEX` gagal dibuka di run berikutnya) dan lengan ditinggal dalam keadaan enabled.
- **Frontend** — paling tidak rewel, tapi `npm` di Windows kadang ninggalin proses `node` yatim yang masih pegang `:3000`.

Kalau terlanjur ketutup paksa atau ada yang nyangkut, **tidak usah dibersihin manual** — `start.ps1` selalu kill apa pun yang megang port 8080/3000/5001 di awal, jadi tinggal jalankan lagi.

Ngecek masih ada yang jalan atau nggak:

```powershell
Get-NetTCPConnection -LocalPort 8080,3000,5001 -State Listen -ErrorAction SilentlyContinue |
    Select-Object LocalPort, @{n='Proses';e={(Get-Process -Id $_.OwningProcess).ProcessName}}
```

### Dev mode manual (2 terminal)

**Terminal 1 — Backend:**
```bash
cd backend
go run .
```

Backend listen di `http://localhost:8080` (atau `:8080` di semua interface untuk LAN access).

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Frontend di `http://localhost:3000`. Open dari browser kiosk.

### Akses dari HP (LAN)

Di PC dev (Windows):
1. Cari IP LAN: `ipconfig` → catat "IPv4 Address" (misal `192.168.1.150`)
2. Allow Windows Firewall untuk port 3000 + 8080
3. Edit `frontend/.env.local`:
   ```ini
   NEXT_PUBLIC_API_URL=
   ```
   (Kosong = auto-detect berdasarkan hostname browser. HP akses via `192.168.1.150:3000` → frontend otomatis fetch dari `192.168.1.150:8080`.)
4. Restart `npm run dev`

Di HP (browser):
- Buka `http://192.168.1.150:3000` untuk kiosk view
- Atau scan QR code dari kiosk untuk langsung ke `/download-photos/[sessionId]`

---

## Admin Dashboard

Dashboard internal untuk kelola konten kiosk tanpa sentuh database langsung.

### Login

- URL: `http://localhost:3000/login`
- Kredensial default (dari env, di-seed saat tabel `admins` kosong):
  - Email: `ADMIN_EMAIL` (default `admin@glambot.com`)
  - Password: `ADMIN_PASSWORD` (default `admin123`)
- Auth pakai JWT (HMAC-SHA256, secret `JWT_SECRET`). **Ganti `JWT_SECRET` & password default di production.**

> Admin default hanya dibuat sekali saat tabel `admins` masih kosong. Mau ganti password? Ubah lewat dashboard, atau hapus baris di tabel `admins` lalu set `ADMIN_PASSWORD` baru dan restart backend.

### Halaman

| Route | Fungsi |
|---|---|
| `/dashboard` | Ringkasan (summary metrics) |
| `/frame` | CRUD frame (upload PNG/SVG, atur canvas 2:3, slot editor, aktif/nonaktif) |
| `/packages` | CRUD paket (harga, durasi, print_count, `print_unit_price`, popular) |
| `/voucher` | CRUD voucher (percent/fixed, min price, max uses, expiry) |
| `/transaction` | Riwayat transaksi pembayaran |
| `/devices` | Status koneksi kamera / printer / robot (tes nyata) |
| `/settings` | Timer tiap layar user + **Robot & Gesture Tuning** (speed/akselerasi robot, timing gesture/safety → diteruskan live ke dobot) |

Semua perubahan **tersimpan permanen** dan **tidak ter-reset** saat server restart (lihat [Update Terbaru](#update-terbaru)).

### API admin (ringkas)

Semua di-prefix `/api/admin` dan butuh token JWT (header `Authorization: Bearer <token>`):

| Method | Path | Tujuan |
|---|---|---|
| POST | `/api/admin/login` | Login → return token + info admin |
| GET/POST/PATCH/DELETE | `/api/admin/frames[/{id}]` | CRUD frame (+ `/stats`) |
| GET/POST/PATCH/DELETE | `/api/admin/packages[/{id}]` | CRUD paket |
| GET/POST/PATCH/DELETE | `/api/admin/vouchers[/{id}]` | CRUD voucher |
| GET | `/api/admin/transactions` | List transaksi |
| GET | `/api/admin/devices` | Tes koneksi perangkat |
| GET | `/api/admin/dashboard/summary` | Metrics ringkasan |
| GET/PATCH | `/api/admin/settings` | Timer config tiap layar |
| GET/PATCH | `/api/admin/robot-settings` | Robot & gesture tuning (validasi rentang, forward ke dobot) |

---

## Production Build

### Backend

```bash
cd backend
go build -o photobooth.exe .  # Windows
go build -o photobooth .       # Linux/Mac
./photobooth                   # run
```

### Frontend

```bash
cd frontend
npm run build
npm run start
```

Production server di `http://localhost:3000`. **Tidak ada HMR**, lebih cepat, tidak ada `allowedDevOrigins` restriction.

---

## Struktur Project

```
glambot-app/
├── backend/
│   ├── config/
│   │   └── config.go              # Load env + runtime state (current_preset, auto_capture_at)
│   ├── database/
│   │   └── database.go            # PostgreSQL connection pool
│   ├── handlers/
│   │   ├── helpers.go             # respondJSON, respondError, firstNonEmpty
│   │   ├── payment.go             # CreatePayment, GetPaymentStatus, PaymentWebhook (Midtrans)
│   │   ├── photo.go               # UploadPhoto, ComposeFrame, GetSessionPhotos, GetFramedPhotos, GetFrames, DownloadPhoto
│   │   ├── robot.go               # GetCameraStatus, RobotCapture, GetLiveView, EnableRobot, DisableRobot, TriggerPreset, RobotMoving, RobotDone, RobotWebhook, GetRobotConfig
│   │   ├── session.go             # GetPackages, CreateSession, GetSession, UpdateSessionStatus
│   │   ├── voucher.go             # ApplyVoucher, RemoveVoucher
│   │   ├── admin_auth.go          # EnsureDefaultAdmin (seed), AdminLogin (JWT)
│   │   ├── admin_frames.go        # CRUD frame + ensureSlotIDs (normalisasi slot id)
│   │   ├── admin_packages.go      # CRUD paket (+ print_unit_price)
│   │   ├── admin_vouchers.go      # CRUD voucher
│   │   ├── admin_transactions.go  # List/detail/stats/export transaksi (CSV)
│   │   ├── admin_dashboard.go     # Summary metrics
│   │   ├── admin_devices.go       # Tes koneksi kamera/printer/robot
│   │   ├── admin_helpers.go       # Helper upload/paging admin bersama
│   │   ├── config.go              # Timer config + app_settings (upsertAppSettings)
│   │   ├── robot_settings.go      # Tuning runtime robot (speed/timing) → forward ke dobot
│   │   └── drive.go               # GetSessionDriveLink + kumpulkan file upload Drive
│   ├── middleware/
│   │   └── cors.go                # CORS allow list (localhost + LAN private ranges)
│   ├── migrations/
│   │   └── init.sql               # Canonical schema + seed (auto-run on startup)
│   ├── models/
│   │   └── models.go              # Session, Photo, Frame, Voucher, Transaction, PackageInfo types
│   ├── routes/
│   │   └── routes.go              # All HTTP route definitions
│   ├── services/
│   │   ├── camera.go              # Canon liveview + capture via digiCamControl
│   │   ├── burst.go               # Burst-capture liveview frames during 3s countdown (untuk Live Strip GIF)
│   │   ├── gif.go                 # Slideshow GIF generator (raw photos terpilih, loop)
│   │   ├── gif_live.go            # Live Strip GIF generator (framed + burst overlay + frame design top-layer)
│   │   ├── cleanup.go             # Periodic cleanup of expired sessions
│   │   ├── midtrans.go            # Midtrans QRIS integration
│   │   ├── print.go               # Cetak strip framed ke printer
│   │   ├── gdrive.go              # Upload hasil sesi ke Google Drive (OAuth2)
│   │   ├── photo_filters.go       # Filter foto server-side
│   │   ├── devices.go             # Probe kamera/printer/robot untuk admin devices
│   │   └── robot.go               # HTTP client to external robot API
│   ├── storage/
│   │   ├── audio/                 # narasi voice-over per halaman (mulai, selamatDatang, jumlahCetak, voucher*, pembayaran*, introDengar/waktuSesi/infoSingkat, keselamatanNoM/deteksiSatu, infoPreset/pilGesture/pilAcam, inisiasiGJ, countdown tiga/dua/satu, tutorial editor sentuhFrame/seretFoto/seretZoom/filter/pilihCetakFoto, fotoProses, scanQr, terimakasih, etc.)
│   │   ├── frames/                # Frame SVG assets (embedded base64 PNG → frame overlay)
│   │   ├── packages/              # Package thumbnails (digital.svg, print.svg)
│   │   └── sessions/{id}/         # Per-session output:
│   │       ├── raw/               #   - canon_*.jpg (foto hasil capture)
│   │       ├── framed/            #   - result_*.jpg (komposisi frame + foto, dari Fabric canvas)
│   │       ├── burst/             #   - {photoID}/frame_*.jpg (liveview frames selama countdown)
│   │       ├── animation.gif      #   - slideshow GIF (lazy-generated saat request pertama)
│   │       └── animation-live-v2.gif #- live-strip GIF (versioned: bump suffix saat compositing logic berubah)
│   ├── .env.example
│   ├── go.mod
│   └── main.go                    # Entry point
│
├── frontend/
│   ├── public/                    # Static assets (Container.svg, bg.webp, finger/, etc.)
│   ├── src/
│   │   ├── app/
│   │   │   ├── (admin)/           # Admin dashboard (login + protected routes)
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── (dashboard)/   # dashboard, frame, packages, voucher,
│   │   │   │                      # transaction, devices, settings
│   │   │   ├── (public)/          # Public routes (kiosk + download)
│   │   │   │   ├── arm-lab/page.tsx   # Kalibrasi robot arm 3D (dev-only; 404 di build produksi)
│   │   │   │   ├── package/page.tsx
│   │   │   │   ├── payment/summary/page.tsx
│   │   │   │   ├── payment/pay/page.tsx
│   │   │   │   ├── instruction/page.tsx
│   │   │   │   ├── photo-session/page.tsx
│   │   │   │   ├── photo-session/control/page.tsx
│   │   │   │   ├── photo-editor/page.tsx
│   │   │   │   ├── session-end/page.tsx
│   │   │   │   └── download-photos/[sessionId]/page.tsx
│   │   │   ├── layout.tsx         # Root layout (background, fonts, Providers)
│   │   │   ├── providers.tsx      # React Query provider
│   │   │   ├── page.tsx           # Home / landing
│   │   │   ├── loading.tsx
│   │   │   ├── error.tsx
│   │   │   └── not-found.tsx
│   │   ├── assets/                # Local fixed assets (loading.json Lottie)
│   │   ├── components/
│   │   │   ├── shared/            # GlassCard, Timer, StatusAnimation, Spinner, OnScreenKeyboard (touchscreen)
│   │   │   ├── ui/                # Button, Dialog, Input (Radix wrappers) — dipakai kiosk
│   │   │   └── admin/             # layout/ (sidebar, header), shared/ (ChartContainer, DataPagination,
│   │   │                          # NotFoundState), ui/ (komponen shadcn dashboard)
│   │   ├── features/
│   │   │   ├── admin/             # dashboard, frame, packages, voucher, transaction, devices, settings, auth
│   │   │   └── public/
│   │   │       ├── home/
│   │   │       ├── instruction/   # Multi-step instruction (3 cards + 60s timer)
│   │   │       ├── package/       # Package selection
│   │   │       ├── payment/       # QRIS + voucher
│   │   │       ├── photo-session/ # Live preview + capture (Canon) + countdown overlay + grace-period safeguard
│   │   │       │                  # api/getRobotConfig.ts: shared useRobotConfig() hook (React Query, 250ms poll dedupe)
│   │   │       │                  # api/getRobotDetection.ts: useRobotDetection() → poll dobot /detection + MJPEG /video_feed (150ms)
│   │   │       ├── photo-editor/  # Select & Edit (Fabric canvas) — VIP only
│   │   │       ├── photo-download/# Download grid (HP) — slideshow GIF + live-strip GIF preview/download cards
│   │   │       └── session-end/   # QR display + done screen
│   │   ├── lib/
│   │   │   ├── api-client.ts      # axios instance + resolveBaseUrl + toAbsoluteUrl
│   │   │   ├── audio.ts           # voice-over: play/preload + cross-page coordination (whenVoiceIdle, playAfterCurrent)
│   │   │   ├── formats.ts         # formatRupiah, formatIDR, formatDateShort, formatPriceToK
│   │   │   ├── pdf.ts             # Palet brand + mark robot vektor + header/footer laporan PDF
│   │   │   ├── formatTime.ts      # formatTimeMMSS — shared MM:SS + negative grace timer format
│   │   │   ├── usePersistedCountdown.ts # Countdown yang persist via sessionStorage (survive refresh)
│   │   │   ├── react-query.ts     # Query config
│   │   │   └── utils.ts           # cn (Tailwind merge)
│   │   ├── shared/
│   │   │   └── api/session.ts     # createSession, getSession, patchSessionStatus
│   │   └── styles/
│   │       ├── public.css         # Kiosk theme + keyframes (slideUp, tapRing, floatY, softGlow, slideInRight, etc.)
│   │       └── admin.css          # Dashboard admin theme
│   ├── .env.example
│   ├── next.config.ts             # allowedDevOrigins, remotePatterns
│   ├── package.json
│   └── tsconfig.json
│
├── dobot/                          # Robot gesture-control service (Python + Flask + MediaPipe)
│   ├── app/
│   │   ├── config.py               # Loader .env → Config dataclass (semua field wajib)
│   │   ├── core/runtime.py         # FSM + pipeline gerak + callback ke backend (/api/robot/moving,/done)
│   │   ├── detector/               # Deteksi gesture jari (MediaPipe hand landmarker)
│   │   ├── robot/                  # Driver Dobot Nova 5 (dashboard :29999 + move :30003)
│   │   └── web/                    # Flask dashboard + endpoint /robot/enable|disable|stop|preset, /tracking/*
│   ├── config/                     # Preset posisi robot: new_preset.json (dirujuk DOBOT_PRESETS_JSON)
│   ├── model/                      # Model MediaPipe hand gesture recognizer (v3, ±8 MB)
│   ├── .env.example
│   ├── requirements.txt
│   └── main.py                     # Entry point (python main.py [--no-robot] [--ip] [--port])
│
└── README.md                       # This file
```

---

## Skema Database

### `packages`
Master katalog paket photo booth.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | BIGSERIAL PK | |
| code | TEXT UNIQUE | `regular` (Digital) atau `vip` (Print) |
| name | TEXT | Display name |
| description | TEXT | |
| base_price | INT | Harga dasar (Rp) |
| duration_secs | INT | Durasi sesi foto |
| print_count | SMALLINT | Jumlah cetak default |
| print_unit_price | INT | Harga cetak ekstra per lembar (di luar `print_count`) |
| image_src | TEXT | URL gambar paket |
| is_popular | INT (0/1) | Badge "Popular" |
| is_active | INT (0/1) | Toggle aktif |
| status | TEXT | `active` / `inactive` / `draft` (dipakai UI admin) |
| sort_order | INT | Urutan tampil |

### `sessions`
Sesi photo booth per user.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | TEXT PK | UUID |
| package_id | BIGINT FK packages | |
| package_code | TEXT | Denormalized cache |
| category | TEXT | Denormalized dari package_code (kompat legacy) |
| duration_secs | INT | Copied from package |
| print_count | INT | |
| print_unit_price | INT | Snapshot harga cetak ekstra saat sesi dibuat |
| price, discount, final_price | INT | |
| status | TEXT | `pending_payment` → `paid` → `shooting` → `completed` (+ `expired`) |
| frame_id | TEXT | Frame yang dipilih (NULL kalau Digital) |
| created_at, expires_at, completed_at | TIMESTAMPTZ | |

### `transactions`
Pembayaran Midtrans.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK sessions | CASCADE delete |
| midtrans_order_id | TEXT UNIQUE | |
| amount | INT | |
| status | TEXT | `pending`/`paid`/`failed`/`expired`/`cancelled` |
| qris_url | TEXT | QRIS image URL |
| qris_raw_string | TEXT | |
| paid_at, created_at | TIMESTAMPTZ | |

### `frames`
Master frame strips dengan slot coordinates.

| Kolom | Tipe | Catatan |
|---|---|---|
| id | TEXT PK | e.g. `frame-164` |
| name | TEXT | Display name |
| file_path | TEXT | Relative path `frames/frame-164.svg` |
| thumb_url | TEXT | `/storage/frames/frame-164.svg` |
| photo_slots | INT | Jumlah slot |
| canvas_width, canvas_height | INT | Default 464×696 |
| slots | JSONB | `[{id, shape: 'rect'/'ellipse'/'circle', x, y, width, height, label}, ...]` — id selalu dinormalisasi unik oleh backend (`ensureSlotIDs`) |
| is_active, sort_order | | |

### `photos`
Foto raw (hasil capture) dan framed (hasil compose).

| Kolom | Tipe | Catatan |
|---|---|---|
| id | TEXT PK | UUID |
| session_id | TEXT FK sessions | CASCADE delete |
| file_path | TEXT | `sessions/{id}/raw/photo.jpg` atau `sessions/{id}/framed/result.jpg` |
| file_name | TEXT | |
| type | TEXT | `raw` atau `framed` |
| selected | INT (0/1) | User pilih untuk dimasukkan ke strip |
| position | INT | Urutan di strip (1, 2, 3) |
| created_at | TIMESTAMPTZ | |

### `vouchers` + `voucher_usage`
Diskon code.

| Kolom (vouchers) | Tipe | Catatan |
|---|---|---|
| code | TEXT PK | Uppercase |
| description | TEXT | |
| discount_type | TEXT | `percent` atau `fixed` |
| discount_value | INT | % atau Rupiah |
| min_price | INT | Minimum order |
| max_uses, used_count | INT | |
| is_active | INT (0/1) | |
| expires_at | TIMESTAMPTZ | |

---

## API Endpoints

| Method | Path | Tujuan |
|---|---|---|
| GET | `/health` | Liveness probe |
| GET | `/storage/*` | Static file server (frames, photos, audio) |
| GET | `/api/package` | List paket aktif |
| POST | `/api/session/create` (alias `/api/session`) | Buat sesi baru |
| GET | `/api/session/{id}` | Detail sesi |
| PATCH | `/api/session/{id}/status` | Update status sesi |
| POST | `/api/payment/create` (alias `/api/payment/`) | Buat QRIS payment |
| GET | `/api/payment/status/{orderID}` (alias `/api/payment/{orderID}/status`) | Cek status |
| POST | `/api/payment/webhook` | Midtrans notification |
| POST | `/api/voucher/apply` | Apply voucher ke session |
| POST | `/api/voucher/remove` | Cabut voucher |
| GET | `/api/frames` | List frames dari DB (dengan slots) |
| POST | `/api/photo/upload` | Upload single photo (multipart) |
| POST | `/api/photo/compose` | Save composition (multipart: frame + filter + image blob) |
| POST | `/api/photo/print` | Cetak komposisi (strip framed terbaru) ke printer — [`PrintComposition`](backend/handlers/photo.go) |
| GET | `/api/photo/session/{id}/drive` | Link folder Google Drive publik hasil sesi (kalau fitur Drive aktif) — [`GetSessionDriveLink`](backend/handlers/drive.go) |
| GET | `/api/photo/session/{id}` | List raw photos |
| GET | `/api/photo/session/{id}/framed` | List framed photos |
| GET | `/api/photo/download/{photoID}` | Download single photo |
| GET | `/api/photo/session/{id}/gif` | Slideshow GIF — loop foto raw terpilih. Pakai `?inline=1` untuk preview di `<img>` (Content-Disposition: inline). |
| GET | `/api/photo/session/{id}/gif-live` | Live strip GIF — framed strip dengan tiap slot animated dari burst frames. Pakai `?inline=1` untuk inline preview. |
| GET | `/api/photo/session/{id}/gif-live/available` | Cek ringan apakah Live Strip GIF tersedia (perlu framed + burst frames). |
| GET | `/api/robot/status` | Cek kamera connected + type |
| POST | `/api/robot/capture` | Manual trigger capture (Canon) |
| GET | `/api/robot/liveview` | Single live frame JPEG (Canon). Dipakai untuk probe/debug — preview kiosk memakai endpoint stream di bawah |
| GET | `/api/robot/liveview/stream` | MJPEG ~10 fps (Canon) — sumber live preview `/photo-session`. Balas `503` kalau kamera tidak mengirim frame, dan menutup koneksi setelah 20 kegagalan beruntun supaya frontend bisa reconnect |
| GET | `/api/robot/session/{id}` | Session photos (alias) |
| POST | `/api/robot/enable` | Backend → call robot URL `/robot/enable` |
| POST | `/api/robot/disable` | Backend → call robot URL `/robot/disable` |
| POST | `/api/robot/stop` | Emergency stop |
| POST | `/api/robot/preset` | Backend → call robot URL `/robot/preset` + schedule capture |
| POST | `/api/robot/moving` (alias `/api/robot/move`) | Robot → backend, mulai gerak preset (update `current_preset`) |
| POST | `/api/robot/done` | Robot → backend, selesai gerak (schedule auto-capture 3s) |
| POST | `/api/robot/webhook` | Generic event from robot |
| GET | `/api/robot/config` | Current robot/auto-capture state (di-polling frontend tiap 250ms) |
| GET | `/api/config` | Timer config tiap layar user (dibaca frontend saat runtime) |
| GET | `/api/robot-settings` | Robot & gesture tuning aktif (dibaca service dobot saat start) |

---

## User Flow

### Flow kiosk

```
[ / Home ]
    │
    ↓ Pilih paket
[ /package ]
    │
    ↓ Lanjut bayar
[ /payment/summary ]   ← Voucher input (keyboard on-screen, auto uppercase)
    │
    ↓ Konfirmasi
[ /payment/pay ]       ← QRIS scan (120s timer)
    │
    ↓ Status = paid (via Midtrans webhook)
[ /instruction ]       ← 3 steps + 60s timer
    │                    Step 3: 🔊 infoPreset → pilGesture → pilAcam
    ↓ "Got it, Let's Go!" → POST /api/robot/enable
[ /photo-session ]     ← 🔊 inisiasiGJ.mp3, live preview (mirrored)
    │                    5 menit session timer (durasi mengikuti paket, seed = 300s)
    │                    Robot trigger: 🔊 presetOk.mp3
    │                    Auto-capture: countdown 3-2-1 (🔊 tiga/dua/satu.mp3)
    │                    + modal hasil 3 detik
    │                    POST /api/robot/disable saat timer 0
    │
    ↓ VIP                              ↓ Digital
[ /photo-editor ]                [ /session-end ]
  Select & Edit                    ← 30s timer
  (2 menit timer)                    QR code dynamic
  Tap foto → tap slot (nomor)        (per-session URL)
  Pilih frame + filter
  Confirm Print → save               ↓ 30s
    ↓                            [ DoneScreen ]
[ /session-end ]                   "Thank You!"
                                     ↓ 30s
                                 [ / Home ]
```

### Flow HP (download)

User scan QR code di `/session-end` → buka `http://<kiosk-ip>:3000/download-photos/{sessionId}` di HP.

```
[ /download-photos/{sessionId} ]
  Header: "Download Your Photos"
  Section "Hasil Strip"       — framed composition (object-contain 2:3)
  Section "Animated GIF"      — 2 card:
                                  • Slideshow Foto (loop foto raw)
                                  • Live Strip (framed + burst, hanya tampil
                                    kalau /gif-live/available returns true)
  Section "Foto Mentah"        — semua raw photos (grid 2×N atau 3×N)
  Tombol "Download Semua (N)"  — sticky di bottom
```

Tap ikon download di tiap card → fetch blob → trigger browser download via `<a download>`.

---

## Integrasi Robot

Robot di-trigger oleh backend (forward dari frontend) dan callback balik via webhooks.

### Robot Service — Gesture Control App (`dobot/`)

Implementasi "robot" ada di folder [`dobot/`](dobot/) — service Python (**Flask + MediaPipe**) yang membaca gesture jari dari kamera lalu menggerakkan lengan **Dobot Nova 5** ke posisi preset. Service inilah yang menyediakan endpoint `/robot/*` yang dipanggil backend, sekaligus yang mengirim callback `/api/robot/moving` & `/done` balik ke backend.

**Menjalankan robot service:**

```powershell
cd dobot
python -m venv venv; venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # sesuaikan DOBOT_IP, CAMERA_INDEX, BACKEND_URL
python main.py                  # mode penuh (kamera + robot)
python main.py --no-robot       # mode visi saja (robot dry-run, tanpa hardware)
```

Dashboard robot: `http://localhost:5001`. Untuk koneksi langsung (backend & robot satu PC), set `ROBOT_API_URL` di [backend `.env`](#konfigurasi-environment) ke `http://localhost:5001` — **ngrok hanya perlu bila backend berada di jaringan berbeda** dari PC robot.

**Konfigurasi utama (`dobot/.env`):** `DOBOT_IP` (IP robot), `CAMERA_INDEX` (`0` = webcam utama), `BACKEND_URL` (default `http://localhost:8080`), `MP_MODEL_PATH` (model gesture), preset via `DOBOT_PRESETS_JSON`. Semua field wajib terisi — loader menolak default tersembunyi.

**Alur sesi (session-locked):** robot tidak aktif sampai sesi dibuka via `/robot/enable`. Setelah aktif → tahan gesture "semua jari" 1,5 detik (SAFETY_HOLD_SEC) untuk buka kunci → tunjukkan gesture preset → robot bergerak → jeda → terkunci lagi. Akhiri via `/robot/disable` (robot pulang ke initial pose, servo off).

**Peta gesture → preset:**

| Gesture | Preset | Gesture | Preset |
|---|---|---|---|
| Telunjuk | 1 | Jempol | 6 |
| Telunjuk + Tengah | 2 | Jempol + Telunjuk | 7 |
| + Jari Manis | 3 | + Tengah | 8 |
| + Kelingking | 4 | + Jari Manis | 9 |
| Semua jari | 5 | Kepalan (fist) | 10 |

### Backend → Robot

`services/robot.go` mengirim request ke `${ROBOT_API_URL}/robot/<action>`:

| Frontend call | Backend forward | Robot terima |
|---|---|---|
| `POST /api/robot/enable` | `POST {ROBOT_API_URL}/robot/enable` | (kosong) |
| `POST /api/robot/disable` | `POST {ROBOT_API_URL}/robot/disable` | (kosong) |
| `POST /api/robot/stop` | `POST {ROBOT_API_URL}/robot/stop` | (kosong) |
| `POST /api/robot/preset` | `POST {ROBOT_API_URL}/robot/preset` | `{"preset": N}` |
| admin simpan tuning | `POST {ROBOT_API_URL}/config/runtime` | robotSettings (camelCase) |

Selain endpoint di atas, frontend memanggil service dobot **langsung** (bukan lewat backend) untuk panel Gesture Detection: `GET {NEXT_PUBLIC_ROBOT_URL}/detection` (state FSM + gesture + progress, poll 150ms) dan `GET {NEXT_PUBLIC_ROBOT_URL}/video_feed` (stream MJPEG kamera deteksi tangan).

### Robot → Backend (callbacks)

Robot harus call ini saat siklus gerak:

| Robot panggil | Body | Effect di backend |
|---|---|---|
| `POST /api/robot/moving` (alias `/move`) | `{"preset": N, "session_id": "..."}` | Update `current_preset`, reset `auto_capture_at`. Frontend deteksi → play `presetOk.mp3` |
| `POST /api/robot/done` | `{"preset": N, "session_id": "..."}` | Schedule auto-capture 3 detik kemudian (window untuk countdown 3-2-1 di frontend) |
| `POST /api/robot/webhook` | `{"preset": N, "event": "ended"}` | Reset robot state (`current_preset = 0`, `auto_capture_at = zero`) |

`session_id` opsional — kalau kosong, backend ambil session paid/shooting terbaru dari DB.

### Capture flow di mode Canon

```
Robot → POST /api/robot/done
        │
        ↓ backend schedules goroutine
        ↓ time.Sleep(3s) — frontend tampilkan countdown 3-2-1
        ↓
backend services.TriggerCapture()
        ↓
digiCamControl POST /?CMD=LiveView_Capture
        ↓
backend save JPEG to storage/sessions/{id}/raw/canon_*.jpg
        ↓ insert ke photos table
done.
```

---

## Mode Kamera

Canon-only via digiCamControl. Saat startup ([services/camera.go:CheckCamera](backend/services/camera.go)) backend probe `GET ${DIGICAM_BASE_URL}/camera` + liveview; kalau frame valid → kamera online, kalau tidak → offline (tidak ada lagi fallback webcam laptop).

### Mirror behavior

Preview liveview di-mirror di sisi frontend (CSS `scaleX(-1)` pada `<img>` stream), jadi user lihat preview mirrored (familiar selfie) tanpa backend perlu decode+re-encode JPEG tiap frame. Snapshot freeze saat shutter ikut di-mirror supaya konsisten dengan yang barusan dilihat user. Hasil foto Canon disimpan apa adanya (natural orientation, tidak di-flip).

---

## Audio Cues

Narasi suara (voice-over Bahasa Indonesia) menemani **seluruh alur kiosk** — tiap halaman punya panduan suara yang dipicu saat masuk / interaksi kunci. Semua file MP3 di `backend/storage/audio/`, di-serve via `${API_URL}/storage/audio/<file>.mp3`.

| File | Trigger | Lokasi kode |
|---|---|---|
| `mulai.mp3` | Loop ajakan di Home saat sensor robot melihat orang lewat (`/presence`, throttle 5s) | `HomePage.tsx` |
| `selamatDatang.mp3` | Tap di mana saja di Home (sekaligus meng-unlock autoplay browser) | `HomePage.tsx` |
| `jumlahCetak.mp3` | Buka modal jumlah cetak (paket Print) | `PrintQuantityModal.tsx` |
| `voucherBerhasil.mp3` / `voucherGagal.mp3` | Hasil apply voucher di summary (`valid` true/false, termasuk request error) | `useVoucher.ts` |
| `pembayaranDiproses.mp3` | Status pembayaran → `processing` | `PaymentStatus.tsx` |
| `pembayaranBerhasil.mp3` | Status pembayaran → `success` | `PaymentStatus.tsx` |
| `pembayaranGagal.mp3` | Status `failed`/`expired`, atau timer bayar habis | `PaymentStatus.tsx` / `PayPage.tsx` |
| `introDengar.mp3` → `waktuSesi.mp3` → `infoSingkat.mp3` | Step get-ready; `waktuSesi` menyorot ring durasi, `infoSingkat` menyorot 3 kartu info | `InstructionPage.tsx` (`STEP_CUES`) |
| `keselamatanNoM.mp3` → `deteksiSatu.mp3` | Step safety; `deteksiSatu` menyorot baris "only one person's hand" | `InstructionPage.tsx` |
| `infoPreset.mp3` → `pilGesture.mp3` → `pilAcam.mp3` | Step gesture-controls; menyorot kartu gesture (kanan) lalu panggung kamera (kiri) | `InstructionPage.tsx` |
| `inisiasiGJ.mp3` | Masuk `/photo-session` page; juga re-prompt tiap 5s saat robot LOCKED & tidak ada tangan (maks 3×) | `PhotoSessionPage.tsx` |
| `tahan3D.mp3` | Robot masuk fase `UNLOCKING`/`CONFIRMING` (gesture mulai terbaca) | `PhotoSessionPage.tsx` |
| `unlock.mp3` | Robot masuk fase `UNLOCKED` (kunci terbuka, siap terima gesture preset) | `PhotoSessionPage.tsx` |
| `habisFoto.mp3` | 30 dtk terakhir sesi foto (narasi prioritas) | `PhotoSessionPage.tsx` |
| `presetOk.mp3` | Robot move ke preset baru (`current_preset` berubah) | `CameraPreview.tsx` |
| `tiga.mp3` / `dua.mp3` / `satu.mp3` | Countdown detik 3 / 2 / 1 | `CameraPreview.tsx` |
| `sentuhFrame` → `seretFoto` → `seretZoom` → `filter` → `pilihCetakFoto` | Step 1–5 tutorial editor foto (satu narasi per step, ikut tombol Next/dot) | `PhotoEditorOnboarding.tsx` |
| `habisEdit.mp3` | 15 dtk terakhir di editor foto | `PhotoEditorPage.tsx` |
| `fotoProses.mp3` | Layar get-photos muncul (fase loading) | `GetPhotosScreen.tsx` |
| `scanQr.mp3` | QR download tampil | `GetPhotosScreen.tsx` |
| `terimakasih.mp3` | Done screen tampil | `DoneScreen.tsx` |

Cadangan yang sudah ada di folder tapi belum dipakai: `introBaca`, `inisiasiGesture`, `inisiasiJari`, `keselamatanSatu`, `keselamatanDuaM`, `tahan5D` — varian narasi untuk mode kontrol / durasi hold / jumlah orang yang berbeda.

### Helper ([`lib/audio.ts`](frontend/src/lib/audio.ts))

- `playBackendAudio(filename, onEnded?)` — putar clip, cache Audio instance, silent saat autoplay block / file hilang. **Satu channel**: narasi baru menghentikan voice lama yang masih berbunyi (clip beda) supaya tidak menumpuk — cocok untuk cue robot real-time yang statenya cepat berganti. `onEnded` dipanggil saat clip selesai (dengan pengaman timeout kalau event `ended` tak fire).
- `preloadBackendAudio()` — dipanggil sekali saat kiosk boot ([`providers.tsx`](frontend/src/app/providers.tsx)); download + buffer semua clip supaya play pertama tiap halaman tanpa jeda.
- `playBackendAudioAfterCurrent(filename, onEnded?)` — putar SETELAH narasi yang sedang berbunyi selesai; mencegah dua narasi bertabrakan saat pindah halaman cepat (mis. "pembayaranBerhasil" → "introDengar").
- `stopBackendAudioFile(filename)` — hentikan SATU clip saja. Dipakai saat pemicu narasinya ditutup lebih cepat dari suaranya (tombol Skip di tutorial editor), tanpa ikut memotong narasi lain seperti peringatan waktu — beda dari `stopBackendAudio()` yang menyapu seluruh cache saat sesi berakhir.
- `whenVoiceIdle(cb)` — jalankan `cb` saat narasi yang sedang berbunyi selesai (atau langsung kalau senyap). Karena `currentVoice` adalah state modul yang bertahan lintas navigasi SPA, dipakai untuk **gating interaksi**: mis. kartu paket baru bisa diklik setelah "selamatDatang" selesai.

### Gating interaksi berbasis suara

Beberapa halaman menahan interaksi/tombol sampai narasinya selesai agar user mendengarkan dulu:
- **Package** — kartu paket redup & non-clickable selama "selamatDatang" masih berbunyi (`whenVoiceIdle`).
- **Instruction** — tombol "Next" di step get-ready & safety baru muncul setelah SELURUH rangkaian narasi step itu selesai (`playBackendAudio` `onEnded` berantai → `buttonReady`).
- **Tutorial editor foto** — tombol "Next"/"Got it" tiap step baru muncul setelah narasi step itu habis; putaran pertama tanpa Skip. Skip di tengah narasi menghentikan suaranya (`stopBackendAudioFile`).

---

## Animated GIF Output

Setiap sesi yang sukses compose menghasilkan **dua varian animated GIF** yang bisa di-preview/download dari `/download-photos/{sessionId}`:

### GIF #1 — Slideshow

- File: `storage/sessions/{id}/animation.gif`
- Endpoint: `GET /api/photo/session/{id}/gif` (tambah `?inline=1` untuk preview di `<img>`)
- Isi: rotasi foto raw terpilih (3 foto), 0.7s per frame, loop forever
- Canvas 360×540, palette 256 colors + Floyd-Steinberg dithering supaya gradasi kulit/langit tidak banding parah
- Generator: [`services/gif.go:GenerateSessionGIF`](backend/services/gif.go)

### GIF #2 — Live Strip

- File: `storage/sessions/{id}/animation-live-v2.gif` (suffix `-v2` versioned — bump saat compositing logic berubah supaya cache lama otomatis di-skip)
- Endpoint: `GET /api/photo/session/{id}/gif-live` (tambah `?inline=1` untuk inline preview)
- Availability cek: `GET /api/photo/session/{id}/gif-live/available` → frontend hide tombol kalau tidak available (mis. liveview Canon gagal saat countdown, tidak ada burst frames)
- Isi: framed strip sebagai base, tiap slot foto diisi rentetan burst-frame liveview (3 detik momen sebelum jepret), lalu settle ke foto final
- Compositing: **z-order benar** — burst di-draw di tengah, frame design (extracted dari embedded base64 PNG di SVG) di-overlay ON TOP supaya dekorasi window (rounded corner / border) tidak ke-timpa burst
- Frame yang tidak punya embedded PNG (mis. path-based SVG) gracefully fall back ke compositing lama — di-log dengan `ℹ️  frame overlay: SVG ... tidak punya embedded PNG (non-standar)`
- Generator: [`services/gif_live.go:GenerateLiveStripGIF`](backend/services/gif_live.go)

### Burst capture

Selama 3 detik countdown (antara `POST /api/robot/done` dan shutter trigger), backend men-snapshot liveview frames ke `storage/sessions/{id}/burst/pending/frame_NNN.jpg`. Setelah capture sukses dan `photoID` di-assign, folder pending di-rename ke `burst/{photoID}/` (atomic move).

- Sumber frame = liveview Canon (digiCamControl)
- Interval 280ms, max 12 frames, durasi 3 detik
- Per-frame call wrapped `time.After(560ms)` supaya satu frame lambat tidak nahan loop
- Implementation: [`services/burst.go`](backend/services/burst.go)

### Pre-generation

Saat user submit compose dari photo-editor, backend langsung kick off **kedua generator** di goroutine. Jadi pas user buka halaman download di HP, file GIF umumnya sudah siap (tidak perlu wait 3-5 detik untuk first hit). Lock per-session ([`gifGenLocks`](backend/services/gif.go)) memastikan request paralel tidak race — yang kedua menunggu yang pertama selesai dan reuse cache-nya.

Cache invalidation pakai mtime: kalau framed strip / burst frames / frame SVG ada yang lebih baru dari GIF output, generator regenerate. Jangan-jangan force-bust dengan delete file di `storage/sessions/{id}/animation*.gif`.

---

## Safeguard Sesi Foto

Saat session timer (5 menit di `/photo-session`) habis tepat waktu robot sedang gerak atau countdown shutter masih jalan, **sesi tidak langsung end** — foto terakhir bisa ke-cut di tengah jepretan. Frontend ([`PhotoSessionPage.tsx`](frontend/src/features/public/photo-session/pages/PhotoSessionPage.tsx)) menahan end-effect sampai robot selesai:

```
sessionTimeLeft = 0  AND  robotBusy = false  AND  robotConfigFetched = true
                                ↓
                  → broadcast SESSION_END → disable robot → navigate
```

Selama menunggu, header timer tampil `-MM:SS` (mis. `-00:01`, `-00:02`, …) sebagai indikator overtime. Hard cap **30 detik** mencegah kiosk hang kalau robot stuck atau webhook `/done` tidak fire.

`robotBusy` ditentukan dari poll `/api/robot/config` (shared via `useRobotConfig()` hook — single underlying request, di-konsumsi juga oleh `CameraPreview` untuk countdown overlay):

```ts
robotBusy = (current_preset ?? 0) > 0 || auto_capture_active === true
```

Edge case yang dihandle: kalau halaman refresh tepat saat `sessionTimeLeft` sudah 0 dan `robotConfig` belum sempat fetch, end-effect tahan dulu sampai `isFetched = true` dari React Query — supaya grace check tidak ke-skip.

---

## Testing dengan curl

### Setup session untuk testing

```bash
# Linux/Mac/Git Bash:
SID=$(curl -s -X POST http://localhost:8080/api/session/create \
  -H 'Content-Type: application/json' \
  -d '{"packageId":1,"printCount":0}' | python -c "import sys,json;print(json.load(sys.stdin)['data']['id'])")

curl -s -X PATCH "http://localhost:8080/api/session/$SID/status" \
  -H 'Content-Type: application/json' -d '{"status":"paid"}'

echo "Session ID: $SID"
```

### Trigger auto-capture (simulasi robot done)

```bash
curl -X POST http://localhost:8080/api/robot/done \
  -H 'Content-Type: application/json' \
  -d "{\"preset\":1,\"session_id\":\"$SID\"}"
```

### Cek photos hasil capture

```bash
sleep 4
curl -s "http://localhost:8080/api/photo/session/$SID" | python -m json.tool
```

### Test Windows cmd

Escape quote dengan `\"`:
```cmd
curl -X POST http://localhost:8080/api/robot/done -H "Content-Type: application/json" -d "{\"preset\":1,\"session_id\":\"YOUR_SESSION_ID\"}"
```

---

## Troubleshooting

### Backend tidak start: "Gagal init database"
- Cek `DATABASE_URL` di `.env`
- Pastikan PostgreSQL running: `pg_isready -h localhost`
- Pastikan database `photobooth` sudah dibuat

### Frontend blank saat akses via LAN IP
- Cek `frontend/.env.local` → set `NEXT_PUBLIC_API_URL=` (kosong) atau ke LAN IP yang sama
- Restart `npm run dev` setelah ubah env
- Pastikan `allowedDevOrigins` di `next.config.ts` include IP Anda
- Windows Firewall: allow TCP port 3000 + 8080

### Live preview kosong / "Stream tidak tersedia"
Kamera Canon-only via digiCamControl — kalau preview kosong:
- Pastikan digiCamControl jalan dan kamera Canon terhubung (liveview aktif)
- Cek `DIGICAM_BASE_URL` di `.env` benar (default `http://localhost:5513/api`)
- `/api/robot/status` harus return `connected: true`
- Tes cepat: `go run ./cmd/probecheck` dari folder backend

### QR code di kiosk tidak bisa di-scan dari HP
- QR encode current `window.location.origin` + sessionId
- Kalau kiosk diakses via `localhost:3000`, QR encode `localhost:3000/...` → HP tidak bisa resolve
- Solusi: akses kiosk dari LAN IP, atau set `NEXT_PUBLIC_DOWNLOAD_PUBLIC_URL=http://192.168.x.x:3000` di `frontend/.env.local`

### Audio tidak play
- Browser block autoplay sebelum user interaction
- Pastikan user click tombol minimal 1× sebelum audio trigger
- Cek file ada di `backend/storage/audio/`
- Cek backend serve OK: `curl -I http://localhost:8080/storage/audio/satu.mp3`

### Robot enable gagal "ERR_NGROK_3200"
- `ROBOT_API_URL` di backend `.env` poin ke endpoint offline
- Set `ROBOT_API_URL=` (kosong) atau ke URL robot aktif

### Image Optimizer error "isn't a valid image"
- Jangan pakai `<Image>` dari `next/image` untuk URL dinamis dari backend
- Sudah di-replace semua dengan plain `<img>` (lihat PhotoCard, PackageCard, dll)

### Build production fail "Cross origin request blocked"
- Hanya dev mode yang punya restriction ini
- `npm run build && npm run start` (production) tidak block

### Live Strip GIF: foto burst tampak "diluar frame" di awal animasi
- Bug compositing lama — burst di-draw ON TOP framed strip, ke-timpa frame border
- Sudah fixed: filename output bumped ke `animation-live-v2.gif`, generator overlay frame design di atas burst
- Kalau session lama masih ke-cache buggy version, hapus manual: `rm storage/sessions/<id>/animation-live.gif` (file lama tanpa `-v2` suffix)

### Live Strip GIF kosong / hilang dekorasi frame untuk `frame-165`
- `frame-165.svg` pakai path-based SVG (bukan embedded base64 PNG seperti frame lain)
- `loadFrameOverlay` regex tidak match → gracefully fall back ke compositing lama (burst nimpa frame border)
- Log: `ℹ️  frame overlay: SVG storage/frames/frame-165.svg tidak punya embedded PNG (non-standar)`
- Fix proper: re-export `frame-165` ke format yang sama (embedded base64 PNG di SVG, dimensi 464×696), atau tambah SVG renderer di backend

### Sesi tidak end padahal timer sudah 0
- Safeguard: backend masih sibuk (preset moving atau countdown shutter) — frontend tampil timer negatif `-00:01`, `-00:02`, ...
- Hard cap 30 detik (lihat [Safeguard Sesi Foto](#safeguard-sesi-foto))
- Kalau lebih dari 30s masih stuck: cek `/api/robot/config` — kemungkinan `current_preset` tidak pernah reset (robot webhook `/done` tidak fire ke backend). Reset manual via `POST /api/robot/webhook` dengan `{"event":"ended","preset":N}`.

### Edit frame/paket/voucher balik ke nilai awal setiap restart
- Penyebab (versi lama): seed `init.sql` pakai `ON CONFLICT DO UPDATE` yang menimpa data tiap server boot. Hanya data **default** (frame-164…167, paket regular/vip, 4 voucher) yang terdampak; data baru aman.
- **Sudah fixed:** seed diubah ke `ON CONFLICT DO NOTHING` (insert-only). Pastikan kamu pakai `init.sql` terbaru, lalu restart backend dan edit ulang sekali data yang sempat ke-reset — setelah itu permanen.

### Photo editor crash `Cannot read properties of null (reading 'clearRect')`
- Terjadi saat ganti frame dengan dimensi berbeda — canvas Fabric lama sudah di-dispose tapi masih dipanggil `.clear()`.
- **Sudah fixed:** effect render kini memakai instance canvas hidup via `getFabricCanvas()` (ref), bukan closure basi. Pastikan pakai versi terbaru `PreviewArea.tsx` + `useCanvasRenderer.ts`.

### "Pilih 3 foto dulu" saat klik Confirm di photo-editor
- Slot belum terisi semua (kurang dari jumlah slot frame). Frontend block submit supaya tidak hit error 400 backend
- Tap foto di panel kiri (foto ter-"armed"), lalu tap slot bernomor yang masih kosong di canvas tengah
- Kalau timer 2 menit habis dengan slot belum penuh, otomatis skip save dan navigate ke `/session-end`

---

## Lisensi

Project internal magang Jonas. Bukan untuk distribusi publik.
#