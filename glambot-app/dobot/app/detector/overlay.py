import cv2

# Warna BGR.
COLOR_LOCKED   = (0, 255, 128)    # hijau — wajah terkunci & tracking jalan
COLOR_SEARCH   = (0, 200, 255)    # oranye — mencari wajah
COLOR_RETICLE  = (255, 255, 255)
COLOR_FROZEN   = (200, 200, 200)


def draw_overlay(frame, det, full, *,
                 tracking_active=True,
                 detection_paused=False,
                 status_label=None,
                 target_y=0.5):
    """Anotasi frame kamera deteksi untuk stream MJPEG.

    `target_y` adalah posisi vertikal yang dikejar FaceTracker (ternormalisasi),
    jadi reticle menunjukkan titik bidik yang SEBENARNYA — bukan sekadar tengah
    frame — supaya kalibrasi di lokasi bisa dinilai dengan mata.
    """
    out = frame.copy()
    fh, fw = frame.shape[0], frame.shape[1]

    if not tracking_active:
        ov = out.copy()
        cv2.rectangle(ov, (0, 0), (fw, fh), (0, 0, 0), -1)
        out = cv2.addWeighted(ov, 0.35, out, 0.65, 0)
        cv2.putText(out, "SESSION IDLE", (fw // 2 - 150, fh // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.1, COLOR_SEARCH, 3)
        return out

    # ── Reticle titik bidik ──────────────────────────────────────────
    tx, ty = fw // 2, int(fh * target_y)
    cv2.drawMarker(out, (tx, ty), COLOR_RETICLE, cv2.MARKER_CROSS, 28, 1)
    cv2.circle(out, (tx, ty), 42, COLOR_RETICLE, 1)

    # ── Bbox wajah ───────────────────────────────────────────────────
    detected = bool(det.get("face_detected"))
    color = COLOR_FROZEN if detection_paused else (COLOR_LOCKED if detected else COLOR_SEARCH)

    if detected and det.get("bbox"):
        x1, y1, x2, y2 = [int(v) for v in det["bbox"]]
        cv2.rectangle(out, (x1, y1), (x2, y2), color, 3)

        cen = det.get("centroid")
        if cen:
            cx, cy = int(cen[0]), int(cen[1])
            cv2.circle(out, (cx, cy), 4, color, -1)
            # Garis error: seberapa jauh wajah dari titik bidik.
            cv2.line(out, (cx, cy), (tx, ty), color, 1)

        conf = det.get("confidence") or 0.0
        label = f"Face {conf * 100:.0f}%"
        (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
        cv2.rectangle(out, (x1, y1 - lh - 10), (x1 + lw + 10, y1), color, -1)
        cv2.putText(out, label, (x1 + 5, y1 - 5),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

    # ── Label status sequence (kiri atas) ────────────────────────────
    if status_label:
        (lw, lh), _ = cv2.getTextSize(status_label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
        cv2.rectangle(out, (10, 10), (20 + lw, 24 + lh), (0, 0, 0), -1)
        cv2.putText(out, status_label, (15, 18 + lh),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    if detection_paused:
        cv2.putText(out, "HOLD STILL", (fw // 2 - 110, fh - 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, COLOR_FROZEN, 2)

    return out
