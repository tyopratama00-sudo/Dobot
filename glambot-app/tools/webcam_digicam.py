"""Pengganti digiCamControl memakai webcam, khusus untuk testing tanpa kamera Canon.

Backend memotret dengan meminta gambar ke digiCamControl di http://localhost:5513.
Program ini menjawab permintaan yang sama dari webcam, jadi kode aplikasi tidak
perlu diubah. Foto hasil sesi = frame webcam (resolusi webcam, bukan DSLR).

Jalankan dengan Python dari virtualenv dobot (sudah berisi OpenCV):

    glambot-app\\dobot\\venv\\Scripts\\python.exe glambot-app\\tools\\webcam_digicam.py

Opsi: --index 0 (webcam ke berapa), --width 1280 --height 720, --port 5513.
Jangan jalankan bersamaan dengan digiCamControl (port yang sama).
Ctrl+C untuk berhenti.
"""

import argparse
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import cv2

# Path yang dibaca backend sebagai frame liveview / hasil jepretan.
FRAME_PATHS = {"/liveview.jpg", "/preview.jpg", "/lastcaptured", "/api/lastcaptured", "/api/liveview"}


class Webcam:
    """Membaca webcam terus-menerus dan menyimpan JPEG terbaru."""

    def __init__(self, index, width, height, quality):
        backend = cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY
        self.cap = cv2.VideoCapture(index, backend)
        if not self.cap.isOpened():
            raise SystemExit(f"Webcam index {index} tidak bisa dibuka. Tutup aplikasi lain yang memakai webcam, atau coba --index 1.")
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        self.quality = quality
        self.jpeg = None
        self.lock = threading.Lock()
        threading.Thread(target=self._loop, daemon=True).start()

    def _loop(self):
        while True:
            ok, frame = self.cap.read()
            if not ok:
                time.sleep(0.1)
                continue
            ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, self.quality])
            if ok:
                with self.lock:
                    self.jpeg = buf.tobytes()

    def latest(self):
        with self.lock:
            return self.jpeg

    def size(self):
        return int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))


def make_handler(cam, name):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            url = urlparse(self.path)
            if url.path in FRAME_PATHS:
                jpeg = cam.latest()
                if jpeg is None:
                    return self._send(503, b"webcam belum siap", "text/plain")
                return self._send(200, jpeg, "image/jpeg")
            if url.path == "/api/camera":
                return self._send(200, json.dumps({"name": name}).encode(), "application/json")
            # Perintah shutter/liveview window digiCamControl: cukup dijawab OK,
            # backend lalu mengambil frame terbaru sebagai foto.
            if (url.path == "/" and url.query.upper().startswith("CMD=")) or url.path == "/api/capture":
                return self._send(200, b"OK", "text/plain")
            self._send(404, b"not found", "text/plain")

        def _send(self, status, body, ctype):
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *args):
            if "CMD=" in self.path or "/capture" in self.path:
                print(f"  [shutter] {self.path}")

    return Handler


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--index", type=int, default=0)
    ap.add_argument("--width", type=int, default=1280)
    ap.add_argument("--height", type=int, default=720)
    ap.add_argument("--quality", type=int, default=90)
    ap.add_argument("--port", type=int, default=5513)
    args = ap.parse_args()

    cam = Webcam(args.index, args.width, args.height, args.quality)
    for _ in range(50):
        if cam.latest():
            break
        time.sleep(0.1)
    width, height = cam.size()
    name = f"Webcam (pengganti Canon, {width}x{height})"
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(cam, name))
    print(f"{name} siap di http://localhost:{args.port}  (Ctrl+C untuk berhenti)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Berhenti.")


if __name__ == "__main__":
    main()
