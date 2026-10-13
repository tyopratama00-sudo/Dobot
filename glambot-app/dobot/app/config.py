import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

def _require(key: str) -> str:
    value = os.getenv(key)
    if value is None or value.strip() == "":
        raise ValueError(f"[CONFIG ERROR] Missing required env: {key}")
    return value

def _get_int(key: str) -> int:
    return int(_require(key))

def _get_float(key: str) -> float:
    return float(_require(key))

def _get_optional(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()

def _get_float_default(key: str, default: float) -> float:
    """Float dari env dengan fallback default — aman kalau key hilang / kosong /
    rusak (tidak crash). Dipakai untuk parameter yang punya default masuk akal."""
    raw = os.getenv(key)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default

def _get_int_default(key: str, default: int) -> int:
    """Int dari env dengan fallback default — aman kalau key hilang/kosong/rusak."""
    raw = os.getenv(key)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(float(raw))
    except ValueError:
        return default


@dataclass
class Config:
    camera_index: int
    frame_width: int
    frame_height: int
    camera_source: str
    # Orientasi pemasangan kamera di lengan. upside_down: kamera dipasang
    # TERBALIK (frame mentah terbalik di kedua sumbu) — dikoreksi rotate 180°.
    # mirror_preview: tampilkan seperti cermin (selfie). Keduanya dipakai
    # FaceTracker untuk tahu sumbu mana yang masih tercermin vs dunia nyata.
    camera_upside_down: bool
    camera_mirror_preview: bool

    face_model_path: str
    mp_detection_conf: float
    mp_max_faces: int

    host: str
    port: int
    jpeg_quality: int

    dobot_ip: str
    dobot_dashboard_port: int
    dobot_move_port: int
    presets_json: str

    robot_speed_factor: int
    robot_joint_speed: int
    robot_joint_acc: int
    robot_enable_timeout: float

    safety_timeout: float
    post_action_delay: float

    # ── Sequence pose otomatis ───────────────────────────────────
    # slot_sec: lama satu pose (termasuk gerak + tracking + countdown).
    # capture_lead_sec: berapa detik sebelum slot habis /api/robot/done dikirim —
    #   WAJIB sama dengan presetCaptureDelay di backend/handlers/robot.go, karena
    #   backend Go yang memegang countdown 3-2-1 dan memicu shutter.
    sequence_slot_sec: float
    sequence_start_delay_sec: float
    sequence_capture_lead_sec: float
    # prep_sec: jeda bersiap SETELAH robot sampai di preset, sebelum countdown.
    # after_shot_sec: jeda setelah shutter sebelum gerak ke preset berikutnya.
    sequence_prep_sec: float
    sequence_after_shot_sec: float
    sequence_preset_order: str

    # ── Face tracking (hanya j5 & j6) ────────────────────────────
    # gain: derajat koreksi per satuan error ternormalisasi.
    # deadband_pct: zona mati di sekitar titik bidik — mencegah jitter sekaligus
    #   membatasi jumlah perintah yang masuk ke antrean motion controller.
    # max_step_deg: batas koreksi per perintah. max_dev_deg: batas simpangan
    #   total dari nilai preset — pengaman kalau sign kalibrasi salah.
    face_track_enabled: bool
    # 0 = no webcam / MediaPipe at all; robot runs presets only.
    face_detection_enabled: bool
    face_track_rate_hz: float
    face_track_deadband_pct: float
    face_track_gain_pan: float
    face_track_gain_tilt: float
    face_track_max_step_deg: float
    face_track_max_dev_deg: float
    face_track_lost_sec: float
    # Jeda setelah tiap koreksi: tunggu lengan SAMPAI dan kamera melihat
    # posisi barunya. Tanpa ini loop menumpuk koreksi di atas error basi
    # → antrean motion controller penuh → gerak tersendat & berosilasi.
    face_track_settle_sec: float
    # Kecepatan/akselerasi sendi KHUSUS selama tracking. Koreksi tracking
    # itu gerak kecil; pada kecepatan preset ia terasa menyentak.
    face_track_joint_speed: int
    face_track_joint_acc: int
    face_track_target_y: float
    # Besar putaran uji saat mengukur arah & gain sebuah sumbu (derajat).
    face_track_probe_deg: float
    # Peredam koreksi (<1). Karena gain-nya hasil UKUR, koreksi penuh akan
    # tepat sasaran; diredam sedikit agar tidak overshoot kalau subjek
    # kebetulan ikut bergerak.
    face_track_damping: float
    # Peredaman EMA pada centroid wajah (0-1). Kecil = halus tapi lambat.
    face_track_smoothing: float
    # Auto-kalibrasi arah koreksi: kalau sebuah koreksi memperburuk error,
    # tanda (sign) sumbu itu dibalik sendiri — dan (opsional) disimpan ke
    # face_track.json supaya sesi berikutnya langsung benar.
    face_track_autocalibrate: bool
    face_track_persist_signs: bool
    face_track_config: str

    # Presence (motion frame-diff) untuk layar Home. motion_threshold: ambang
    # beda per-piksel (0-255), area_pct: min % frame yang berubah, hold_sec:
    # hysteresis "masih ada orang" biar audio tidak kedip.
    presence_motion_threshold: int
    presence_area_pct: float
    presence_hold_sec: float

    backend_url: str


def load_config() -> Config:
    return Config(
        camera_index=_get_int("CAMERA_INDEX"),
        frame_width=_get_int("FRAME_WIDTH"),
        frame_height=_get_int("FRAME_HEIGHT"),
        camera_source=_get_optional("CAMERA_SOURCE"),
        camera_upside_down=_get_int_default("CAMERA_UPSIDE_DOWN", 1) != 0,
        camera_mirror_preview=_get_int_default("CAMERA_MIRROR_PREVIEW", 1) != 0,

        face_model_path=_require("MP_FACE_MODEL_PATH"),
        mp_detection_conf=_get_float("MP_DETECTION_CONF"),
        mp_max_faces=_get_int_default("MP_MAX_FACES", 3),

        host=_require("HOST"),
        port=_get_int("PORT"),
        jpeg_quality=int(_get_optional("JPEG_QUALITY")),

        dobot_ip=_require("DOBOT_IP"),
        dobot_dashboard_port=int(_get_optional("DOBOT_DASHBOARD_PORT")),
        dobot_move_port=int(_get_optional("DOBOT_MOVE_PORT")),
        presets_json=_require("DOBOT_PRESETS_JSON"),

        robot_speed_factor=int(_get_optional("ROBOT_SPEED_FACTOR")),
        robot_joint_speed=int(_get_optional("ROBOT_JOINT_SPEED")),
        robot_joint_acc=int(_get_optional("ROBOT_JOINT_ACC")),
        robot_enable_timeout=_get_float("ROBOT_ENABLE_TIMEOUT"),

        safety_timeout=_get_float("SAFETY_TIMEOUT"),
        post_action_delay=_get_float("POST_ACTION_DELAY"),

        sequence_slot_sec=_get_float_default("SEQUENCE_SLOT_SEC", 30.0),
        sequence_start_delay_sec=_get_float_default("SEQUENCE_START_DELAY_SEC", 2.0),
        # Harus == presetCaptureDelay (3s) di backend/handlers/robot.go.
        sequence_capture_lead_sec=_get_float_default("SEQUENCE_CAPTURE_LEAD_SEC", 3.0),
        sequence_prep_sec=_get_float_default("SEQUENCE_PREP_SEC", 5.0),
        sequence_after_shot_sec=_get_float_default("SEQUENCE_AFTER_SHOT_SEC", 2.5),
        sequence_preset_order=_get_optional("SEQUENCE_PRESET_ORDER"),

        face_track_enabled=_get_int_default("FACE_TRACK_ENABLED", 0) != 0,
        face_detection_enabled=_get_int_default("FACE_DETECTION_ENABLED", 0) != 0,
        face_track_rate_hz=_get_float_default("FACE_TRACK_RATE_HZ", 3.0),
        face_track_deadband_pct=_get_float_default("FACE_TRACK_DEADBAND_PCT", 6.0),
        face_track_gain_pan=_get_float_default("FACE_TRACK_GAIN_PAN", 18.0),
        face_track_gain_tilt=_get_float_default("FACE_TRACK_GAIN_TILT", 14.0),
        face_track_max_step_deg=_get_float_default("FACE_TRACK_MAX_STEP_DEG", 6.0),
        face_track_max_dev_deg=_get_float_default("FACE_TRACK_MAX_DEV_DEG", 20.0),
        face_track_lost_sec=_get_float_default("FACE_TRACK_LOST_SEC", 2.0),
        face_track_settle_sec=_get_float_default("FACE_TRACK_SETTLE_SEC", 0.45),
        face_track_joint_speed=_get_int_default("FACE_TRACK_JOINT_SPEED", 20),
        face_track_joint_acc=_get_int_default("FACE_TRACK_JOINT_ACC", 10),
        face_track_target_y=_get_float_default("FACE_TRACK_TARGET_Y", 0.45),
        face_track_probe_deg=_get_float_default("FACE_TRACK_PROBE_DEG", 6.0),
        face_track_damping=_get_float_default("FACE_TRACK_DAMPING", 0.7),
        face_track_smoothing=_get_float_default("FACE_TRACK_SMOOTHING", 0.4),
        face_track_autocalibrate=_get_int_default("FACE_TRACK_AUTOCALIBRATE", 1) != 0,
        face_track_persist_signs=_get_int_default("FACE_TRACK_PERSIST_SIGNS", 1) != 0,
        face_track_config=_get_optional("FACE_TRACK_CONFIG", "config/face_track.json"),

        presence_motion_threshold=_get_int_default("PRESENCE_MOTION_THRESHOLD", 25),
        presence_area_pct=_get_float_default("PRESENCE_AREA_PCT", 0.8),
        presence_hold_sec=_get_float_default("PRESENCE_HOLD_SEC", 15.0),

        backend_url=_get_optional("BACKEND_URL"),
    )
