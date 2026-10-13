import os

import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision


def init_face_detector(model_path, max_faces, det_conf):
    """Bangun MediaPipe FaceDetector (BlazeFace short-range) mode LIVE_STREAM.

    Mengembalikan dict handle — bukan objek — supaya state tracking (centroid
    frame sebelumnya) ikut menempel pada backend dan konsumen tetap duck-typed.
    """
    if not os.path.exists(model_path):
        print(f"  [ERROR] FaceDetector model not found: {model_path}")
        return None

    try:
        last_result = [None]

        def _on_result(result, output_image, timestamp_ms):
            last_result[0] = result

        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.FaceDetectorOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.LIVE_STREAM,
            result_callback=_on_result,
            min_detection_confidence=det_conf,
            min_suppression_threshold=0.3,
        )
        detector = vision.FaceDetector.create_from_options(options)

        print(f"  [OK] FaceDetector ready — {model_path}")
        return {
            "type":          "face_detector",
            "detector":      detector,
            "last_result":   last_result,
            "last_centroid": None,
            "max_faces":     max(1, int(max_faces)),
        }
    except Exception as e:
        print(f"  [ERROR] FaceDetector init: {e}")
        return None


def empty_face_detection():
    return {
        "face_detected": False,
        "confidence":    0.0,
        "bbox":          None,
        "centroid":      None,
        "offset":        None,
        "faces_seen":    0,
        "method":        "FaceDetector",
    }


def read_face_result(frame, result, face_detector):
    """Pilih SATU wajah dari hasil deteksi dan ubah ke dict deteksi standar.

    Pemilihannya sama seperti versi gesture dulu: kalau sudah pernah mengunci
    seseorang, ambil wajah yang centroid-nya PALING DEKAT ke frame sebelumnya —
    supaya tracking tidak melompat ke penonton di latar belakang. Tanpa histori,
    ambil wajah dengan bbox terbesar (paling dekat ke kamera = subjek foto).
    """
    empty = empty_face_detection()
    if result is None or not result.detections:
        return empty

    h, w, _ = frame.shape
    cap = face_detector.get("max_faces", 3)
    detections = result.detections[:cap]

    prev_centroid = face_detector.get("last_centroid")
    best = None
    best_score = float("inf")  # makin kecil makin baik

    for det in detections:
        bb = det.bounding_box
        if bb is None:
            continue

        x1 = max(0, int(bb.origin_x))
        y1 = max(0, int(bb.origin_y))
        x2 = min(w, int(bb.origin_x + bb.width))
        y2 = min(h, int(bb.origin_y + bb.height))
        if x2 <= x1 or y2 <= y1:
            continue

        score = det.categories[0].score if det.categories else 0.0
        area = (x2 - x1) * (y2 - y1)
        centroid = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

        if prev_centroid is not None:
            rank = ((centroid[0] - prev_centroid[0]) ** 2
                    + (centroid[1] - prev_centroid[1]) ** 2)
        else:
            rank = -area  # tanpa histori: wajah terbesar menang

        if rank < best_score:
            best_score = rank
            best = {
                "face_detected": True,
                "confidence":    float(score),
                "bbox":          [x1, y1, x2, y2],
                "centroid":      centroid,
                # Error ternormalisasi terhadap pusat frame, dipakai FaceTracker.
                # Rentang kira-kira -0.5..+0.5; + = wajah di kanan / bawah frame.
                "offset":        (centroid[0] / w - 0.5, centroid[1] / h - 0.5),
                "faces_seen":    len(detections),
                "method":        "FaceDetector",
            }

    return best if best else empty


def detect_face(frame, face_detector):
    if face_detector is None:
        return None
    if not isinstance(face_detector, dict) or face_detector.get("type") != "face_detector":
        return None

    result = read_face_result(frame, face_detector["last_result"][0], face_detector)
    face_detector["last_centroid"] = result["centroid"] if result["face_detected"] else None
    return result


def normalize_frame(frame):
    """CLAHE pada kanal L — menaikkan kontras lokal supaya wajah tetap terbaca
    di pencahayaan studio yang timpang (backlight / spotlight)."""
    import cv2
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def feed_face_async(face_detector, frame, timestamp_ms):
    import cv2
    if not isinstance(face_detector, dict):
        return
    if face_detector.get("type") != "face_detector":
        return
    try:
        rgb = cv2.cvtColor(normalize_frame(frame), cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        face_detector["detector"].detect_async(mp_img, int(timestamp_ms))
    except Exception as e:
        print(f"  [WARN] detect_async: {e}")


def close_face_detector(face_detector):
    if isinstance(face_detector, dict):
        try:
            face_detector["detector"].close()
        except Exception:
            pass
