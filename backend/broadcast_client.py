"""Capture one frame and POST it to server /broadcast as telemetry camera_frame JSON."""
import sys
import requests
import json
import base64
import cv2
import time

def main():
    if len(sys.argv) < 2:
        print("Usage: python broadcast_client.py http://<server_ip>:8000 [device_id]")
        return
    base = sys.argv[1].rstrip("/")
    device_id = sys.argv[2] if len(sys.argv) > 2 else "pi-01"
    url = f"{base}/broadcast"

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Cannot open camera")
        return
    ret, frame = cap.read()
    cap.release()
    if not ret:
        print("Failed to capture frame")
        return
    ok, enc = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not ok:
        print("JPEG encode failed")
        return
    b64 = base64.b64encode(enc.tobytes()).decode('ascii')
    payload = {
        "from": device_id,
        "action": "telemetry",
        "type": "camera_frame",
        "payload": {"frame_b64": b64, "encoding": "jpeg", "width": frame.shape[1], "height": frame.shape[0]},
        "ts": time.time()
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        print("Status:", r.status_code, r.text)
    except Exception as e:
        print("Error sending broadcast:", e)

if __name__ == "__main__":
    main()
