import json
import os
import threading
import time

# Indeks joint dalam list 6 elemen (j1..j6) → 0-based.
JOINT_INDEX = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}

# Hanya j5 & j6 yang boleh digerakkan tracking — j1-j4 memegang komposisi foto
# dan harus tetap persis seperti preset.
TRACKABLE_JOINTS = (5, 6)

DEFAULT_MAPPING = {
    "pan_joint":  6,
    "tilt_joint": 5,
    # deg_per_err = berapa DERAJAT sendi harus berputar untuk menutup satu satuan
    # error (error 1.0 = selebar frame penuh). Tandanya sekaligus arah koreksi.
    # None = belum diukur → tracker menjalankan probe kalibrasi lebih dulu.
    "pan_deg_per_err":  None,
    "tilt_deg_per_err": None,
}

# Batas masuk akal hasil pengukuran. Di luar ini hampir pasti noise (wajah
# bergerak tepat saat probe), jadi hasilnya ditolak dan probe diulang.
MIN_DEG_PER_ERR = 5.0
MAX_DEG_PER_ERR = 400.0

# Perubahan error minimum agar sebuah probe dianggap terbaca (bukan noise).
MIN_PROBE_RESPONSE = 0.02


def load_track_config(path):
    """Baca kalibrasi tracking per preset.

    Isinya hasil PENGUKURAN otomatis, bukan tebakan — lihat FaceTracker._calibrate.
    Format lama (pan_sign/tilt_sign) masih dibaca sebagai tebakan arah awal.
    """
    mapping = {"default": dict(DEFAULT_MAPPING), "presets": {}}
    if not path or not os.path.exists(path):
        print(f"  [TRACK] Config tidak ditemukan ({path}) — akan dikalibrasi otomatis")
        return mapping

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        mapping["default"].update(data.get("default", {}))
        for key, val in data.items():
            if key == "default" or not isinstance(val, dict):
                continue
            try:
                mapping["presets"][int(key)] = val
            except (TypeError, ValueError):
                continue
        print(f"  [TRACK] Config dimuat dari {path}: "
              f"preset terkalibrasi = {sorted(mapping['presets'])}")
    except Exception as e:
        print(f"  [TRACK] ERROR baca {path}: {e} — pakai default")
    return mapping


def mapping_for_preset(mapping, preset_num):
    out = dict(mapping["default"])
    out.update(mapping["presets"].get(preset_num, {}))

    # Validasi di batas konfigurasi. Tanpa ini, pan_joint/tilt_joint di luar
    # {5,6} akan menulis offset ke key yang tidak pernah dibaca _send() —
    # tracking diam-diam tidak melakukan apa pun, tanpa error.
    for key, fallback in (("pan_joint", 6), ("tilt_joint", 5)):
        if out.get(key) not in TRACKABLE_JOINTS:
            print(f"  [TRACK] ⚠ {key}={out.get(key)!r} untuk preset {preset_num} "
                  f"tidak valid (hanya {TRACKABLE_JOINTS}) — pakai {fallback}")
            out[key] = fallback

    if out["pan_joint"] == out["tilt_joint"]:
        print(f"  [TRACK] ⚠ pan_joint & tilt_joint sama ({out['pan_joint']}) untuk "
              f"preset {preset_num} — kembalikan ke pan=6, tilt=5")
        out["pan_joint"], out["tilt_joint"] = 6, 5

    # Kompatibilitas mundur: file lama hanya punya pan_sign/tilt_sign. Tandanya
    # dipakai sebagai tebakan ARAH PROBE saja, bukan sebagai hasil kalibrasi.
    for axis in ("pan", "tilt"):
        if out.get(f"{axis}_deg_per_err") is None and f"{axis}_sign" in out:
            out[f"{axis}_legacy_sign"] = out[f"{axis}_sign"]

    return out


class FaceTracker:
    """Closed-loop centering wajah memakai HANYA j5 & j6.

    j1–j4 selalu memakai nilai preset apa adanya — komposisi foto (jarak, sudut
    badan lengan) tetap persis seperti yang dirancang; tracking hanya mengarahkan
    "kepala" kamera.

    Arah DAN kekuatan koreksi tidak ditebak, melainkan DIUKUR sekali per preset
    lewat probe kalibrasi (lihat _calibrate). Hasilnya disimpan, jadi sesi
    berikutnya langsung akurat sejak koreksi pertama — yang sekaligus membuat
    gerakan jauh lebih halus, karena tidak perlu banyak langkah coba-coba.
    """

    def __init__(self, robot, detector, config, dry_run=False):
        self.robot    = robot
        self.detector = detector
        self.config   = config
        self.dry_run  = dry_run

        self._mapping = load_track_config(config.face_track_config)

        self._lock      = threading.Lock()
        self._thread    = None
        self._running   = False
        self._enabled   = False   # tracking aktif (bukan frozen)
        self._preset    = None
        self._baseline  = None    # list 6 joint dari preset
        self._offsets   = {5: 0.0, 6: 0.0}
        self._last_seen = 0.0
        self._map       = dict(DEFAULT_MAPPING)

        # ── State probe kalibrasi ────────────────────────────────
        self._cal_axis  = None    # "pan" | "tilt" | None (selesai)
        self._cal_phase = None    # "settle_before" | "probe_sent"
        self._cal_e0    = None
        self._cal_probe = 0.0
        self._cal_tries = 0

    # ─────────────────────────────────────────────────────────────
    #  Lifecycle
    # ─────────────────────────────────────────────────────────────
    def start(self, preset_num, baseline_joints):
        """Mulai tracking di preset tertentu. Baseline = joint preset apa adanya."""
        with self._lock:
            self._preset    = preset_num
            self._baseline  = list(baseline_joints)
            self._offsets   = {5: 0.0, 6: 0.0}
            self._last_seen = time.time()
            self._map       = mapping_for_preset(self._mapping, preset_num)
            self._cal_axis  = self._next_uncalibrated(self._map)
            self._cal_phase = "settle_before" if self._cal_axis else None
            self._cal_e0    = None
            self._cal_tries = 0
            self._enabled   = True
            mp_ = dict(self._map)

        # Koreksi tracking itu gerak KECIL. Dengan SpeedJ preset (bisa 100)
        # tiap koreksi jadi sentakan. Turunkan sementara; dikembalikan di
        # freeze()/stop() sebelum gerak preset berikutnya.
        self._apply_tracking_speed()

        if self._thread is None or not self._thread.is_alive():
            self._running = True
            self._thread = threading.Thread(target=self._run, daemon=True, name="face_tracker")
            self._thread.start()

        if self._cal_axis:
            print(f"  [TRACK] ► Preset {preset_num}: belum terkalibrasi — "
                  f"mengukur arah & gain sumbu '{self._cal_axis}' dulu")
        else:
            print(f"  [TRACK] ► Tracking aktif di preset {preset_num} "
                  f"(pan {mp_['pan_deg_per_err']:+.1f}°/err, "
                  f"tilt {mp_['tilt_deg_per_err']:+.1f}°/err)")

    def freeze(self):
        """Hentikan pengiriman koreksi TANPA mengubah posisi — dipakai selama
        countdown 3-2-1 supaya lengan benar-benar diam saat shutter jatuh."""
        with self._lock:
            was = self._enabled
            self._enabled = False
        if was:
            self._restore_speed()
            print("  [TRACK] ❙❙ Frozen (countdown)")

    def stop(self):
        with self._lock:
            was = self._enabled
            self._enabled  = False
            self._preset   = None
            self._baseline = None
            self._cal_axis = None
        if was:
            self._restore_speed()

    def shutdown(self):
        self.stop()
        self._running = False
        if self._thread:
            self._thread.join(timeout=2)
            self._thread = None

    @property
    def active(self):
        with self._lock:
            return self._enabled

    def state(self):
        with self._lock:
            return {
                "active":      self._enabled,
                "preset":      self._preset,
                "offsets":     {"j5": round(self._offsets[5], 2),
                                "j6": round(self._offsets[6], 2)},
                "calibrating": self._cal_axis,
                "mapping":     {k: v for k, v in self._map.items()
                                if not k.endswith("_legacy_sign")},
            }

    # ── Kecepatan sendi khusus tracking ──────────────────────────
    def _apply_tracking_speed(self):
        if self.dry_run or not self.robot or not self.robot.connected:
            return
        self.robot.set_joint_speed(self.config.face_track_joint_speed,
                                   self.config.face_track_joint_acc)

    def _restore_speed(self):
        if self.dry_run or not self.robot or not self.robot.connected:
            return
        self.robot.set_joint_speed(self.config.robot_joint_speed,
                                   self.config.robot_joint_acc)

    # ─────────────────────────────────────────────────────────────
    #  Kalibrasi manual (debug)
    # ─────────────────────────────────────────────────────────────
    def nudge(self, joint, degrees):
        """Geser satu joint sekian derajat dari posisi saat ini. Dipakai untuk
        memeriksa arah secara manual lewat /robot/track/nudge."""
        if joint not in JOINT_INDEX:
            return False, "joint harus 1-6"
        if self.dry_run:
            return False, "dry-run: tidak ada robot"
        if not self.robot or not self.robot.connected or not self.robot.enabled:
            return False, "robot tidak aktif"

        current = self.robot.get_current_joints()
        if not current or len(current) != 6:
            return False, "gagal membaca GetAngle()"

        target = list(current)
        target[JOINT_INDEX[joint]] += float(degrees)
        ok = self.robot.track_move(target)
        return ok, ("ok" if ok else "perintah gerak gagal")

    # ─────────────────────────────────────────────────────────────
    #  Kalibrasi otomatis (probe terukur)
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def _next_uncalibrated(mp_):
        for axis in ("pan", "tilt"):
            if mp_.get(f"{axis}_deg_per_err") is None:
                return axis
        return None

    def _calibrate(self, baseline, mp_, err_x, err_y):
        """Ukur hubungan sudut-sendi ↔ posisi-wajah untuk satu sumbu.

        Persis seperti kalibrasi manual, tapi otomatis:
          1. catat error sekarang (e0),
          2. putar sendi sebesar probe_deg yang DIKETAHUI,
          3. catat error setelahnya (e1),
          4. deg_per_err = -probe_deg / (e1 - e0).

        Hasilnya memberi ARAH (tandanya) sekaligus GAIN (besarannya) dalam satu
        pengukuran. Keduanya tidak bisa disimpulkan dari kode karena bergantung
        pemasangan fisik kamera dan arah putar sendi — jadi diukur, bukan ditebak.

        Mengembalikan True kalau ada perintah gerak dikirim.
        """
        cfg   = self.config
        axis  = self._cal_axis
        err   = err_x if axis == "pan" else err_y
        joint = mp_["pan_joint"] if axis == "pan" else mp_["tilt_joint"]

        if self._cal_phase == "settle_before":
            # Arah probe: kalau file lama punya sign, pakai sebagai tebakan awal
            # supaya probe cenderung MENDEKATKAN wajah, bukan menjauhkan.
            guess = mp_.get(f"{axis}_legacy_sign", 1)
            step  = cfg.face_track_probe_deg * (1 + self._cal_tries)
            probe = step * (1 if err >= 0 else -1) * guess
            probe = _clamp(probe, cfg.face_track_max_dev_deg)

            self._cal_e0    = err
            self._cal_probe = probe
            self._cal_phase = "probe_sent"

            with self._lock:
                self._offsets[joint] = probe
                off5, off6 = self._offsets[5], self._offsets[6]
            print(f"  [TRACK] · kalibrasi {axis}: e0={err:+.3f}, "
                  f"probe {probe:+.1f}° pada j{joint}")
            return self._send(baseline, off5, off6)

        # phase == "probe_sent" → baca hasilnya
        e0, e1 = self._cal_e0, err
        d_err  = e1 - e0
        self._cal_tries += 1
        deg_per_err = None

        if abs(d_err) < MIN_PROBE_RESPONSE:
            # Probe terlalu kecil untuk terbaca (atau wajah tidak bergerak di
            # frame). Perbesar dan ulangi — sampai batas percobaan.
            if self._cal_tries < 3:
                print(f"  [TRACK] · respons {axis} terlalu kecil "
                      f"(Δerr={d_err:+.3f}) — ulangi dengan probe lebih besar")
                self._cal_phase = "settle_before"
                self._cal_e0 = None
                return False
        else:
            candidate = -self._cal_probe / d_err
            if MIN_DEG_PER_ERR <= abs(candidate) <= MAX_DEG_PER_ERR:
                deg_per_err = candidate
                print(f"  [TRACK] ✓ kalibrasi {axis}: Δerr={d_err:+.3f} untuk "
                      f"{self._cal_probe:+.1f}° → {deg_per_err:+.1f}°/err")
            elif self._cal_tries < 3:
                print(f"  [TRACK] · hasil {axis} di luar batas wajar "
                      f"({candidate:+.1f}°/err) — ulangi")
                self._cal_phase = "settle_before"
                self._cal_e0 = None
                return False

        if deg_per_err is None:
            deg_per_err = self._fallback_deg_per_err(axis, mp_)
            print(f"  [TRACK] ⚠ kalibrasi {axis} tidak terbaca — pakai nilai .env "
                  f"({deg_per_err:+.1f}°/err)")

        mp_[f"{axis}_deg_per_err"] = deg_per_err
        with self._lock:
            self._map[f"{axis}_deg_per_err"] = deg_per_err
        self._persist(self._preset, mp_)

        # Lanjut ke sumbu berikutnya, atau selesai.
        nxt = self._next_uncalibrated(mp_)
        self._cal_axis  = nxt
        self._cal_phase = "settle_before" if nxt else None
        self._cal_e0    = None
        self._cal_tries = 0
        if nxt is None:
            print(f"  [TRACK] ► Kalibrasi preset {self._preset} selesai — tracking mulai")
        return False

    def _fallback_deg_per_err(self, axis, mp_):
        """Nilai cadangan dari .env kalau probe tidak terbaca."""
        gain = (self.config.face_track_gain_pan if axis == "pan"
                else self.config.face_track_gain_tilt)
        sign = mp_.get(f"{axis}_legacy_sign", 1)
        return max(MIN_DEG_PER_ERR, gain) * sign

    def _persist(self, preset, mp_):
        path = self.config.face_track_config
        if not path or not self.config.face_track_persist_signs or preset is None:
            return
        try:
            data = {}
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            entry = dict(data.get(str(preset), {}))
            for axis in ("pan", "tilt"):
                v = mp_.get(f"{axis}_deg_per_err")
                if v is not None:
                    entry[f"{axis}_deg_per_err"] = round(v, 2)
            data[str(preset)] = entry
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self._mapping["presets"][preset] = entry
            print(f"  [TRACK] ✓ Kalibrasi preset {preset} disimpan: {entry}")
        except Exception as e:
            print(f"  [TRACK] ⚠ Gagal menyimpan kalibrasi: {e}")

    # ─────────────────────────────────────────────────────────────
    #  Loop kontrol
    # ─────────────────────────────────────────────────────────────
    def _run(self):
        while self._running:
            cfg = self.config
            time.sleep(1.0 / max(0.5, cfg.face_track_rate_hz))

            with self._lock:
                if not self._enabled or self._baseline is None:
                    continue
                baseline = list(self._baseline)
                mp_      = dict(self._map)

            det = self.detector.get_latest_detection() if self.detector else None
            moved = False

            if det and det.get("face_detected") and det.get("offset"):
                self._last_seen = time.time()
                err_x, err_y = det["offset"]

                # ── Frame preview → arah DUNIA NYATA ───────────────
                # Kamera dipasang TERBALIK di lengan: frame mentahnya terbalik di
                # KEDUA sumbu. Pipeline kamera memutar 180° lalu mencerminkan
                # horizontal untuk tampilan selfie — efek bersih keduanya hanya
                # MEMBALIK SUMBU Y, sehingga sumbu X masih tercermin terhadap
                # dunia nyata. Dibalik di sini supaya besaran yang DIUKUR saat
                # kalibrasi konsisten dengan yang dipakai saat tracking.
                if cfg.camera_mirror_preview:
                    err_x = -err_x

                # Target vertikal boleh digeser ke atas (headroom).
                err_y -= (cfg.face_track_target_y - 0.5)

                if self._cal_axis:
                    moved = self._calibrate(baseline, mp_, err_x, err_y)
                else:
                    moved = self._step(baseline, mp_, err_x, err_y)

            elif time.time() - self._last_seen > cfg.face_track_lost_sec:
                # Wajah hilang cukup lama → pulangkan pelan ke baseline preset,
                # jadi foto tanpa subjek tetap memakai komposisi yang dirancang.
                moved = self._recenter(baseline)

            if moved:
                # Tunggu lengan benar-benar SAMPAI dan kamera sempat melihat
                # posisi barunya sebelum mengukur lagi. Tanpa jeda ini, loop
                # menumpuk koreksi di atas error BASI — antrean motion controller
                # penuh, lengan melewati target lalu berbalik: gejala tersendat.
                time.sleep(cfg.face_track_settle_sec)

    def _step(self, baseline, mp_, err_x, err_y):
        """Satu koreksi. True kalau ada perintah gerak dikirim.

        Karena deg_per_err sudah DIUKUR, koreksi dihitung langsung ke sasaran
        (bukan mencicil dengan gain tebakan), lalu diredam `damping` sedikit di
        bawah 1 untuk mencegah overshoot. Praktisnya satu-dua langkah sudah masuk
        deadband — inilah yang membuat gerakannya tidak lagi mencicil.
        """
        cfg      = self.config
        deadband = cfg.face_track_deadband_pct / 100.0
        damping  = cfg.face_track_damping

        changed = False
        with self._lock:
            for axis, err in (("pan", err_x), ("tilt", err_y)):
                if abs(err) <= deadband:
                    continue
                joint = mp_["pan_joint"] if axis == "pan" else mp_["tilt_joint"]
                dpe   = mp_.get(f"{axis}_deg_per_err")
                if dpe is None:
                    continue
                delta = _clamp(err * dpe * damping, cfg.face_track_max_step_deg)
                self._offsets[joint] = _clamp(
                    self._offsets.get(joint, 0.0) + delta, cfg.face_track_max_dev_deg)
                changed = True

            off5, off6 = self._offsets[5], self._offsets[6]

        if not changed:
            return False  # dalam deadband → jangan kirim perintah sama sekali
        return self._send(baseline, off5, off6)

    def _recenter(self, baseline):
        """Kembalikan j5/j6 ke nilai preset secara bertahap."""
        cfg = self.config
        with self._lock:
            if abs(self._offsets[5]) < 0.05 and abs(self._offsets[6]) < 0.05:
                return False
            step = cfg.face_track_max_step_deg
            for j in (5, 6):
                o = self._offsets[j]
                self._offsets[j] = 0.0 if abs(o) <= step else o - _clamp(o, step)
            off5, off6 = self._offsets[5], self._offsets[6]
        return self._send(baseline, off5, off6)

    def _send(self, baseline, off5, off6):
        target = list(baseline)
        target[4] = baseline[4] + off5
        target[5] = baseline[5] + off6

        if self.dry_run:
            return True
        if not self.robot or not self.robot.connected or not self.robot.enabled:
            return False
        return bool(self.robot.track_move(target))


def _clamp(value, limit):
    return max(-limit, min(limit, value))
