"""Pi simulator: capture camera frames with OpenCV and send as base64 JPEG via WebSocket.
   Also listens for incoming control messages (manual_drive) and simulates applying them.
"""
import asyncio
import sys
import json
import base64
import time
import cv2
import websockets

# simulator state
_current_speed = 0.0
_current_angle = 0.0
_emergency_active = False
_last_emergency_time = 0.0

def apply_manual_control(speed: float, angle: float):
    """Simulate applying manual control values from joystick"""
    global _current_speed, _current_angle
    
    # Block manual control if in emergency mode
    if _emergency_active:
        print("[BLOCKED] Manual control blocked - emergency stop active")
        return False
    
    # clamp speed/angle to -1..1
    s = max(-1.0, min(1.0, float(speed)))
    a = max(-1.0, min(1.0, float(angle)))
    _current_speed = s
    _current_angle = a
    
    # Convert to motor-specific values for simulation
    # For PWM motors (0-255 range typical):
    motor_pwm = int(abs(s) * 255)  # 0-255 PWM value
    motor_direction = "FORWARD" if s >= 0 else "REVERSE"
    
    # For servo steering (typically 1000-2000 microseconds):
    servo_center = 1500  # center position microseconds
    servo_range = 500   # +/- range from center
    servo_position = servo_center + int(a * servo_range)  # 1000-2000
    
    # For differential drive (left/right motor speeds):
    base_speed = s
    turn_factor = a * 0.5  # reduce turning sensitivity
    left_motor = base_speed + turn_factor
    right_motor = base_speed - turn_factor
    # Clamp to -1.0 to 1.0, then convert to PWM
    left_pwm = int(abs(max(-1.0, min(1.0, left_motor))) * 255)
    right_pwm = int(abs(max(-1.0, min(1.0, right_motor))) * 255)
    
    speed_pct = int(s * 100)
    angle_deg = int(a * 45)  # e.g. full-left/right -> +/-45 deg
    print(f"[CONTROL] Manual control -> speed={s:.2f} ({speed_pct}%), angle={a:.2f} ({angle_deg}°)")
    print(f"[MOTORS] PWM={motor_pwm} {motor_direction}, Servo={servo_position}μs, Differential L={left_pwm} R={right_pwm}")
    return True

def emergency_stop():
    """Immediate emergency stop - highest priority"""
    global _current_speed, _current_angle, _emergency_active, _last_emergency_time
    
    _emergency_active = True
    _last_emergency_time = time.time()
    _current_speed = 0.0
    _current_angle = 0.0
    
    print("=" * 60)
    print("🚨 EMERGENCY STOP ACTIVATED 🚨")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("ALL MOTORS DISABLED IMMEDIATELY")
    print("Manual controls BLOCKED until emergency cleared")
    print("=" * 60)

def clear_emergency():
    """Clear emergency mode - restore normal operation"""
    global _emergency_active
    _emergency_active = False
    print("✅ Emergency mode cleared - normal operation restored")

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
                    # incoming control messages routed by server
                    try:
                        pkt = json.loads(message)
                    except Exception:
                        print("RECV (text):", message)
                        continue

                    act = pkt.get("action")
                    ptype = pkt.get("type")
                    payload = pkt.get("payload", {})
                    src = pkt.get("from") or pkt.get("device_id")

                    # EMERGENCY STOP - highest priority handler
                    if act == "control" and ptype == "emergency_stop":
                        emergency_stop()
                        # Send immediate acknowledgment
                        ack = {
                            "role": "pi", 
                            "device_id": device_id, 
                            "action": "telemetry", 
                            "type": "emergency_ack", 
                            "payload": {
                                "status": "stopped",
                                "motors_disabled": True,
                                "emergency_timestamp": _last_emergency_time,
                                "device_id": device_id
                            }, 
                            "ts": time.time()
                        }
                        await ws.send(json.dumps(ack))
                        
                    elif act == "control" and ptype == "manual_drive":
                        spd = payload.get("speed")
                        ang = payload.get("angle")
                        success = apply_manual_control(spd if spd is not None else 0.0, ang if ang is not None else 0.0)
                        
                        # Send ack back to server/frontend
                        ack = {
                            "role": "pi", 
                            "device_id": device_id, 
                            "action": "telemetry", 
                            "type": "control_ack", 
                            "payload": {
                                "applied_speed": _current_speed if success else 0.0, 
                                "applied_angle": _current_angle if success else 0.0,
                                "motor_pwm": int(abs(_current_speed) * 255) if success else 0,
                                "servo_position": 1500 + int(_current_angle * 500) if success else 1500,
                                "emergency_active": _emergency_active,
                                "blocked": not success
                            }, 
                            "ts": time.time()
                        }
                        await ws.send(json.dumps(ack))
                        
                    elif act == "control" and ptype == "clear_emergency":
                        clear_emergency()
                        # Send acknowledgment that emergency was cleared
                        ack = {
                            "role": "pi", 
                            "device_id": device_id, 
                            "action": "telemetry", 
                            "type": "emergency_cleared_ack", 
                            "payload": {"status": "normal_operation", "device_id": device_id}, 
                            "ts": time.time()
                        }
                        await ws.send(json.dumps(ack))
                        
                    else:
                        # log other messages
                        print("RECV PKT:", pkt)
            except Exception as e:
                print("Receiver stopped:", e)

        recv_task = asyncio.create_task(receiver())

        # open camera
        cap = cv2.VideoCapture(cam_index)
        if not cap.isOpened():
            print("Cannot open camera - continuing without video")
            cap = None

        try:
            interval = 1.0 / max(0.01, fps)
            while True:
                start = time.time()
                
                # Send camera frame if available
                if cap:
                    ret, frame = cap.read()
                    if ret:
                        # encode as JPEG
                        ok, enc = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                        if ok:
                            b64 = base64.b64encode(enc.tobytes()).decode('ascii')
                            payload = {
                                "frame_b64": b64,
                                "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                                "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                                "encoding": "jpeg"
                            }
                            packet = {
                                "role": "pi", 
                                "device_id": device_id, 
                                "action": "telemetry", 
                                "type": "camera_frame", 
                                "payload": payload, 
                                "ts": time.time()
                            }
                            await ws.send(json.dumps(packet))
                
                # Send periodic status update (enhanced with emergency status)
                status_payload = {
                    "speed": _current_speed,
                    "angle": _current_angle,
                    "battery": 85.2,
                    "temperature": 42.1,
                    "connected": True,
                    "emergency_active": _emergency_active,
                    "last_emergency": _last_emergency_time if _emergency_active else None
                }
                status_packet = {
                    "role": "pi",
                    "device_id": device_id,
                    "action": "telemetry",
                    "type": "status",
                    "payload": status_payload,
                    "ts": time.time()
                }
                await ws.send(json.dumps(status_packet))
                
                # sleep remaining time
                elapsed = time.time() - start
                await asyncio.sleep(max(0, interval - elapsed))
                
        except KeyboardInterrupt:
            print("\nShutting down pi simulator...")
        finally:
            if cap:
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
