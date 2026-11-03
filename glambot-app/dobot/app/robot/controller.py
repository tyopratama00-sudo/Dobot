import re
import socket
import threading
import time

INITIAL_POSE_PRESET = 1
TRANSIT_PRESET      = 11

ROBOT_MODE_ENABLE  = 5    
REPLY_TIMEOUT      = 5.0   # batas tunggu balasan robot
REPLY_TAIL_TIMEOUT = 0.3   # balasan tanpa penanda akhir: tunggu sisanya sebentar
RECONNECT_INTERVAL = 2.0

ROBOT_MODE_RUNNING = 7 


class DobotController:

    def __init__(self, ip, dashboard_port, move_port,
                 speed_factor, joint_speed, joint_acc, enable_timeout):
        self.ip             = ip
        self.dashboard_port = dashboard_port
        self.move_port      = move_port

        self.speed_factor = speed_factor
        self.joint_speed  = joint_speed
        self.joint_acc    = joint_acc

        self.enable_timeout = enable_timeout

        self.dashboard = None
        self.connected = False
        self.enabled   = False
        self.enable_confirmed = False  # True kalau RobotMode() sempat konfirmasi ENABLE

        self.current_preset = None
        self.last_move_time = 0.0

        self._lock = threading.Lock()
        self._closing = False
        self._reconnecting = False

    def _open_socket(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(REPLY_TIMEOUT)
        try:
            sock.connect((self.ip, self.dashboard_port))
        except Exception:
            sock.close()
            raise
        return sock

    def connect(self):
        try:
            self.dashboard = self._open_socket()
            print(f"  [ROBOT] Dashboard → {self.ip}:{self.dashboard_port}")
            self.connected = True
            return True
        except Exception as e:
            print(f"  [ROBOT ERROR] {e}")
            self.connected = False
            return False

    def _send_dashboard(self, cmd):
        with self._lock:
            sock = self.dashboard
            if not sock:
                return None
            try:
                sock.sendall((cmd + "\n").encode("utf-8"))
                return self._read_reply(sock)
            except OSError as e:
                # Balasan yang telat akan terbaca sebagai balasan perintah
                # berikutnya, jadi koneksi yang timeout tidak dipakai lagi.
                print(f"  [ROBOT ERROR] Dashboard: {e} — koneksi diputus")
                self._drop_connection_locked()
                return None

    @staticmethod
    def _read_reply(sock):
        """Baca satu balasan sampai ';' atau baris baru. Kalau penandanya tidak
        datang, sisa data ditunggu sebentar lalu dipakai apa adanya."""
        buf = b""
        try:
            while b";" not in buf and b"\n" not in buf:
                try:
                    chunk = sock.recv(1024)
                except socket.timeout:
                    if buf:
                        break
                    raise
                if not chunk:
                    raise ConnectionError("koneksi ditutup robot")
                buf += chunk
                sock.settimeout(REPLY_TAIL_TIMEOUT)
        finally:
            sock.settimeout(REPLY_TIMEOUT)
        return buf.decode("utf-8", errors="replace").strip()

    # ─────────────────────────────────────────────────────────────
    #  RECONNECT
    # ─────────────────────────────────────────────────────────────
    def _drop_connection_locked(self):
        if self.dashboard:
            try:
                self.dashboard.close()
            except OSError:
                pass
        self.dashboard = None
        self.connected = False
        self.enabled   = False
        self.start_reconnect()

    def start_reconnect(self):
        if self._closing or self._reconnecting:
            return
        self._reconnecting = True
        threading.Thread(target=self._reconnect_loop, daemon=True, name="robot_reconnect").start()

    def _reconnect_loop(self):
        """Sambung ulang sampai berhasil. Perintah gerak yang terputus TIDAK
        dikirim ulang: robot dihentikan dan dimatikan dulu, sesi berikutnya
        menyalakannya lagi lewat initialize()."""
        try:
            while not self._closing:
                time.sleep(RECONNECT_INTERVAL)
                try:
                    sock = self._open_socket()
                except OSError:
                    continue
                with self._lock:
                    self.dashboard = sock
                self._send_dashboard("Stop()")
                self._send_dashboard("DisableRobot()")
                with self._lock:
                    if self.dashboard is sock:
                        self.enabled   = False
                        self.connected = True
                        print("  [ROBOT] ✓ Tersambung lagi — robot standby")
                        return
        finally:
            self._reconnecting = False

    @staticmethod
    def _reply_ok(resp):
        """Balasan robot diawali ErrorID (0 = diterima). Balasan yang formatnya
        tidak dikenal tetap diterima supaya tidak menghentikan robot tanpa sebab."""
        if not resp:
            return False
        m = re.match(r"\s*(-?\d+)\s*,", resp)
        if not m:
            print(f"  [ROBOT] ⚠ Format balasan tidak dikenal: {resp}")
            return True
        return int(m.group(1)) == 0

    def _robot_mode(self):
        resp = self._send_dashboard("RobotMode()")
        if not resp:
            return None
        m = re.search(r"\{(-?\d+)\}", resp)
        return int(m.group(1)) if m else None

    def wait_until_idle(self, timeout=15.0, poll=0.2, settle_grace=1.0, should_abort=None):
        """True kalau lengan sudah diam. False kalau timeout, koneksi putus, atau
        should_abort() terpenuhi."""
        start      = time.time()
        saw_motion = False
        while time.time() - start < timeout:
            if not self.connected or (should_abort and should_abort()):
                return False
            mode = self._robot_mode()
            if mode == ROBOT_MODE_RUNNING:
                saw_motion = True
            elif mode == ROBOT_MODE_ENABLE:
                if saw_motion:
                    print("  [ROBOT] ✓ Motion complete")
                    return True
                if time.time() - start >= settle_grace:
                    return True                 # never moved → already at target
            time.sleep(poll)
        print(f"  [ROBOT] wait_until_idle timed out after {timeout:.0f}s")
        return False

    def _wait_until_enabled(self, poll=0.1, should_abort=None):
        start = time.time()
        while time.time() - start < self.enable_timeout:
            if should_abort and should_abort():
                return False
            if self._robot_mode() == ROBOT_MODE_ENABLE:
                return True
            time.sleep(poll)
        print(f"  [ROBOT] EnableRobot belum ENABLE setelah {self.enable_timeout:.0f}s — lanjut saja")
        return False

    def initialize(self, should_abort=None):
        """should_abort: dicek di antara tahap, supaya disable/stop yang datang
        saat enable tidak perlu menunggu. Hasil False bukan berarti servo mati —
        pemanggil yang membatalkan tetap harus memanggil disable()."""
        if not self.connected:
            return False
        print("  [ROBOT] Initializing...")
        self._send_dashboard("RequestControl()")
        self._send_dashboard("ClearError()")
        if should_abort and should_abort():
            return False
        if self._send_dashboard("EnableRobot()") is None:
            return False
        # Tunggu servo ENABLE secara event-driven (bukan sleep). RobotMode()
        # bisa flaky, jadi tetap lanjut walau belum terkonfirmasi — hasilnya
        # disimpan untuk di-log.
        self.enable_confirmed = self._wait_until_enabled(should_abort=should_abort)
        if should_abort and should_abort():
            return False
        if not self.connected:
            return False
        self.enabled = True
        if not self.enable_confirmed:
            print("  [ROBOT] ⚠️  status ENABLE belum terkonfirmasi (mode read flaky) — tetap lanjut")
        self.set_speed()
        print("  [ROBOT] ✓ Ready!")
        return True

    def set_speed(self, speed_factor=None, joint_speed=None, joint_acc=None):
        if not self.connected:
            return False

        def _clamp(v):
            return max(1, min(100, int(v)))

        self.speed_factor = _clamp(self.speed_factor if speed_factor is None else speed_factor)
        self.joint_speed  = _clamp(self.joint_speed  if joint_speed  is None else joint_speed)
        self.joint_acc    = _clamp(self.joint_acc    if joint_acc    is None else joint_acc)

        for cmd in (f"SpeedFactor({self.speed_factor})",
                    f"SpeedJ({self.joint_speed})",
                    f"AccJ({self.joint_acc})"):
            print(f"  [ROBOT] {cmd} → {self._send_dashboard(cmd)}")
        return True

    def set_joint_speed(self, joint_speed, joint_acc):
        """Ubah HANYA SpeedJ/AccJ — tanpa menyentuh SpeedFactor maupun nilai
        tersimpan di self.joint_speed/self.joint_acc.

        Dipakai FaceTracker untuk memelankan sendi selama koreksi tracking
        (gerak kecil pada kecepatan preset terasa menyentak), lalu memulihkannya
        sebelum gerak preset berikutnya. Karena nilai tersimpan tidak berubah,
        set_speed() biasa tetap jadi sumber kebenaran."""
        if not self.connected:
            return False
        js = max(1, min(100, int(joint_speed)))
        ja = max(1, min(100, int(joint_acc)))
        self._send_dashboard(f'SpeedJ({js})')
        self._send_dashboard(f'AccJ({ja})')
        return True

    # ─────────────────────────────────────────────────────────────
    #  MOVEMENT
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def _joints_to_cmd(joints):
        return "JointMovJ(" + ",".join(f"{j:.2f}" for j in joints) + ")"

    def _execute_move(self, joints, label):
        print(f"  [ROBOT] ► Moving to {label}")
        resp = self._send_dashboard(self._joints_to_cmd(joints))
        if not self._reply_ok(resp):
            print(f"  [ROBOT ERROR] Failed to move to {label}: {resp}")
            return False

        self.last_move_time = time.time()
        print(f"  [ROBOT] Response: {resp}")
        return True

    def move_to_initial_pose(self, presets):
        if not self.connected or not self.enabled:
            return False
        if INITIAL_POSE_PRESET not in presets:
            print(f"  [ROBOT] Initial pose preset {INITIAL_POSE_PRESET} tidak ditemukan, skip")
            return False

        preset = presets[INITIAL_POSE_PRESET]
        label  = f"initial pose (Preset {INITIAL_POSE_PRESET}: {preset['name']})"
        if self._execute_move(preset["joints"], label):
            self.current_preset = INITIAL_POSE_PRESET
            return True
        return False

    def move_to_preset(self, preset_num, presets):
        if not self.connected or not self.enabled:
            return False
        if preset_num not in presets:
            print(f"  [ROBOT ERROR] Preset {preset_num} not found")
            return False

        # Sudah di preset tujuan → diam di tempat, siap langsung memotret.
        if preset_num == self.current_preset:
            print(f"  [ROBOT] ✓ Sudah di preset {preset_num} "
                  f"({presets[preset_num]['name']}) — skip gerak, langsung capture")
            return True

        # Routing via transit jika perlu
        if (preset_num != TRANSIT_PRESET
                and self.current_preset != TRANSIT_PRESET
                and TRANSIT_PRESET in presets):
            print(f"  [ROBOT] ↳ Routing via transit preset {TRANSIT_PRESET} (P13) first")
            if not self._move_to_preset_direct(TRANSIT_PRESET, presets[TRANSIT_PRESET]):
                return False

        return self._move_to_preset_direct(preset_num, presets[preset_num])

    def _move_to_preset_direct(self, preset_num, preset):
        label = f"{preset['name']} (Preset {preset_num})"
        if self._execute_move(preset["joints"], label):
            self.current_preset = preset_num
            return True
        return False

    def move_to_joints(self, joints, name="Custom"):
        if not self.connected or not self.enabled:
            return False
        return self._execute_move(joints, name)

    def track_move(self, joints):
        """Gerak koreksi kecil untuk face tracking — dipanggil beberapa kali per
        detik, jadi TANPA log per-perintah.

        Sengaja TIDAK menyentuh `current_preset`: secara fisik lengan masih
        "berada di" preset yang sama (hanya j5/j6 yang digeser sedikit), dan
        kalau state ini ikut berubah `move_to_preset` akan salah menyimpulkan
        robot sudah/belum di tujuan pada slot berikutnya.
        """
        if not self.connected or not self.enabled:
            return False
        resp = self._send_dashboard(self._joints_to_cmd(joints))
        if not self._reply_ok(resp):
            return False
        self.last_move_time = time.time()
        return True

    def is_moving(self):
        mode = self._robot_mode()
        if mode is None:
            return None
        return mode == ROBOT_MODE_RUNNING

    def get_current_joints(self):
        resp = self._send_dashboard("GetAngle()")
        if not resp:
            return None
        m = re.search(r"\{([^}]*)\}", resp)
        if not m:
            return None
        try:
            return [float(x) for x in m.group(1).split(",") if x.strip()]
        except ValueError:
            return None

    def detect_current_preset(self, presets, tolerance=2.0):
        actual = self.get_current_joints()
        if actual is None:
            return None

        best_num, best_err = None, None
        for num, preset in presets.items():
            joints = preset.get("joints")
            if not joints or len(joints) != len(actual):
                continue
            diffs = [abs(a - b) for a, b in zip(actual, joints)]
            if max(diffs) <= tolerance:
                err = sum(diffs)
                if best_err is None or err < best_err:
                    best_num, best_err = num, err
        return best_num

    def sync_current_preset(self, presets, tolerance=2.0):
        detected = self.detect_current_preset(presets, tolerance)
        if detected is not None:
            self.current_preset = detected
            print(f"  [ROBOT] ⟳ Sync: posisi aktual = preset {detected} ({presets[detected]['name']})")
        else:
            print("  [ROBOT] ⟳ Sync: posisi aktual tidak cocok preset mana pun")
        return detected

    def live_state(self, presets=None, tolerance=2.0):
        joints = self.get_current_joints()
        return {
            "joints":           joints,
            "is_moving":        self.is_moving(),
            "detected_preset":  self.detect_current_preset(presets, tolerance) if presets else None,
            "assumed_preset":   self.current_preset,
        }

    # ─────────────────────────────────────────────────────────────
    #  STOP / SHUTDOWN
    # ─────────────────────────────────────────────────────────────
    def stop(self):
        """Hentikan gerakan. True kalau robot menerima perintahnya."""
        if not self.connected:
            return False
        ok = self._reply_ok(self._send_dashboard("Stop()"))
        if ok:
            print("  [ROBOT] ■ Stopped")
        else:
            print("  [ROBOT ERROR] Stop() tidak diterima robot")
        return ok

    def disable(self):
        """Hentikan lalu matikan servo. `enabled` hanya menjadi False kalau robot
        menerima DisableRobot, supaya status tidak melaporkan robot sudah mati
        padahal belum."""
        if not self.connected:
            return False
        self.stop()
        time.sleep(0.3)
        if not self._reply_ok(self._send_dashboard("DisableRobot()")):
            print("  [ROBOT ERROR] DisableRobot() tidak diterima robot")
            return False
        self.enabled = False
        print("  [ROBOT] Disabled")
        return True

    def disconnect(self):
        self._closing = True
        if self.enabled:
            self.disable()
        with self._lock:
            if self.dashboard:
                try:
                    self.dashboard.close()
                except Exception:
                    pass
            self.dashboard = None
        self.connected = False
        print("  [ROBOT] Disconnected")