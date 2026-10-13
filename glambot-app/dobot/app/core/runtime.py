import threading
import time
import urllib.request
import json

from app.robot import (
    DobotController, FaceTracker,
    load_presets_from_json, build_sequence_order,
)
from app.core.sequence import SequenceRunner, IDLE, MOVING, TRACKING, CAPTURING, DONE


# Parameter tuning yang boleh diubah live dari admin (via backend Go).
# key camelCase (dari API) → (atribut config, min, max, apakah integer).
# Rentang HARUS sama dengan robotRanges di backend handlers/robot_settings.go.
RUNTIME_TUNABLES = {
    "robotSpeedFactor":      ("robot_speed_factor",       1,   100,  True),
    "robotJointSpeed":       ("robot_joint_speed",        1,   100,  True),
    "robotJointAcc":         ("robot_joint_acc",          1,   100,  True),
    "safetyTimeout":         ("safety_timeout",           3,   60,   False),
    "postActionDelay":       ("post_action_delay",        0,   5,    False),
    "sequenceSlotSec":       ("sequence_slot_sec",        5,   120,  False),
    "faceTrackGainPan":      ("face_track_gain_pan",      0,   40,   False),
    "faceTrackGainTilt":     ("face_track_gain_tilt",     0,   40,   False),
    "faceTrackDeadbandPct":  ("face_track_deadband_pct",  0,   30,   False),
    "faceTrackMaxDevDeg":    ("face_track_max_dev_deg",   0,   60,   False),
}

# Field yang mempengaruhi kecepatan gerak — kalau salah satu berubah, kirim ulang
# SpeedFactor/SpeedJ/AccJ ke robot lewat set_speed().
_SPEED_ATTRS = ("robot_speed_factor", "robot_joint_speed", "robot_joint_acc")


def apply_tunables(config, data: dict) -> set:
    """Clamp & set key tuning yang dikenal pada objek config. Key tak dikenal /
    nilai rusak diabaikan (aman terhadap payload berlebih). Dipakai bersama oleh
    endpoint runtime dan startup-override — mengembalikan set nama atribut yang
    benar-benar berubah."""
    changed = set()
    for key, (attr, lo, hi, is_int) in RUNTIME_TUNABLES.items():
        if key not in data or data[key] is None:
            continue
        try:
            val = float(data[key])
        except (TypeError, ValueError):
            continue  # nilai rusak → lewati, jangan crash
        val = max(lo, min(hi, val))
        val = int(val) if is_int else val
        if getattr(config, attr) != val:
            setattr(config, attr, val)
            changed.add(attr)
    return changed


class Runtime:
    """Otak sisi Python: memegang robot, preset, detector wajah, face tracker,
    dan sequence pose otomatis.

    Sejak kendali gesture dihapus, Runtime TIDAK lagi punya FSM lock/unlock.
    Alurnya lurus: sesi aktif → SequenceRunner jalan → pose 1..10 → selesai.
    """

    def __init__(self, config, *, dry_run=False):
        self.config  = config
        self.dry_run = dry_run

        # ── Presets ──────────────────────────────────────────────
        _, self.presets = load_presets_from_json(config.presets_json)
        self.sequence_order = build_sequence_order(self.presets, config.sequence_preset_order)

        # ── Robot ────────────────────────────────────────────────
        self.robot = DobotController(
            config.dobot_ip,
            config.dobot_dashboard_port,
            config.dobot_move_port,
            speed_factor=config.robot_speed_factor,
            joint_speed=config.robot_joint_speed,
            joint_acc=config.robot_joint_acc,
            enable_timeout=config.robot_enable_timeout,
        )

        # ── Flags ────────────────────────────────────────────────
        self.running        = True
        self.detector       = None      # di-set main.py setelah FaceDetector dibuat
        self.tracker        = None      # dibuat di attach_detector()
        self.session_active = False

        self.sequence = SequenceRunner(self)

        self._capture_lock = threading.Lock()
        self._manual_busy  = False

    # ─────────────────────────────────────────────────────────────
    #  Wiring detector → tracker
    # ─────────────────────────────────────────────────────────────
    def attach_detector(self, detector):
        """Pasang FaceDetector dan bangun FaceTracker di atasnya. Dipisah dari
        __init__ karena detector butuh config yang sudah final dan dibuat setelah
        init_hardware()."""
        self.detector = detector
        self.tracker  = FaceTracker(self.robot, detector, self.config, dry_run=self.dry_run)

    # ─────────────────────────────────────────────────────────────
    #  Runtime tuning (dari admin lewat backend)
    # ─────────────────────────────────────────────────────────────
    def apply_runtime_settings(self, data: dict) -> dict:
        """Terapkan parameter tuning (speed/timing/tracking) ke config yang
        sedang jalan.

        Hanya key yang dikenal & bernilai numerik valid yang diterapkan; sisanya
        diabaikan (aman terhadap payload berlebih). Nilai di-clamp ke rentang.
        Field timing & tracking dibaca live tiap iterasi → langsung berlaku.
        Field speed dikirim ulang ke robot via set_speed(). Mengembalikan
        snapshot nilai config saat ini.
        """
        changed = apply_tunables(self.config, data)

        # Kirim ulang kecepatan ke robot hanya kalau field speed berubah DAN robot
        # benar-benar terhubung & tidak dry-run (set_speed sendiri guard `connected`).
        if changed.intersection(_SPEED_ATTRS) and self.robot and not self.dry_run and self.robot.connected:
            self.robot.set_speed(
                speed_factor=self.config.robot_speed_factor,
                joint_speed=self.config.robot_joint_speed,
                joint_acc=self.config.robot_joint_acc,
            )

        return self.current_runtime_settings()

    def current_runtime_settings(self) -> dict:
        """Snapshot nilai tuning saat ini (camelCase) — untuk response endpoint."""
        return {
            key: getattr(self.config, attr)
            for key, (attr, _lo, _hi, _int) in RUNTIME_TUNABLES.items()
        }

    # ─────────────────────────────────────────────────────────────
    #  Hardware init
    # ─────────────────────────────────────────────────────────────
    def init_hardware(self):
        cfg = self.config

        if self.dry_run:
            print("\n  [DRY RUN] Robot commands will be printed, not sent")
            self.robot.connected = True
            self.robot.enabled   = True

            def fake_move(joints, name="Custom"):
                print(f"  [DRY RUN] JointMovJ({','.join(f'{j:.2f}' for j in joints)})  # {name}")
                self.robot.last_move_time = time.time()
                return True

            self.robot.move_to_joints = fake_move
            return

        print(f"\n  Connecting to Dobot Nova at {cfg.dobot_ip}...")
        if not self.robot.connect():
            print("  Running in vision-only mode (robot offline)")
            return

        print("  [ROBOT] Connected — initializing & enabling...")
        if self.robot.initialize():
            self.robot.enabled = True
            print("  [ROBOT] ✓ Enabled and ready")

            print("  [ROBOT] Moving to initial pose...")
            self.robot.move_to_initial_pose(self.presets)
            self.robot.wait_until_idle(timeout=self.config.safety_timeout)
            print("  [ROBOT] ✓ At initial pose")

            self.robot.disable()
            print("  [ROBOT] ✓ Standby — servo off, tunggu /robot/enable dari backend")
        else:
            print("  [ROBOT] ⚠ Initialize failed — robot not enabled")

    # ─────────────────────────────────────────────────────────────
    #  Backend callback — fire-and-forget di thread terpisah
    # ─────────────────────────────────────────────────────────────
    def _notify_backend(self, path: str, payload: dict):
        if not self.session_active:
            print(f"  [CALLBACK] Skipped POST {path} — session inactive")
            return

        url  = self.config.backend_url.rstrip("/") + path
        data = json.dumps(payload).encode("utf-8")

        def _send():
            try:
                req = urllib.request.Request(
                    url, data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=2) as resp:
                    print(f"  [CALLBACK] POST {path} → {resp.status}")
            except Exception as e:
                print(f"  [CALLBACK] POST {path} failed: {e}")

        threading.Thread(target=_send, daemon=True, name=f"notify_{path}").start()

    # ─────────────────────────────────────────────────────────────
    #  Session control
    # ─────────────────────────────────────────────────────────────
    def notify_session_started(self, only=None):
        """Dipanggil setelah robot enabled & selesai homing. Sequence pose
        otomatis dimulai dari sini (only = posisi tertentu saja, untuk retake)."""
        self.sequence.start(only)

    def stop_session(self):
        """Hentikan sequence + tracking (dipanggil /robot/disable & shutdown)."""
        self.sequence.stop()
        if self.tracker:
            self.tracker.stop()

    # Alias lama — backend/dashboard masih memanggil /tracking/start|stop.
    def start_tracking(self):
        if self.session_active and self.sequence.state == IDLE:
            self.sequence.start()

    def stop_tracking(self):
        self.stop_session()

    @property
    def tracking_active(self):
        """Dipakai overlay & /detection: deteksi wajah hanya relevan selama sesi
        berjalan dan sequence belum selesai."""
        return self.session_active and self.sequence.state != DONE

    # ─────────────────────────────────────────────────────────────
    #  Manual trigger (jalur admin / dashboard debug)
    # ─────────────────────────────────────────────────────────────
    def trigger_preset(self, preset_num):
        """Gerak satu kali ke preset tanpa sequence — untuk kalibrasi & debug.
        Ditolak selama sequence otomatis sedang jalan supaya tidak rebutan lengan.
        """
        if preset_num not in self.presets:
            return False
        if self.sequence.state in (MOVING, TRACKING, CAPTURING):
            return False

        with self._capture_lock:
            if self._manual_busy:
                return False
            self._manual_busy = True

        def _move():
            try:
                if self.tracker:
                    self.tracker.stop()
                preset = self.presets[preset_num]
                if self.dry_run:
                    self.robot.move_to_joints(preset["joints"], name=preset["name"])
                else:
                    self.robot.move_to_preset(preset_num, self.presets)
                    self.robot.wait_until_idle(timeout=self.config.safety_timeout)
            except Exception as e:
                print(f"  [RUNTIME ERROR] Manual preset: {e}")
            finally:
                self._manual_busy = False

        threading.Thread(target=_move, daemon=True, name=f"manual_preset_{preset_num}").start()
        return True

    # ─────────────────────────────────────────────────────────────
    #  UI accessors
    # ─────────────────────────────────────────────────────────────
    @property
    def fsm_state(self):
        return self.sequence.state

    @property
    def capture_in_progress(self):
        return self.sequence.state in (MOVING, TRACKING, CAPTURING) or self._manual_busy

    @property
    def selected_preset(self):
        return self.sequence.progress()["preset"]

    def sequence_progress(self):
        return self.sequence.progress()

    def stop(self):
        self.running = False
        self.stop_session()
        if self.tracker:
            self.tracker.shutdown()
        if self.detector:
            self.detector.stop()
        if self.robot and not self.dry_run and self.robot.connected and self.robot.enabled:
            print("  [ROBOT] Returning to initial pose before shutdown...")
            self.robot.move_to_initial_pose(self.presets)
            self.robot.wait_until_idle(timeout=self.config.safety_timeout)
            self.robot.disconnect()
