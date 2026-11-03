"""Tes keselamatan robot memakai robot tiruan lewat TCP sungguhan.

Jalankan dari folder dobot:  venv\\Scripts\\python -m unittest discover -s tests -t .

Robot tiruan hanya membuktikan logika di sisi kita. Efek Stop() pada lengan asli
dan format balasan firmware tetap harus dicoba di robotnya.
"""
import os
import socket
import sys
import threading
import time
import unittest
from types import SimpleNamespace

# Log memakai karakter non-ASCII; lihat catatan yang sama di main.py.
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

from app.core.runtime import Runtime
from app.robot import controller as controller_module
from app.web import create_app

PRESETS_JSON = os.path.join(os.path.dirname(__file__), "..", "config", "new_preset.json")


class FakeDobot:
    """Dashboard Dobot: balasan `ErrorID,{value},Cmd();`, mode 4=off 5=on 7=gerak."""

    def __init__(self, port=0):
        self.commands = []
        self.reject = set()       # nama perintah yang dijawab ErrorID -1
        self.silent = set()       # nama perintah yang tidak dijawab sama sekali
        self.enable_delay = 0.0
        self.move_time = 0.05
        self.mode = 4
        self._move_until = 0.0
        self._enable_at = None
        self._conns = []
        self._server = socket.socket()
        self._server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._server.bind(("127.0.0.1", port))
        self._server.listen()
        self.port = self._server.getsockname()[1]
        threading.Thread(target=self._accept, daemon=True).start()

    def _accept(self):
        while True:
            try:
                conn, _ = self._server.accept()
            except OSError:
                return
            self._conns.append(conn)
            threading.Thread(target=self._serve, args=(conn,), daemon=True).start()

    def _serve(self, conn):
        buf = b""
        while True:
            try:
                chunk = conn.recv(1024)
            except OSError:
                return
            if not chunk:
                return
            buf += chunk
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                reply = self._handle(line.decode().strip())
                if reply is not None:
                    conn.sendall(reply.encode())

    def _handle(self, cmd):
        name = cmd.split("(")[0]
        self.commands.append(cmd)
        if name in self.silent:
            return None
        if name in self.reject:
            return f"-1,{{}},{cmd};"
        if name == "EnableRobot":
            self._enable_at = time.time() + self.enable_delay
        elif name == "DisableRobot":
            self.mode, self._enable_at, self._move_until = 4, None, 0.0
        elif name == "Stop":
            self._move_until = 0.0
        elif name == "JointMovJ":
            self._move_until = time.time() + self.move_time
        elif name == "RobotMode":
            return f"0,{{{self._current_mode()}}},RobotMode();"
        elif name == "GetAngle":
            return "0,{0,0,0,0,0,0},GetAngle();"
        return f"0,{{}},{cmd};"

    def _current_mode(self):
        if self._enable_at is not None and time.time() >= self._enable_at:
            self.mode, self._enable_at = 5, None
        if self.mode == 5 and time.time() < self._move_until:
            return 7
        return self.mode

    def count(self, name):
        return sum(1 for c in list(self.commands) if c.startswith(name + "("))

    def drop_clients(self):
        for conn in self._conns:
            try:
                conn.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            conn.close()
        self._conns.clear()

    def close(self):
        self.drop_clients()
        self._server.close()


def make_config(port):
    return SimpleNamespace(
        presets_json=PRESETS_JSON,
        sequence_preset_order="",
        dobot_ip="127.0.0.1",
        dobot_dashboard_port=port,
        dobot_move_port=port,
        robot_speed_factor=10,
        robot_joint_speed=10,
        robot_joint_acc=10,
        robot_enable_timeout=2.0,
        safety_timeout=0.5,
        post_action_delay=0.0,
        sequence_slot_sec=1.0,
        sequence_start_delay_sec=0.0,
        sequence_capture_lead_sec=0.0,
        sequence_prep_sec=0.0,
        sequence_after_shot_sec=0.0,
        face_track_enabled=False,
        backend_url="http://127.0.0.1:1",
    )


def wait_for(predicate, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(0.01)
    return False


class RobotSafetyTest(unittest.TestCase):
    def setUp(self):
        self._interval = controller_module.RECONNECT_INTERVAL
        controller_module.RECONNECT_INTERVAL = 0.05
        self.fake = FakeDobot()
        self.rt = Runtime(make_config(self.fake.port))
        self.rt.init_hardware()
        # Balasan pertama = koneksi sudah tercatat, jadi drop_clients() pasti kena.
        self.assertEqual(self.rt.robot._robot_mode(), 4)
        self.client = create_app(self.rt).test_client()

    def tearDown(self):
        self.rt.stop()
        self.fake.close()
        controller_module.RECONNECT_INTERVAL = self._interval

    def post(self, path, **kwargs):
        return self.client.post(path, **kwargs)

    def status(self):
        return self.client.get("/robot/status").get_json()

    # ── Boot ──────────────────────────────────────────────────────
    def test_boot_connects_without_enabling_or_moving(self):
        self.assertTrue(self.rt.robot.connected)
        self.assertFalse(self.rt.robot.enabled)
        self.assertEqual(self.fake.count("EnableRobot"), 0)
        self.assertEqual(self.fake.count("JointMovJ"), 0)
        self.assertTrue(self.status()["standby"])

    # ── Race enable / disable ─────────────────────────────────────
    def test_disable_during_enable_cancels_session(self):
        self.fake.enable_delay = 0.4
        self.assertEqual(self.post("/robot/enable").status_code, 200)
        self.assertTrue(wait_for(lambda: self.fake.count("EnableRobot") == 1))

        body = self.post("/robot/disable").get_json()
        self.assertEqual(body["status"], "disabling")

        self.assertTrue(wait_for(lambda: self.status()["standby"]))
        time.sleep(0.2)
        self.assertFalse(self.rt.session_active)
        self.assertFalse(self.rt.robot.enabled)
        self.assertEqual(self.rt.sequence.state, "IDLE")
        self.assertGreaterEqual(self.fake.count("DisableRobot"), 1)
        self.assertEqual(self.fake.mode, 4)

    def test_enable_while_disabling_is_rejected_then_works(self):
        self.fake.move_time = 0.3
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))
        self.post("/robot/disable")
        self.assertEqual(self.post("/robot/enable").status_code, 409)
        self.assertTrue(wait_for(lambda: self.status()["standby"]))
        self.assertEqual(self.post("/robot/enable").status_code, 200)

    # ── Emergency stop ────────────────────────────────────────────
    def test_stop_sends_stop_and_resets_session(self):
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))

        res = self.post("/robot/stop")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["disabled"])
        self.assertGreaterEqual(self.fake.count("Stop"), 1)
        self.assertEqual(self.fake.count("MoveJog"), 0)
        self.assertEqual(self.fake.mode, 4)
        self.assertFalse(self.rt.session_active)
        self.assertTrue(wait_for(lambda: self.status()["standby"]))

        # Sesi berikutnya harus bisa mulai lagi, bukan already_enabled.
        self.assertEqual(self.post("/robot/enable").get_json()["status"], "enabling")

    def test_stop_during_enable_does_not_home(self):
        self.fake.enable_delay = 0.4
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.fake.count("EnableRobot") == 1))
        self.assertEqual(self.post("/robot/stop").status_code, 200)
        self.assertTrue(wait_for(lambda: self.status()["standby"]))
        time.sleep(0.5)
        self.assertEqual(self.fake.count("JointMovJ"), 0)
        self.assertEqual(self.fake.mode, 4)

    def test_stop_reports_failure_when_servo_stays_on(self):
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))
        self.fake.reject.add("DisableRobot")
        res = self.post("/robot/stop")
        self.assertEqual(res.status_code, 502)
        self.assertFalse(res.get_json()["disabled"])
        self.assertFalse(self.status()["standby"])
        self.assertTrue(self.rt.robot.enabled)
        self.fake.reject.clear()

    # ── Booth harus tahu sesi berhenti ────────────────────────────
    def detection(self):
        return self.client.get("/detection").get_json()

    def test_stop_while_moving_tells_booth_session_stopped(self):
        self.rt._notify_backend = lambda path, payload: None
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))
        self.fake.move_time = 5.0
        self.assertTrue(wait_for(lambda: self.rt.sequence.state == "MOVING"
                                 and self.fake._current_mode() == 7))
        moves = self.fake.count("JointMovJ")
        self.assertFalse(self.detection()["session_stopped"])

        started = time.time()
        self.assertEqual(self.post("/robot/stop").status_code, 200)
        self.assertLess(time.time() - started, 2.0, "stop tidak boleh menunggu gerak selesai")

        self.assertTrue(self.detection()["session_stopped"])
        self.assertEqual(self.fake.mode, 4)
        time.sleep(0.3)
        self.assertEqual(self.fake.count("JointMovJ"), moves, "lengan tidak boleh melanjutkan sendiri")

        # Booth pindah ke Review lewat disable, lalu ambil ulang mulai bersih.
        self.fake.move_time = 0.05
        self.assertEqual(self.post("/robot/disable").get_json()["status"], "already_disabled")
        self.assertFalse(self.detection()["session_stopped"])
        self.assertEqual(self.post("/robot/enable", json={"only": [1]}).get_json()["status"], "enabling")
        self.assertFalse(self.detection()["session_stopped"])
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))

    def test_enable_right_after_stop_clears_session_stopped(self):
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))
        self.post("/robot/stop")
        self.assertTrue(self.detection()["session_stopped"])
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "standby"))
        self.assertEqual(self.post("/robot/enable").get_json()["status"], "enabling")
        self.assertFalse(self.detection()["session_stopped"])

    def test_stop_during_homing_tells_booth_session_stopped(self):
        self.fake.enable_delay = 0.4
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.fake.count("EnableRobot") == 1))
        self.post("/robot/stop")
        self.assertTrue(self.detection()["session_stopped"])

    def test_stop_without_session_is_not_reported(self):
        self.assertEqual(self.post("/robot/stop").status_code, 200)
        self.assertFalse(self.detection()["session_stopped"])

    def test_failed_enable_tells_booth_session_stopped(self):
        original = controller_module.REPLY_TIMEOUT
        controller_module.REPLY_TIMEOUT = 0.1
        self.rt.robot.dashboard.settimeout(0.1)
        self.fake.silent.add("EnableRobot")
        try:
            self.post("/robot/enable")
            self.assertTrue(wait_for(lambda: self.detection()["session_stopped"]))
        finally:
            self.fake.silent.clear()
            controller_module.REPLY_TIMEOUT = original
        self.assertEqual(self.status()["error"], "Robot gagal diaktifkan")

    def test_failed_move_tells_booth_session_stopped(self):
        self.rt._notify_backend = lambda path, payload: None
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.fake.count("JointMovJ") >= 1))
        self.fake.reject.add("JointMovJ")
        self.assertTrue(wait_for(lambda: self.detection()["session_stopped"]))
        self.fake.reject.clear()

    def test_offline_enable_tells_booth_then_clears(self):
        self.rt.robot._closing = True
        self.fake.drop_clients()
        self.rt.robot._send_dashboard("RobotMode()")
        self.assertEqual(self.post("/robot/enable").status_code, 503)
        self.assertTrue(self.detection()["session_stopped"])
        self.assertEqual(self.post("/robot/disable").status_code, 503)
        self.assertFalse(self.detection()["session_stopped"])

    # ── Disable ───────────────────────────────────────────────────
    def test_disable_homes_then_turns_off(self):
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))
        moves = self.fake.count("JointMovJ")
        self.post("/robot/disable")
        self.assertFalse(self.status()["standby"] and self.rt.robot.enabled)
        self.assertTrue(wait_for(lambda: self.status()["standby"]))
        self.assertGreater(self.fake.count("JointMovJ"), moves)
        self.assertEqual(self.fake.mode, 4)

    def test_rejected_disable_is_reported(self):
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))
        self.fake.reject.add("DisableRobot")
        self.post("/robot/disable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "standby"))
        status = self.status()
        self.assertFalse(status["standby"])
        self.assertEqual(status["error"], "Robot gagal dimatikan")
        self.fake.reject.clear()

    # ── Gerak ditolak ─────────────────────────────────────────────
    def test_rejected_move_keeps_current_preset(self):
        self.rt.robot.initialize()
        before = self.rt.robot.current_preset
        self.fake.reject.add("JointMovJ")
        self.assertFalse(self.rt.robot.move_to_preset(2, self.rt.presets))
        self.assertEqual(self.rt.robot.current_preset, before)
        self.fake.reject.clear()

    def test_rejected_move_during_sequence_stops_without_photo(self):
        notified = []
        self.rt._notify_backend = lambda path, payload: notified.append(path)
        self.fake.move_time = 0.0
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.fake.count("JointMovJ") >= 1))
        self.fake.reject.add("JointMovJ")
        self.assertTrue(wait_for(lambda: self.rt.sequence.state == "DONE"))
        self.fake.reject.clear()

        self.assertFalse(self.rt.sequence.complete)
        self.assertFalse(self.rt.session_active)
        self.assertFalse(self.rt.robot.enabled)
        self.assertEqual(self.fake.mode, 4)
        self.assertIn("Gagal sampai", self.rt.robot_error)
        # Jumlah foto tidak boleh melebihi pose yang benar-benar tercapai.
        self.assertLess(notified.count("/api/robot/done"), notified.count("/api/robot/moving"))

    def test_booth_can_retake_after_abort(self):
        self.rt._notify_backend = lambda path, payload: None
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.fake.count("JointMovJ") >= 1))
        self.fake.reject.add("JointMovJ")
        self.assertTrue(wait_for(lambda: self.rt.sequence.state == "DONE"))
        self.fake.reject.clear()

        self.assertEqual(self.post("/robot/disable").get_json()["status"], "already_disabled")
        self.assertTrue(self.status()["standby"])
        self.assertEqual(self.post("/robot/enable", json={"only": [1]}).status_code, 200)
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))

    # ── Koneksi ───────────────────────────────────────────────────
    def test_reconnect_turns_robot_off_and_does_not_resend_move(self):
        self.post("/robot/enable")
        self.assertTrue(wait_for(lambda: self.rt.robot_mode == "active"))
        self.rt.sequence.stop()
        moves = self.fake.count("JointMovJ")
        disables = self.fake.count("DisableRobot")

        self.fake.drop_clients()
        self.assertIsNone(self.rt.robot._send_dashboard("RobotMode()"))
        self.assertFalse(self.rt.robot.connected)

        self.assertTrue(wait_for(lambda: self.rt.robot.connected))
        self.assertFalse(self.rt.robot.enabled)
        self.assertEqual(self.fake.count("JointMovJ"), moves)
        self.assertGreater(self.fake.count("DisableRobot"), disables)

        # Mode masih "active" tapi servo sudah mati: enable harus menyalakan lagi.
        self.assertEqual(self.post("/robot/enable").get_json()["status"], "enabling")

    def test_timeout_drops_connection_so_late_reply_is_not_misread(self):
        original = controller_module.REPLY_TIMEOUT
        controller_module.REPLY_TIMEOUT = 0.1
        self.rt.robot.dashboard.settimeout(0.1)
        self.fake.silent.add("GetAngle")
        try:
            self.assertIsNone(self.rt.robot.get_current_joints())
            self.assertFalse(self.rt.robot.connected)
        finally:
            self.fake.silent.clear()
            controller_module.REPLY_TIMEOUT = original
        self.assertTrue(wait_for(lambda: self.rt.robot.connected))
        self.assertEqual(self.rt.robot._robot_mode(), 4)

    def test_commands_refused_while_disconnected(self):
        self.rt.robot._closing = True    # jangan sambung lagi selama tes ini
        self.fake.drop_clients()
        self.assertIsNone(self.rt.robot._send_dashboard("RobotMode()"))
        self.assertFalse(self.rt.robot.connected)
        self.assertEqual(self.post("/robot/enable").status_code, 503)
        self.assertEqual(self.post("/robot/disable").status_code, 503)
        self.assertEqual(self.post("/robot/stop").status_code, 503)


class ReplyParsingTest(unittest.TestCase):
    def test_reply_ok(self):
        ok = controller_module.DobotController._reply_ok
        self.assertTrue(ok("0,{},Stop();"))
        self.assertFalse(ok("-1,{},Stop();"))
        self.assertFalse(ok("-30001,{},JointMovJ(1,2,3,4,5,6);"))
        self.assertFalse(ok(None))
        self.assertFalse(ok(""))
        self.assertTrue(ok("format tak dikenal"))


class DryRunTest(unittest.TestCase):
    def test_dry_run_session_never_touches_robot(self):
        rt = Runtime(make_config(1), dry_run=True)
        rt.init_hardware()
        rt._notify_backend = lambda path, payload: None
        client = create_app(rt).test_client()
        try:
            self.assertEqual(client.post("/robot/enable").get_json()["status"], "enabled")
            self.assertTrue(rt.session_active)
            self.assertEqual(client.post("/robot/disable").get_json()["status"], "disabled")
            self.assertTrue(client.get("/robot/status").get_json()["standby"])
            self.assertEqual(client.post("/robot/stop").get_json()["status"], "stopped")
            self.assertFalse(client.get("/detection").get_json()["session_stopped"])

            client.post("/robot/enable")
            client.post("/robot/stop")
            self.assertTrue(client.get("/detection").get_json()["session_stopped"])
        finally:
            rt.stop()


if __name__ == "__main__":
    unittest.main()
