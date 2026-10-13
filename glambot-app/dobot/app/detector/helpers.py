import cv2

from app.detector.constants import HAND_CONNECTIONS


def xy(lm, idx):
    item = lm[idx]
    if hasattr(item, "x"):
        return item.x, item.y
    return float(item[0]), float(item[1])


def landmarks_to_bbox(lm, w, h, pad=20):
    xs = [xy(lm, i)[0] * w for i in range(21)]
    ys = [xy(lm, i)[1] * h for i in range(21)]
    return [
        max(0, int(min(xs)) - pad),
        max(0, int(min(ys)) - pad),
        min(w, int(max(xs)) + pad),
        min(h, int(max(ys)) + pad),
    ]


def draw_landmarks_manual(frame, lm):
    h, w, _ = frame.shape
    pts = [(int(xy(lm, i)[0] * w), int(xy(lm, i)[1] * h)) for i in range(21)]
    for s, e in HAND_CONNECTIONS:
        cv2.line(frame, pts[s], pts[e], (0, 200, 80), 2)
    for x, y in pts:
        cv2.circle(frame, (x, y), 4, (255, 80, 80), -1)
