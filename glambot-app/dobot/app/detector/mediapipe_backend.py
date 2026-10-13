import os

import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

from app.detector.constants import CATEGORY_TO_ID, GESTURE_ID_TO_NAME
from app.detector.helpers import landmarks_to_bbox


def init_gesture_recognizer(model_path, max_hands, det_conf, track_conf):
    if not os.path.exists(model_path):
        print(f"  [ERROR] GestureRecognizer model not found: {model_path}")
        return None

    try:
        last_result = [None]

        def _on_result(result, output_image, timestamp_ms):
            last_result[0] = result

        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.GestureRecognizerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.LIVE_STREAM,
            result_callback=_on_result,
            num_hands=max_hands,
            min_hand_detection_confidence=det_conf,
            min_hand_presence_confidence=det_conf,
            min_tracking_confidence=track_conf,
        )
        recognizer = vision.GestureRecognizer.create_from_options(options)

        print(f"  [OK] GestureRecognizer ready — {model_path}")
        return {
            "type":        "gesture_recognizer",
            "recognizer":  recognizer,
            "last_result": last_result,
            "last_centroid": None,
        }
    except Exception as e:
        print(f"  [ERROR] GestureRecognizer init: {e}")
        return None


def read_gesture_result(frame, result, hands_detector):
    empty = {
        "hand_detected": False,
        "gesture_id":    None,
        "gesture_name":  "None",
        "confidence":    0.0,
        "class_id":      None,
        "bbox":          None,
        "method":        "GestureRecognizer",
    }
    if result is None or not result.gestures:
        return empty

    h, w, _ = frame.shape
    best = None
    best_score = float('inf')  # Lower is better (distance)
    prev_centroid = hands_detector.get("last_centroid")

    n_hands = len(result.gestures)
    for i in range(n_hands):
        if not result.gestures[i]:
            continue
            
        lm_raw = None
        bbox   = None
        if result.hand_landmarks and i < len(result.hand_landmarks):
            lm_raw = result.hand_landmarks[i]
            
            # FILTER ROTASI 180 (Tangan Terbalik)
            # Sumbu Y bertambah ke bawah layar. Jika y(wrist) < y(middle_tip), 
            # jari menunjuk ke bawah (upside down).
            if len(lm_raw) > 12:
                wrist_y = lm_raw[0].y
                middle_tip_y = lm_raw[12].y
                if wrist_y < middle_tip_y:
                    continue  # Abaikan tangan yang terbalik
                    
            bbox = landmarks_to_bbox(lm_raw, w, h)

        if not bbox:
            continue

        top = result.gestures[i][0]
        gid = CATEGORY_TO_ID.get(top.category_name)
        if gid is None:
            continue

        area = (max(0, bbox[2] - bbox[0]) * max(0, bbox[3] - bbox[1]))
        centroid = ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)
        
        # CENTROID TRACKING: Prioritaskan tangan yang paling dekat dengan posisi sebelumnya
        if prev_centroid is not None:
            dist_sq = (centroid[0] - prev_centroid[0])**2 + (centroid[1] - prev_centroid[1])**2
            score = dist_sq
        else:
            # Jika tidak ada histori, gunakan area (semakin besar area, makin minus skornya)
            score = -area 

        if score < best_score:
            best_score = score
            best = {
                "hand_detected": True,
                "gesture_id":    gid,
                "gesture_name":  GESTURE_ID_TO_NAME.get(gid, top.category_name),
                "confidence":    top.score,
                "class_id":      gid - 1 if gid < 10 else 0,
                "bbox":          bbox,
                "method":        "GestureRecognizer",
                "landmarks_raw": lm_raw,
                "hands_seen":    n_hands,
                "centroid":      centroid,
            }

    return best if best else empty


def detect_mediapipe(frame, hands_detector):
    if hands_detector is None:
        return None
    if isinstance(hands_detector, dict) and hands_detector.get("type") == "gesture_recognizer":
        result = read_gesture_result(frame, hands_detector["last_result"][0], hands_detector)
        if result.get("hand_detected") and "centroid" in result:
            hands_detector["last_centroid"] = result["centroid"]
        else:
            hands_detector["last_centroid"] = None
        return result
    return None


def normalize_frame(frame):
    import cv2
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def feed_mediapipe_async(hands_detector, frame, timestamp_ms):
    import cv2
    if not isinstance(hands_detector, dict):
        return
    if hands_detector.get("type") != "gesture_recognizer":
        return
    try:
        rgb    = cv2.cvtColor(normalize_frame(frame), cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        hands_detector["recognizer"].recognize_async(mp_img, int(timestamp_ms))
    except Exception as e:
        print(f"  [WARN] recognize_async: {e}")


def close_mediapipe(hands_detector):
    if isinstance(hands_detector, dict):
        try:
            hands_detector["recognizer"].close()
        except Exception:
            pass