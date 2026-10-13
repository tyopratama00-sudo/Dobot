/**
 * Kinematika robot arm 6-axis untuk visualisasi 3D di kartu Automatic Poses.
 *
 * Aset: /public/arm/1c.glb .. 7c.glb — 7 link kaku hasil kompresi meshopt
 * (gltfpack -cc -si 0.35). Tiap file berisi SATU mesh statis tanpa skeleton,
 * dan yang penting: origin tiap file sudah berada tepat di titik joint-nya
 * sendiri, sumbu Y-up, satuan milimeter. Jadi rantai FK cukup dibangun dengan
 * menyusun link secara bersarang (1 → 2 → ... → 7), tiap level digeser
 * `offset` lalu dirotasi terhadap `axis` sebesar sudut preset.
 *
 * Sumbu & offset TIDAK ditebak: keduanya diukur dari mesh-nya. Tiap joint kawin
 * pada satu bidang datar berbentuk cincin (flange), dan pusat cincin itu selalu
 * tepat di sumbu putar. Pada link ANAK cincin tersebut berpusat di titik asalnya
 * sendiri, jadi:
 *   - normal bidang cincin anak  = sumbu putar joint itu
 *   - offset = pusat cincin induk − pusat cincin anak
 * Pencocokan dilakukan dengan mendeteksi gugus titik sebidang yang membentuk
 * cincin, lalu memasangkan induk↔anak berdasarkan jari-jari yang sama dan sisi
 * material yang berlawanan (saling berhadapan).
 *
 * Hasilnya: J1=Y (yaw base), J2/J3/J4=Z (bahu–siku–pergelangan, saling sejajar),
 * J5=Y, J6=Z — persis susunan lengan kolaboratif 6-axis pada umumnya. Bidang
 * gerak utama arm karenanya adalah bidang XY, dan J1 memutar bidang itu.
 */

export type JointAxis = 'x' | 'y' | 'z';

export interface ArmLink {
  /** Path ke .glb link ini (versi terkompresi meshopt). */
  url: string;
  /** Pergeseran dari joint induk ke joint link ini, dalam mm (frame induk). */
  offset: [number, number, number];
  /** Sumbu putar joint link ini. */
  axis: JointAxis;
  /** Batas sudut wajar (derajat) — dipakai slider kalibrasi & clamp pose. */
  limit: [number, number];
  label: string;
}

/**
 * Rantai link dari base ke flange kamera. Link 0 (base) tidak ikut berputar
 * pada pose manapun, tapi tetap didefinisikan supaya indeks sudut = indeks link.
 */
export const ARM_LINKS: ArmLink[] = [
  {
    url: '/arm/1c.glb',
    offset: [0, 0, 0],
    axis: 'y',
    limit: [0, 0], // pedestal — tidak pernah berputar
    label: 'Base (fixed)',
  },
  {
    url: '/arm/2c.glb',
    // 149.5 = duduk RATA di atas pedestal, bukan 136.5 hasil pencocokan flange.
    // Bbox mesh: pedestal (1c) berakhir di Y 149.5, badan J1 (2c) mulai di Y 0 —
    // pada 136.5 skirt J1 tenggelam 13 mm ke dalam pedestal dan menelan cincin
    // biru, sehingga cincin hanya muncul sebagai busur sepotong (terlihat
    // "miring"). 149.5 membuat kedua permukaan bersentuhan persis: cincin utuh
    // mengelilingi, tanpa celah dan tanpa tumpang tindih. Nilainya TIDAK boleh
    // ditambah lagi — lebih tinggi = flange baut di dalam pedestal terekspos.
    // Konsekuensinya seluruh rantai berdiri 13 mm lebih tinggi dari FK robot
    // asli; ini model tampilan kartu, tidak dipakai mengendalikan robot.
    offset: [0, 149.5, 0],
    axis: 'y',
    limit: [-360, 360],
    label: 'J1 base yaw',
  },
  {
    url: '/arm/3c.glb',
    offset: [0, 97.4, 44.5],
    axis: 'z',
    limit: [-180, 180],
    label: 'J2 shoulder',
  },
  {
    url: '/arm/4c.glb',
    offset: [0, 399.8, 13.0],
    axis: 'z',
    limit: [-180, 180],
    label: 'J3 elbow',
  },
  {
    url: '/arm/5c.glb',
    offset: [0, 330.0, -2.0],
    axis: 'z',
    limit: [-180, 180],
    label: 'J4 wrist pitch',
  },
  {
    url: '/arm/6c.glb',
    offset: [0, 64.0, 71.2],
    axis: 'y',
    limit: [-180, 180],
    label: 'J5 wrist yaw',
  },
  {
    url: '/arm/7c.glb',
    offset: [0, 56.0, 57.5],
    axis: 'z',
    limit: [-360, 360],
    label: 'J6 flange roll',
  },
];

/** Sudut (derajat) tiap link, urut sesuai ARM_LINKS. */
export type ArmPose = number[];

/** InitialPose (home) robot asli, dari new_preset.json. */
export const REST_POSE: ArmPose = [
  0, 71.627, -4.2947, 4.2431, 8.6527, -102.0457, 118.9324,
];

/**
 * Catatan arah (dilihat dari depan, kamera di +Z):
 *  - J1 (sumbu Y) menyapu arm ke kiri/kanan; positif = ke kiri.
 *  - J2/J3/J4 (sumbu Z) menekuk arm di bidang layar; negatif = condong kanan.
 *    Jumlah ketiganya menentukan orientasi flange, jadi menjaga totalnya
 *    mendekati 0 membuat kamera tetap tegak.
 *  - J5 (sumbu Y) memutar arah pandang kamera; J6 (sumbu Z) memutar gambar.
 *    Kamera membidik sepanjang +Z, sejajar sumbu J2/J3/J4 — itu sebabnya
 *    ketiganya tidak bisa menunduk/menengadahkan kamera, hanya J5 & J1 yang
 *    mengubah arah bidik.
 */

/**
 * Sepuluh pose preset — sudut joint ASLI robot, disalin dari
 * `dobot/config/new_preset.json` (bukan lagi karangan visual).
 *
 * Urutan mengikuti NAME_TO_SLOT di `dobot/app/robot/presets.py`: slot 1..10
 * adalah preset pose (indeks array 0..9). Slot 11 (P13) sengaja TIDAK ada
 * di sini — presets.py menandainya "(transit)" dan `build_sequence_order`
 * hanya memakai slot 1..10, jadi ia bukan tujuan pose manapun.
 *
 * Sudut dipakai apa adanya tanpa pembalikan tanda. Itu diverifikasi, bukan
 * diasumsikan: tiap entry di JSON juga membawa `coordinate` (posisi TCP), dan
 * menjalankan FK model ini atas `joint` mereproduksi `coordinate` dengan selisih
 * tinggi yang KONSTAN ~36 mm — yaitu jarak sumbu J6 ke muka flange (link 7
 * mengisi Z 0..36 mm). Selisih konstan = beda titik acuan, bukan beda konvensi.
 */
export const PRESET_POSES: ArmPose[] = [
  // slot 1 — P1
  [0, -181.6155, 41.3417, -128.3843, 176.698, 90.3299, 95.9432],
  // slot 2 — P2
  [0, -181.6155, 1.4617, -0.4355, 75.3476, 89.5603, 95.7944],
  // slot 3 — P21
  [0, -95.8093, 67.9379, -4.508, 25.8606, 90.4533, 31.3784],
  // slot 4 — P14
  [0, -95.3419, -67.5285, -4.5434, -15.5512, -92.4524, 159.1385],
  // slot 5 — P15
  [0, -180.2091, -35.7045, -4.5434, -60.4824, -92.4524, 274.0505],
  // slot 6 — P16
  [0, -179.5515, -134.7093, -3.065, 80.2664, -89.318, 274.3513],
  // slot 7 — P17
  [0, -92.5243, -114.5797, -54.6442, 79.868, -115.1692, 166.9625],
  // slot 8 — P18
  [0, -242.1883, -123.1717, -55.1722, 98.1, -66.6796, -14.4391],
  // slot 9 — P10
  [0, -359.0795, -65.3797, 50.591, -69.3432, -90.9356, 86.6585],
  // slot 10 — P11
  [0, -4.6187, 78.0587, -14.5018, -156.4696, -88.2412, 88.7033],
];

/**
 * Skala render: aset dalam mm, jangkauan arm ~1,1 m. Dibagi supaya tinggi arm
 * jatuh di kisaran 1 unit world — enak untuk kamera perspektif default.
 */
export const ARM_SCALE = 1 / 1100;

/**
 * Kamera DSLR yang dipasang di flange (link 7), dikonversi dari OBJ 3ds Max ke
 * glb meshopt. Satuannya kebetulan sama-sama mm seperti arm, jadi tanpa scale.
 *
 * Sumbu flange TIDAK searah lensa. Itu terukur: +Z link 7 menunjuk rata-rata
 * 79° ke atas di kesepuluh preset, jadi kamera memang berdiri tegak di atas
 * flange (alasnya menempel), bukan membidik searah flange.
 *
 * Arah bidiknya = −X link 7. Dari enam sumbu lokal yang diuji, hanya sumbu X
 * yang mendatar (rata-rata −1°) DAN berkas pandangnya memusat ke satu titik —
 * meleset 189 mm, dibanding 496–568 mm untuk sumbu lain. Titik temunya ≈1,65 m
 * di depan robot setinggi kepala, yaitu posisi orang yang difoto; tanda −X
 * menang 10/10 (dot ≈ −0,99).
 */
export const CAMERA_MODEL = {
  url: '/kamera/cam.glb',

  /**
   * Kamera dipasang lewat lubang tripod di ALASNYA, duduk di muka flange J6.
   * Syarat itu mengunci orientasinya sepenuhnya — tidak ada yang perlu ditebak:
   *   - alas kamera (+Z model) → sumbu flange (+Z link 7)
   *   - lensa (−Y model)      → arah bidik (−X link 7)
   * Satu-satunya rotasi yang memenuhi keduanya (dan tetap tangan-kanan) adalah
   * putaran −90° terhadap Z.
   *
   * Sumbu model diukur, bukan diasumsikan: mengiris mesh per sumbu menunjukkan
   * ujung −Y berpenampang lingkaran ⌀78 mm (rmean/rmax 0,75) = moncong lensa,
   * sedangkan Z rendah adalah bidang lebar rata 144×104 mm = pelat alas.
   */
  rotation: [0, 0, -Math.PI / 2] as [number, number, number],

  /**
   * Titik pasang di frame link 7 (mm). Z = 36 menempatkan alas kamera persis
   * di muka flange (badan link 7 mengisi Z 0..36). X/Y menggeser bodi agar
   * sumbu optiknya jatuh di atas sumbu flange, seperti kamera di kepala tripod.
   */
  position: [10, -15, 36] as [number, number, number],
};

/**
 * Yaw seluruh scene supaya arah bidik kamera menghadap penonton.
 *
 * Titik subjek hasil pemusatan berada di azimut ~180,7° dari basis robot.
 * Kamera kartu TIDAK memandang lurus dari +Z melainkan serong — posisinya
 * [0.67, 0.4, 2.46], yaitu azimut 74,8°. Jadi scene diputar 180,7 − 74,8 agar
 * penonton berdiri tepat di posisi orang yang difoto.
 *
 * Nilai ini diverifikasi dengan memproyeksikan seluruh titik joint kesepuluh
 * preset: ia meminimalkan simpangan arah bidik terhadap penonton (12°, versus
 * 19° pada 90,7° yang dipakai sebelumnya) SEKALIGUS memusatkan komposisi
 * (rata-rata X −0,01 NDC, versus −0,03 yang membuatnya condong ke kiri).
 * |NDC| terburuk 0,92 — masih aman dari terpotong.
 *
 * Murni rotasi tampilan; sudut joint tidak tersentuh.
 */
/**
 * Yaw tampilan — SATU nilai untuk semua preset, sengaja bukan per-pose.
 *
 * Patokannya arah bidik kamera DSLR (sumbu −X link 7): yaw yang membuatnya
 * mengarah tepat ke penonton berbeda-beda tiap preset karena J1 tiap preset
 * berbeda. Dari FK kesepuluh preset (kamera kartu di azimut 15,3°):
 *
 *   preset  1  2  3  4  5  6  7  8  9  10
 *   yaw ideal 102 102 76 136 105 105 132 89 102 108   (derajat)
 *
 * Rata-rata melingkarnya 105,7° — itu asal nilai 105,9° yang dipakai semula.
 * Nilai final 110° ditentukan dari penilaian mata di layar: pada 105,9° robot
 * terbaca sedikit menghadap kiri, pada 113,9° sedikit ke kanan (terukur: bidikan
 * preset 1 meleset 12,2° ke kanan), jadi diambil di antaranya.
 *
 * Pernah dicoba menghitung yaw per pose (yaw = azimut kamera − J1) supaya
 * bidang tekuk selalu menghadap penonton. Hasilnya JUSTRU salah arah: untuk
 * preset 1 nilainya jadi 196,9° dan robot tampak menghadap ke kanan. Jangan
 * diulang tanpa mengecek ke layar dulu.
 *
 * Konsekuensi yang diterima: preset dengan J1 jauh berbeda (3, 4, 7, 8) tetap
 * terlihat menyerong 20–34°. Kalau salah satunya mengganggu, tambahkan trim
 * kecil per-preset — jangan geser nilai global ini, karena preset lain ikut.
 */
export const SCENE_YAW = (110 * Math.PI) / 180;
