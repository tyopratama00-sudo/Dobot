import time
import threading
import cv2
from flask import Flask, Response, jsonify, request, send_from_directory

try:
    from flask_cors import CORS
    _HAS_CORS = True
except ImportError:
    _HAS_CORS = False

import os

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")


def create_app(runtime):
    app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=None)
    if _HAS_CORS:
        CORS(app)

    cfg = runtime.config

    @app.route("/")
    def dashboard():
        return send_from_directory(TEMPLATE_DIR, "dashboard.html")

    @app.route("/assets/<path:filename>")
    def assets(filename):
        return send_from_directory(TEMPLATE_DIR, filename)

    @app.route("/video_feed")
    @app.route("/stream")
    def video_feed():
        def gen():
            while runtime.running:
                if runtime.detector:
                    progress = runtime.sequence_progress()
                    frame = runtime.detector.render_annotated(
                        tracking_active=runtime.tracking_active,
                        # Selama CAPTURING lengan sengaja dibekukan — tandai di
                        # overlay supaya jelas ini bukan tracking yang macet.
                        detection_paused=runtime.fsm_state == "CAPTURING",
                        status_label=progress["label"],
                    )
                    if frame is not None:
                        _, buf = cv2.imencode(
                            ".jpg", frame,
                            [cv2.IMWRITE_JPEG_QUALITY, cfg.jpeg_quality],
                        )
                        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                               + buf.tobytes() + b"\r\n")
                time.sleep(0.033)
        return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

    @app.route("/detection")
    def api_detection():
        d = runtime.detector.get_latest_detection() if runtime.detector else {}
        face = bool(d.get("face_detected"))
        progress = runtime.sequence_progress()

        offset = d.get("offset")
        return jsonify({
            "session_active":  runtime.session_active,
            "face_detected":   face,
            "face_offset":     ({"x": round(offset[0], 4), "y": round(offset[1], 4)}
                                if face and offset else None),
            "confidence":      d.get("confidence"),
            "method":          d.get("method") or ("mediapipe" if face else "idle"),
            "tracking_active": bool(runtime.tracker and runtime.tracker.active),
            "fsm_state":       runtime.fsm_state,
            "status":          progress["label"],
            "sequence": {
                "index":        progress["index"],
                "total":        progress["total"],
                "preset":       progress["preset"],
                "preset_name":  progress["preset_name"],
                "seconds_left": progress["seconds_left"],
                "slot_sec":     progress["slot_sec"],
                "percent":      progress["percent"],
                "complete":     progress["complete"],
            },
            "robot": {
                "connected":      runtime.robot.connected if runtime.robot else False,
                "enabled":        getattr(runtime.robot, "enabled", False),
                "current_preset": getattr(runtime.robot, "current_preset", None),
                "ip":             cfg.dobot_ip,
            },
        })

    @app.route("/presence")
    def api_presence():
        # Sinyal ringan buat layar Home: ada gerakan dalam `presence_hold_sec`
        # terakhir? Cukup 1 boolean, jadi poll-nya murah. motion_ratio untuk
        # kalibrasi ambang di lokasi.
        det = runtime.detector
        return jsonify({
            "present":      bool(det.presence) if det else False,
            "motion_ratio": round(getattr(det, "_motion_ratio", 0.0), 2) if det else 0.0,
        })

    @app.route("/status")
    def api_status():
        return jsonify({
            "running":        runtime.running,
            "session_active": runtime.session_active,
            "fsm_state":      runtime.fsm_state,
            "capture_locked": runtime.capture_in_progress,
            "sequence_order": runtime.sequence_order,
            "presets":        {str(k): v["name"] for k, v in runtime.presets.items()},
            "robot": {
                "connected":      runtime.robot.connected if runtime.robot else False,
                "enabled":        getattr(runtime.robot, "enabled", False),
                "current_preset": getattr(runtime.robot, "current_preset", None),
                "dry_run":        runtime.dry_run,
            },
        })

    # ── Sequence ──────────────────────────────────────────────────
    @app.route("/sequence")
    def api_sequence():
        return jsonify({
            "fsm_state": runtime.fsm_state,
            "order":     runtime.sequence_order,
            "slot_sec":  cfg.sequence_slot_sec,
            **runtime.sequence_progress(),
        })

    @app.route("/sequence/skip", methods=["POST"])
    def api_sequence_skip():
        if not runtime.sequence.skip():
            return jsonify({"error": "tidak ada pose aktif untuk dilewati"}), 409
        return jsonify({"status": "skipped", **runtime.sequence_progress()})

    @app.route("/config/runtime", methods=["GET", "POST"])
    def api_config_runtime():
        # GET: nilai tuning saat ini. POST: terapkan (dari backend admin).
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
            applied = runtime.apply_runtime_settings(data)
            print(f"  [CONFIG] Runtime tuning diperbarui: {applied}")
            return jsonify({"status": "applied", "settings": applied})
        return jsonify(runtime.current_runtime_settings())

    @app.route("/tracking/start", methods=["POST"])
    def api_tracking_start():
        runtime.start_tracking()
        return jsonify({"tracking": runtime.tracking_active})

    @app.route("/tracking/stop", methods=["POST"])
    def api_tracking_stop():
        runtime.stop_tracking()
        return jsonify({"tracking": runtime.tracking_active})

    @app.route("/tracking/status")
    def api_tracking_status():
        return jsonify({
            "tracking":      runtime.tracking_active,
            "face_tracking": runtime.tracker.state() if runtime.tracker else None,
        })

    # ── Robot ─────────────────────────────────────────────────────
    @app.route("/robot/enable", methods=["POST"])
    def api_robot_enable():
        # Body opsional {"only": [posisi 1-based]} → retake: jalankan pose itu saja.
        raw = (request.get_json(silent=True) or {}).get("only") or []
        total = len(runtime.sequence_order)
        try:
            only = [int(x) for x in raw]
        except (TypeError, ValueError):
            return jsonify({"error": "only harus daftar angka"}), 400
        if any(x < 1 or x > total for x in only):
            return jsonify({"error": f"only di luar 1..{total}"}), 400

        # Dry-run (--no-robot): tidak ada hardware untuk di-enable/home. Cukup
        # buka session supaya sequence bisa dites dari Monitor 2.
        if runtime.dry_run:
            runtime.session_active = True
            runtime.notify_session_started(only)
            print("  [SESSION] ✓ Started (dry-run)")
            return jsonify({"status": "enabled", "message": "Dry-run session active"})

        if not runtime.robot or not runtime.robot.connected:
            return jsonify({"error": "not connected"}), 503
        if runtime.robot.enabled:
            if not runtime.session_active:
                # /robot/disable masih pulang-lalu-mati di thread-nya; coba lagi sebentar.
                return jsonify({"error": "robot sedang dimatikan, coba lagi"}), 409
            return jsonify({"status": "already_enabled"})

        def _enable_and_home():
            if runtime.robot.initialize():
                runtime.robot.enabled = True
                runtime.session_active = True
                print("  [ROBOT] Moving to initial pose after enable...")
                runtime.robot.move_to_initial_pose(runtime.presets)
                runtime.robot.wait_until_idle(timeout=runtime.config.safety_timeout)
                # Verifikasi current_preset ke posisi FISIK (anti state basi kalau
                # robot sempat digerakkan manual lewat Dobot Studio).
                runtime.robot.sync_current_preset(runtime.presets)
                print("  [ROBOT] ✓ At initial pose")
                print("  [SESSION] ✓ Started")
                # Sequence baru jalan SETELAH homing selesai — kalau dimulai lebih
                # awal, gerak ke pose 1 akan bertabrakan dengan gerak homing.
                runtime.notify_session_started(only)

        threading.Thread(target=_enable_and_home, daemon=True, name="robot_enable").start()
        return jsonify({
            "status":  "enabling",
            "message": "Robot diaktifkan, homing, lalu sequence pose otomatis dimulai",
        })

    @app.route("/robot/disable", methods=["POST"])
    def api_robot_disable():
        # Dry-run (--no-robot): cukup tutup session (tanpa home/servo-off nyata).
        if runtime.dry_run:
            runtime.session_active = False
            runtime.stop_session()
            print("  [SESSION] ✓ Ended (dry-run)")
            return jsonify({"status": "disabled", "message": "Dry-run session ended"})

        if not runtime.robot or not runtime.robot.connected:
            return jsonify({"error": "not connected"}), 503
        if not runtime.robot.enabled:
            return jsonify({"status": "already_disabled"})

        # Hentikan sequence & tracking DULU, baru pulang — supaya tidak ada
        # perintah tracking yang menyusul setelah gerak homing dimulai.
        runtime.session_active = False
        runtime.stop_session()
        print("  [SESSION] ✓ Ended")

        def _home_and_disable():
            print("  [ROBOT] Returning to initial pose before disable...")
            runtime.robot.move_to_initial_pose(runtime.presets)
            runtime.robot.wait_until_idle()   # off as soon as the home move finishes
            runtime.robot.disable()
            print("  [ROBOT] ✓ Disabled")

        threading.Thread(target=_home_and_disable, daemon=True, name="robot_disable").start()
        return jsonify({
            "status":  "disabling",
            "message": "Robot kembali ke initial pose lalu langsung dimatikan",
        })

    @app.route("/robot/stop", methods=["POST"])
    def api_robot_stop():
        if runtime.robot and runtime.robot.connected:
            runtime.stop_session()
            runtime.robot.stop()
            return jsonify({"status": "stopped"})
        return jsonify({"error": "not connected"}), 503

    @app.route("/robot/preset", methods=["POST"])
    def api_robot_preset():
        if runtime.capture_in_progress:
            return jsonify({"error": "busy — robot sedang bergerak"}), 409

        data = request.get_json(silent=True) or {}

        preset_raw = data.get("preset")
        if preset_raw is None:
            return jsonify({"error": "preset is required"}), 400

        try:
            preset_num = int(preset_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid preset — harus berupa angka"}), 400

        if preset_num not in runtime.presets:
            return jsonify({"error": f"preset {preset_num} not defined"}), 404

        if not runtime.trigger_preset(preset_num):
            return jsonify({"error": "could not queue preset"}), 409

        preset_name = runtime.presets[preset_num]["name"]
        return jsonify({
            "status":      "moving",
            "preset":      preset_num,
            "preset_name": preset_name,
            "message":     f"Robot bergerak ke preset {preset_num} ({preset_name})",
        })

    @app.route("/robot/track/nudge", methods=["POST"])
    def api_robot_track_nudge():
        """Kalibrasi arah face tracking.

        Geser satu joint sekian derajat lalu amati ke mana wajah bergeser di
        /video_feed. Kalau wajah menjauh dari titik bidik, balik sign-nya di
        config/face_track.json untuk preset tersebut.
        """
        if not runtime.tracker:
            return jsonify({"error": "tracker belum siap"}), 503
        if runtime.fsm_state in ("MOVING", "TRACKING", "CAPTURING"):
            return jsonify({"error": "busy — sequence sedang jalan"}), 409

        data = request.get_json(silent=True) or {}
        try:
            joint   = int(data.get("joint", 0))
            degrees = float(data.get("degrees", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "joint & degrees harus angka"}), 400

        ok, msg = runtime.tracker.nudge(joint, degrees)
        if not ok:
            return jsonify({"error": msg}), 409
        return jsonify({
            "status":  "nudged",
            "joint":   joint,
            "degrees": degrees,
            "joints":  runtime.robot.get_current_joints(),
        })

    @app.route("/robot/status")
    def api_robot_status():
        return jsonify({
            "connected":           runtime.robot.connected if runtime.robot else False,
            "enabled":             getattr(runtime.robot, "enabled", False),
            "current_preset":      getattr(runtime.robot, "current_preset", None),
            "capture_in_progress": runtime.capture_in_progress,
            "fsm_state":           runtime.fsm_state,
        })

    @app.route("/robot/live")
    def api_robot_live():
        if not runtime.robot or not runtime.robot.connected:
            return jsonify({"error": "not connected"}), 503
        if runtime.capture_in_progress:
            # Hindari rebutan soket dengan gerakan yang sedang jalan.
            return jsonify({"error": "busy — robot sedang bergerak"}), 409
        return jsonify(runtime.robot.live_state(runtime.presets))

    @app.route("/health")
    def api_health():
        return jsonify({"status": "ok", "service": "robot-controller"})

    @app.route("/shutdown", methods=["POST"])
    def api_shutdown():
        runtime.running = False
        return jsonify({"status": "shutting down"})

    return app
