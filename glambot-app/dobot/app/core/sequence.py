import json
import threading
import time
import urllib.request

# State yang dipaparkan ke frontend lewat /detection.fsm_state.
IDLE      = "IDLE"
MOVING    = "MOVING"
TRACKING  = "TRACKING"
CAPTURING = "CAPTURING"
DONE      = "DONE"


class SequenceRunner:
    """Menjalankan pose 1→10 otomatis.

    Timeline satu pose:

        MOVING     POST /api/robot/moving, move_to_preset(N) + wait_until_idle
                   (tanpa hitungan — lama gerak tidak dihitung)
        TRACKING   bersiap PREP detik (sequence_prep_sec), FaceTracker ON
        CAPTURING  FaceTracker FREEZE, POST /api/robot/done → Go countdown 3-2-1,
                   shutter setelah LEAD detik
        +AFTER     jeda (sequence_after_shot_sec) → pose berikutnya

    LEAD (config.sequence_capture_lead_sec) HARUS sama dengan presetCaptureDelay
    di backend/handlers/robot.go, karena backend yang memegang countdown-nya.
    """

    def __init__(self, runtime):
        self.runtime = runtime
        self.config  = runtime.config

        self._lock    = threading.Lock()
        self._thread  = None
        self._stop    = threading.Event()
        # Di-set oleh skip() untuk memotong sisa waktu slot yang sedang jalan.
        self._skip    = threading.Event()

        self._state        = IDLE
        self._index        = 0      # 1-based posisi di urutan
        self._preset       = None
        self._slot_started = 0.0
        self._slot_length  = 0.0
        self._complete     = False
        self._only         = None

    # ─────────────────────────────────────────────────────────────
    #  Lifecycle
    # ─────────────────────────────────────────────────────────────
    def start(self, only=None):
        """only: 1-based posisi di urutan yang dijalankan (retake); None = semua."""
        if self._thread and self._thread.is_alive():
            print("  [SEQUENCE] Sudah berjalan — abaikan start ganda")
            return False

        self._only = set(only) if only else None
        self._stop.clear()
        with self._lock:
            self._state    = IDLE
            self._index    = 0
            self._preset   = None
            self._complete = False

        self._thread = threading.Thread(target=self._run, daemon=True, name="sequence")
        self._thread.start()
        return True

    def stop(self):
        self._stop.set()
        tracker = self.runtime.tracker
        if tracker:
            tracker.stop()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)
        self._thread = None
        with self._lock:
            self._state  = IDLE
            self._preset = None

    def skip(self):
        """Percepat slot yang sedang berjalan — langsung lompat ke countdown.

        Tidak berlaku saat CAPTURING: countdown 3-2-1 dipegang backend Go dan
        memotongnya hanya akan membuat shutter jatuh tanpa aba-aba.
        """
        with self._lock:
            if self._state not in (MOVING, TRACKING):
                return False
        self._skip.set()
        return True

    # ─────────────────────────────────────────────────────────────
    #  Status
    # ─────────────────────────────────────────────────────────────
    @property
    def state(self):
        with self._lock:
            return self._state

    @property
    def complete(self):
        with self._lock:
            return self._complete

    def progress(self):
        with self._lock:
            state   = self._state
            index   = self._index
            preset  = self._preset
            started = self._slot_started
            length  = self._slot_length
            done    = self._complete

        total = len(self.runtime.sequence_order)
        name  = None
        if preset is not None and preset in self.runtime.presets:
            name = self.runtime.presets[preset]["name"]

        left = 0.0
        if state in (MOVING, TRACKING, CAPTURING) and length > 0:
            left = max(0.0, length - (time.time() - started))

        if state == IDLE:
            label = "Menunggu sesi dimulai"
        elif state == MOVING:
            label = f"Pose {index}/{total} — kamera bergerak…"
        elif state == TRACKING:
            label = f"Pose {index}/{total} — {left:.0f}s"
        elif state == CAPTURING:
            label = f"Pose {index}/{total} — bersiap, jangan bergerak!"
        else:
            label = "Semua pose selesai"

        # Persen = kemajuan seluruh sequence; fase di dalam pose dihitung kasar
        # karena lama gerak tidak diketahui.
        if total:
            phase_frac = {TRACKING: 0.4, CAPTURING: 0.8}.get(state, 0.0)
            percent = int(100 * (max(0, index - 1) + phase_frac) / total)
        else:
            percent = 0
        if done:
            percent = 100

        return {
            "label":        label,
            "index":        index,
            "total":        total,
            "preset":       preset,
            "preset_name":  name,
            "seconds_left": round(left, 1),
            # Panjang slot yang sedang berjalan — konsumen butuh ini untuk
            # mengubah seconds_left jadi persen tanpa menebak durasinya.
            "slot_sec":     round(length, 1),
            "percent":      max(0, min(100, percent)),
            "complete":     done,
        }

    # ─────────────────────────────────────────────────────────────
    #  Loop utama
    # ─────────────────────────────────────────────────────────────
    def _run(self):
        rt    = self.runtime
        cfg   = self.config
        order = rt.sequence_order

        if not order:
            print("  [SEQUENCE] ⚠ Tidak ada preset untuk dijalankan — berhenti")
            with self._lock:
                self._state = DONE
            return

        print(f"  [SEQUENCE] ══ Mulai: {len(order)} pose, bersiap "
              f"{cfg.sequence_prep_sec:.0f}s + countdown {cfg.sequence_capture_lead_sec:.0f}s per pose ══")

        if self._wait(cfg.sequence_start_delay_sec):
            return

        for i, preset_num in enumerate(order, start=1):
            if self._only and i not in self._only:
                continue
            if self._stop.is_set():
                break
            if not rt.session_active:
                print("  [SEQUENCE] Sesi tidak aktif — hentikan sequence")
                break
            self._run_slot(i, preset_num)

        tracker = rt.tracker
        if tracker:
            tracker.stop()

        finished = not self._stop.is_set()
        with self._lock:
            self._state    = DONE
            self._preset   = None
            self._complete = finished
        print(f"  [SEQUENCE] ══ Selesai (complete={finished}) ══\n")

    def _run_slot(self, index, preset_num):
        rt  = self.runtime
        cfg = self.config

        preset = rt.presets[preset_num]
        lead   = cfg.sequence_capture_lead_sec
        self._skip.clear()

        # Fase gerak tidak punya hitungan (slot_length 0 → seconds_left 0).
        with self._lock:
            self._state        = MOVING
            self._index        = index
            self._preset       = preset_num
            self._slot_started = time.time()
            self._slot_length  = 0.0

        print(f"  [SEQUENCE] ▶ Pose {index} → preset {preset_num} ({preset['name']})")

        # ── 1. Gerak ke preset (tracking mati selama gerak besar) ─────
        tracker = rt.tracker
        if tracker:
            tracker.stop()

        rt._notify_backend("/api/robot/moving", {
            "preset":      preset_num,
            "preset_name": preset["name"],
            "status":      "moving",
        })

        if rt.dry_run:
            rt.robot.move_to_joints(preset["joints"], name=preset["name"])
            time.sleep(0.5)
        else:
            if not rt.robot.move_to_preset(preset_num, rt.presets):
                print(f"  [SEQUENCE ⚠] Gagal gerak ke preset {preset_num} — "
                      f"connected={rt.robot.connected}, enabled={rt.robot.enabled}")
            rt.robot.wait_until_idle(timeout=cfg.safety_timeout)
            time.sleep(cfg.post_action_delay)

        if self._stop.is_set():
            return

        # ── 2. Bersiap PREP detik setelah robot sampai (face tracking ON) ──
        prep = max(0.0, cfg.sequence_prep_sec)
        with self._lock:
            self._state        = TRACKING
            self._slot_started = time.time()
            self._slot_length  = prep
        if tracker and cfg.face_track_enabled:
            tracker.start(preset_num, preset["joints"])
        if self._wait(prep):
            return

        # ── 3. Bekukan lengan, serahkan countdown ke backend Go ──────
        # Skip tidak boleh ikut memotong jendela countdown di bawah.
        self._skip.clear()
        if tracker:
            tracker.freeze()

        with self._lock:
            self._state        = CAPTURING
            self._slot_started = time.time()
            self._slot_length  = lead

        seq_before = None if rt.dry_run else self._capture_seq()

        rt._notify_backend("/api/robot/done", {
            "preset":      preset_num,
            "preset_name": preset["name"],
            "status":      "done",
        })

        # Go owns the countdown + shutter. Stay still until Go confirms the shot
        # (capture_seq bumps); fall back to fixed timing if backend is unreachable.
        if seq_before is None:
            if self._wait(lead):
                return
        else:
            deadline = time.time() + lead + 15.0
            while time.time() < deadline:
                if self._stop.wait(0.2):
                    return
                seq = self._capture_seq()
                if seq is not None and seq > seq_before:
                    break
            else:
                print(f"  [SEQUENCE] ⚠ Pose {index}: konfirmasi jepret tidak datang — lanjut")

        # Small pause so the arm does not jerk right after the shutter.
        if self._wait(max(cfg.post_action_delay, cfg.sequence_after_shot_sec)):
            return

    def _capture_seq(self):
        """Go's capture counter from GET /api/robot/config, or None if unreachable."""
        url = self.config.backend_url.rstrip("/") + "/api/robot/config"
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                return int(json.load(resp)["data"]["capture_seq"])
        except Exception:
            return None

    def _wait(self, seconds):
        """Tidur yang bisa diinterupsi stop (→ True, hentikan sequence) atau
        skip (→ False, lanjut ke tahap berikut lebih cepat)."""
        if seconds <= 0:
            return self._stop.is_set()
        deadline = time.time() + seconds
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                return False
            if self._stop.wait(min(remaining, 0.1)):
                return True
            if self._skip.is_set():
                return False
