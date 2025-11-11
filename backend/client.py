# """Async WebSocket client for connecting to the FastAPI server.

# Usage:
#     python client.py ws://<server_ip>:8000/ws

# Type messages and press ENTER to send. Type `exit` or `quit` to close.
# """
# import asyncio
# import sys
# import websockets


# async def client(uri: str):
#     async with websockets.connect(uri) as ws:
#         print(f"Connected to {uri}")

#         async def receiver():
#             try:
#                 async for message in ws:
#                     print(f"< {message}")
#             except Exception:
#                 pass

#         recv_task = asyncio.create_task(receiver())

#         try:
#             loop = asyncio.get_event_loop()
#             while True:
#                 # read from stdin without blocking the event loop
#                 msg = await loop.run_in_executor(None, sys.stdin.readline)
#                 if not msg:
#                     break
#                 msg = msg.strip()
#                 if msg.lower() in ("exit", "quit"):
#                     break
#                 await ws.send(msg)
#         except KeyboardInterrupt:
#             pass
#         finally:
#             recv_task.cancel()


# if __name__ == "__main__":
#     if len(sys.argv) < 2:
#         print("Usage: python client.py ws://<server_ip>:8000/ws")
#         sys.exit(1)
#     uri = sys.argv[1]
#     asyncio.run(client(uri))


"""Pi simulator: capture camera frames with OpenCV and send as base64 JPEG via WebSocket."""
import asyncio
import sys
import json
import base64
import time
import cv2
import websockets

async def pi_client(uri: str, device_id: str = "pi-01", fps: float = 5.0, cam_index: int = 0):
    async with websockets.connect(uri) as ws:
        print(f"Connected to {uri} as {device_id}")
        # send handshake
        handshake = {"role": "pi", "device_id": device_id, "action": "handshake", "payload": {"info": "pi-sim"}}
        await ws.send(json.dumps(handshake))

        # start receiver task
        async def receiver():
            try:
                async for message in ws:
                    print("RECV:", message)
            except Exception:
                pass

        recv_task = asyncio.create_task(receiver())

        # open camera
        cap = cv2.VideoCapture(cam_index)
        if not cap.isOpened():
            print("Cannot open camera")
            recv_task.cancel()
            return

        try:
            interval = 1.0 / max(0.01, fps)
            while True:
                start = time.time()
                ret, frame = cap.read()
                if not ret:
                    print("Frame capture failed")
                    await asyncio.sleep(0.5)
                    continue
                # encode as JPEG
                ok, enc = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if not ok:
                    await asyncio.sleep(interval)
                    continue
                b64 = base64.b64encode(enc.tobytes()).decode('ascii')
                payload = {
                    "frame_b64": b64,
                    "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                    "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                    "encoding": "jpeg"
                }
                packet = {"role": "pi", "device_id": device_id, "action": "telemetry", "type": "camera_frame", "payload": payload, "ts": time.time()}
                await ws.send(json.dumps(packet))
                # sleep remaining time
                elapsed = time.time() - start
                await asyncio.sleep(max(0, interval - elapsed))
        except KeyboardInterrupt:
            pass
        finally:
            cap.release()
            recv_task.cancel()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python client.py ws://<server_ip>:8000/ws [device_id] [fps]")
        sys.exit(1)
    uri = sys.argv[1]
    device_id = sys.argv[2] if len(sys.argv) > 2 else "pi-01"
    fps = float(sys.argv[3]) if len(sys.argv) > 3 else 5.0
    asyncio.run(pi_client(uri, device_id=device_id, fps=fps))
