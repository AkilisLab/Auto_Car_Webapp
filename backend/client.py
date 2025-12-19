"""Pi simulator: capture camera frames with OpenCV and send as base64 JPEG via WebSocket.
   Also listens for incoming control messages (manual_drive) and simulates applying them.
   Now includes autonomous navigation simulation and grid-based route following.
"""
import asyncio
import sys
import json
import base64
import time
import cv2
import websockets
import math
import random
import os
import requests
import re
try:
    import spotify  # local module moved next to client
except Exception:
    spotify = None

# simulator state
_current_speed = 0.0
_current_angle = 0.0
_emergency_active = False
_last_emergency_time = 0.0

# autonomous navigation state (GPS-style mock)
_route_active = False
_route_destination = ""
_route_settings = {}
_current_lat = 40.7128  # Starting at NYC coordinates
_current_lng = -74.0060
_target_lat = 0.0
_target_lng = 0.0
_route_progress = 0.0
_route_start_time = 0.0
_simulated_speed = 0.0  # autonomous speed
_waypoints = []
_current_waypoint = 0

# NEW: grid-based navigation state (from server A* waypoints)
_grid_route_active = False
_grid_waypoints = []  # list of dicts: {'row', 'col', 'heading'}
_grid_current_index = 0
_grid_start_time = 0.0
_grid_speed_cells_per_sec = 0.5  # simulation speed across cells

# AI server configuration
AI_SERVER_URL = os.getenv("AI_SERVER_URL", "http://127.0.0.1:8010")


def _extract_intent_line(response_text: str | None) -> str | None:
    """Extract the final [[INTENT: ...]] line if present."""
    if not isinstance(response_text, str) or not response_text.strip():
        return None
    m = re.search(r"^\s*\[\[INTENT:\s*(.*?)\]\]\s*$", response_text, flags=re.IGNORECASE | re.MULTILINE)
    if not m:
        return None
    # Prefer the last match (should be the final line)
    matches = list(re.finditer(r"^\s*\[\[INTENT:\s*(.*?)\]\]\s*$", response_text, flags=re.IGNORECASE | re.MULTILINE))
    if matches:
        return matches[-1].group(1).strip() or None
    return m.group(1).strip() or None


def _parse_intent_kv(intent_body: str) -> tuple[str, dict]:
    """Parse 'name; k=v; k2="v2"' into (name, args)."""
    body = (intent_body or "").strip()
    if not body:
        return "", {}
    parts = [p.strip() for p in body.split(";") if p.strip()]
    name = parts[0].lower() if parts else ""
    args: dict = {}
    for part in parts[1:]:
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k = k.strip().lower()
        v = v.strip()
        if (len(v) >= 2) and ((v[0] == '"' and v[-1] == '"') or (v[0] == "'" and v[-1] == "'")):
            v = v[1:-1]
        args[k] = v
    return name, args


def _intent_to_timed_drive(direction: str, duration_s: float) -> dict | None:
    d = (direction or "").strip().lower()
    if d == "forward":
        return {"speed": 0.5, "angle": 0.0, "duration_s": duration_s, "mode": "lane_follow_placeholder"}
    if d == "backward":
        return {"speed": -0.4, "angle": 0.0, "duration_s": duration_s, "mode": "lane_follow_placeholder"}
    if d == "left":
        return {"speed": 0.3, "angle": -0.6, "duration_s": duration_s, "mode": "lane_follow_placeholder"}
    if d == "right":
        return {"speed": 0.3, "angle": 0.6, "duration_s": duration_s, "mode": "lane_follow_placeholder"}
    return None


def _has_wake_word(text: str, wake_word: str = "autocar") -> bool:
    if not text:
        return False
    return wake_word.lower() in text.lower()


def _strip_wake_word(text: str, wake_word: str = "autocar") -> str:
    """Remove common prefixes + wake word for cleaner parsing."""
    if not text:
        return ""
    # e.g. "hey autocar, go forward" -> "go forward"
    pattern = rf"(hey|hi|okay|ok)?\s*{re.escape(wake_word)}\W*"
    return re.sub(pattern, "", text, flags=re.IGNORECASE).strip()


def _parse_duration_seconds(text: str, default_s: float = 5.0, max_s: float = 10.0) -> float:
    """Parse simple durations like 'for 3 seconds' / 'for 2 sec'."""
    if not text:
        return default_s
    m = re.search(r"\bfor\s+(\d+(?:\.\d+)?)\s*(seconds|second|secs|sec|s)\b", text, flags=re.IGNORECASE)
    if not m:
        return default_s
    try:
        val = float(m.group(1))
    except Exception:
        return default_s
    val = max(0.5, min(val, max_s))
    return val


def _extract_music_query(transcript: str | None, response_text: str | None) -> str | None:
    # 1) LLM function-call style: [[PLAY: ...]]
    if isinstance(response_text, str):
        m = re.search(r"\[\[PLAY:\s*(.*?)\]\]", response_text, flags=re.IGNORECASE)
        if m:
            q = m.group(1).strip()
            return q or None

    # 2) Direct transcript forms
    if isinstance(transcript, str):
        t = transcript.strip()
        low = t.lower()
        if low.startswith("play "):
            return t[5:].strip() or None
        if low.startswith("spotify "):
            return t[8:].strip() or None
    return None


def parse_ai_intent(ai_payload: dict) -> dict:
    """Parse a safe, discrete intent from an AI server payload.

    Expected keys (best-effort):
      - transcript / input / text
      - response
    """
    transcript = ai_payload.get("transcript")
    # ai_server.py currently returns this key for /process/audio
    if not isinstance(transcript, str) or not transcript.strip():
        transcript = ai_payload.get("transcription")
    if not isinstance(transcript, str) or not transcript.strip():
        transcript = ai_payload.get("input")
    if not isinstance(transcript, str) or not transcript.strip():
        transcript = ai_payload.get("text")
    if not isinstance(transcript, str):
        transcript = ""

    response_text = ai_payload.get("response")
    if not isinstance(response_text, str):
        response_text = ""

    # 0) Prefer strict [[INTENT: ...]] line emitted by the LLM
    intent_line = _extract_intent_line(response_text)
    if intent_line:
        intent_name, intent_args = _parse_intent_kv(intent_line)

        if intent_name in {"none", ""}:
            return {
                "ok": False,
                "reason": "intent_none",
                "transcript": transcript,
                "clean_command": "",
                "intent": None,
                "args": {},
                "response": response_text,
            }

        if intent_name == "play_music":
            q = intent_args.get("query")
            if not isinstance(q, str) or not q.strip():
                q = _extract_music_query(transcript, response_text)
            if isinstance(q, str) and q.strip():
                return {
                    "ok": True,
                    "reason": "intent_line_play_music",
                    "transcript": transcript,
                    "clean_command": transcript,
                    "intent": "play_music",
                    "args": {"query": q.strip()},
                    "response": response_text,
                }
            return {
                "ok": False,
                "reason": "intent_line_missing_query",
                "transcript": transcript,
                "clean_command": transcript,
                "intent": None,
                "args": {},
                "response": response_text,
            }

        if intent_name == "timed_drive":
            direction = intent_args.get("direction", "")
            try:
                duration_s = float(intent_args.get("duration_s", "5"))
            except Exception:
                duration_s = 5.0
            duration_s = max(0.5, min(duration_s, 10.0))
            td = _intent_to_timed_drive(direction, duration_s)
            if td:
                return {
                    "ok": True,
                    "reason": "intent_line_timed_drive",
                    "transcript": transcript,
                    "clean_command": transcript,
                    "intent": "timed_drive",
                    "args": td,
                    "response": response_text,
                }
            return {
                "ok": False,
                "reason": "intent_line_bad_direction",
                "transcript": transcript,
                "clean_command": transcript,
                "intent": None,
                "args": {"direction": direction, "duration_s": duration_s},
                "response": response_text,
            }

        if intent_name == "stop":
            return {
                "ok": True,
                "reason": "intent_line_stop",
                "transcript": transcript,
                "clean_command": transcript,
                "intent": "stop",
                "args": {},
                "response": response_text,
            }

        if intent_name == "emergency_stop":
            return {
                "ok": True,
                "reason": "intent_line_emergency_stop",
                "transcript": transcript,
                "clean_command": transcript,
                "intent": "emergency_stop",
                "args": {},
                "response": response_text,
            }

        if intent_name == "auto_route_start":
            dest = intent_args.get("destination")
            route_type = (intent_args.get("route_type") or "fastest").strip().lower()
            try:
                max_speed = float(intent_args.get("max_speed", 35))
            except Exception:
                max_speed = 35.0

            if not isinstance(dest, str) or not dest.strip():
                return {
                    "ok": False,
                    "reason": "intent_line_missing_destination",
                    "transcript": transcript,
                    "clean_command": transcript,
                    "intent": None,
                    "args": {},
                    "response": response_text,
                }

            return {
                "ok": True,
                "reason": "intent_line_auto_route_start",
                "transcript": transcript,
                "clean_command": transcript,
                "intent": "auto_route_start",
                "args": {
                    "destination": dest.strip(),
                    "route_type": route_type or "fastest",
                    "max_speed": max_speed,
                },
                "response": response_text,
            }

        if intent_name == "auto_route_stop":
            reason = intent_args.get("reason")
            if not isinstance(reason, str) or not reason.strip():
                reason = "user_request"
            return {
                "ok": True,
                "reason": "intent_line_auto_route_stop",
                "transcript": transcript,
                "clean_command": transcript,
                "intent": "auto_route_stop",
                "args": {"reason": reason},
                "response": response_text,
            }

        return {
            "ok": False,
            "reason": f"intent_line_unrecognized:{intent_name}",
            "transcript": transcript,
            "clean_command": transcript,
            "intent": None,
            "args": intent_args,
            "response": response_text,
        }

    # Wake-word gate (legacy heuristic). Accept either wake word.
    if transcript and not (_has_wake_word(transcript, "autocar") or _has_wake_word(transcript, "autodrive")):
        return {
            "ok": False,
            "reason": "missing_wake_word",
            "transcript": transcript,
            "clean_command": "",
            "intent": None,
            "args": {},
            "response": response_text,
        }

    clean = _strip_wake_word(transcript, "autocar")
    if clean == transcript:
        clean = _strip_wake_word(transcript, "autodrive")
    if not clean:
        return {
            "ok": False,
            "reason": "empty_command",
            "transcript": transcript,
            "clean_command": clean,
            "intent": None,
            "args": {},
            "response": response_text,
        }

    low = clean.lower()

    # Music intent
    music_query = _extract_music_query(clean, response_text)
    if music_query:
        return {
            "ok": True,
            "reason": "play_music",
            "transcript": transcript,
            "clean_command": clean,
            "intent": "play_music",
            "args": {"query": music_query},
            "response": response_text,
        }

    # Timed motion placeholders (bounded). This will later be replaced with lane-follower.
    duration_s = _parse_duration_seconds(clean, default_s=5.0, max_s=10.0)
    if any(p in low for p in ["go forward", "forward", "go ahead", "move forward"]):
        return {
            "ok": True,
            "reason": "timed_forward",
            "transcript": transcript,
            "clean_command": clean,
            "intent": "timed_drive",
            "args": {"speed": 0.5, "angle": 0.0, "duration_s": duration_s, "mode": "lane_follow_placeholder"},
            "response": response_text,
        }
    if any(p in low for p in ["go backward", "backward", "reverse", "move back"]):
        return {
            "ok": True,
            "reason": "timed_backward",
            "transcript": transcript,
            "clean_command": clean,
            "intent": "timed_drive",
            "args": {"speed": -0.4, "angle": 0.0, "duration_s": duration_s, "mode": "lane_follow_placeholder"},
            "response": response_text,
        }
    if any(p in low for p in ["turn left", "go left", "left"]):
        return {
            "ok": True,
            "reason": "timed_left",
            "transcript": transcript,
            "clean_command": clean,
            "intent": "timed_drive",
            "args": {"speed": 0.3, "angle": -0.6, "duration_s": duration_s, "mode": "lane_follow_placeholder"},
            "response": response_text,
        }
    if any(p in low for p in ["turn right", "go right", "right"]):
        return {
            "ok": True,
            "reason": "timed_right",
            "transcript": transcript,
            "clean_command": clean,
            "intent": "timed_drive",
            "args": {"speed": 0.3, "angle": 0.6, "duration_s": duration_s, "mode": "lane_follow_placeholder"},
            "response": response_text,
        }

    # Stop (non-emergency) – stop manual motion or route
    if low in {"stop", "halt", "cancel"} or "stop" in low:
        return {
            "ok": True,
            "reason": "stop",
            "transcript": transcript,
            "clean_command": clean,
            "intent": "stop",
            "args": {},
            "response": response_text,
        }

    return {
        "ok": False,
        "reason": "unrecognized_intent",
        "transcript": transcript,
        "clean_command": clean,
        "intent": None,
        "args": {},
        "response": response_text,
    }


def generate_mock_route(destination: str):
    """Generate mock GPS waypoints for a destination"""
    global _waypoints, _target_lat, _target_lng
    
    # Mock destinations with coordinates
    destinations = {
        "home": (40.7500, -73.9850),
        "work": (40.7589, -73.9851),
        "mall": (40.7614, -73.9776),
        "airport": (40.6413, -73.7781),
        "downtown": (40.7831, -73.9712)
    }
    
    # Try to match destination to known locations, otherwise use random nearby coordinates
    dest_lower = destination.lower()
    for key, coords in destinations.items():
        if key in dest_lower:
            _target_lat, _target_lng = coords
            break
    else:
        # Random destination within 5 miles
        _target_lat = _current_lat + random.uniform(-0.05, 0.05)
        _target_lng = _current_lng + random.uniform(-0.05, 0.05)
    
    # Generate waypoints between current and target
    num_waypoints = random.randint(3, 8)
    _waypoints = []
    
    for i in range(num_waypoints + 1):
        progress = i / num_waypoints
        lat = _current_lat + (_target_lat - _current_lat) * progress
        lng = _current_lng + (_target_lng - _current_lng) * progress
        
        # Add some randomness to make it look like real turns
        if 0 < i < num_waypoints:
            lat += random.uniform(-0.002, 0.002)
            lng += random.uniform(-0.002, 0.002)
        
        _waypoints.append((lat, lng))
    
    print(f"[ROUTE] Generated {len(_waypoints)} waypoints to {destination}")
    return _waypoints


def calculate_distance(lat1, lng1, lat2, lng2):
    """Calculate distance between two coordinates in miles"""
    # Simplified distance calculation
    lat_diff = lat2 - lat1
    lng_diff = lng2 - lng1
    return math.sqrt(lat_diff**2 + lng_diff**2) * 69  # Rough miles conversion


def get_navigation_instruction(current_waypoint_idx):
    """Generate turn-by-turn instructions"""
    if current_waypoint_idx >= len(_waypoints) - 1:
        return "Arrive at destination"
    
    instructions = [
        "Continue straight",
        "Turn right on Oak Street", 
        "Turn left on Main Street",
        "Take the ramp to Highway 95",
        "Exit at Downtown",
        "Turn right on Broadway",
        "Turn left on 5th Avenue"
    ]
    
    return random.choice(instructions)


async def simulate_autonomous_navigation():
    """Simulate autonomous driving along the GPS-style route"""
    global _current_lat, _current_lng, _route_progress, _simulated_speed, _current_waypoint
    
    if not _route_active or not _waypoints:
        return None
    
    # Move towards current waypoint
    if _current_waypoint < len(_waypoints):
        target_lat, target_lng = _waypoints[_current_waypoint]
        
        # Calculate movement step (simulate driving speed)
        speed_factor = 0.0001  # Adjust for realistic movement
        lat_step = (target_lat - _current_lat) * speed_factor
        lng_step = (target_lng - _current_lng) * speed_factor
        
        _current_lat += lat_step
        _current_lng += lng_step
        
        # Check if we've reached the current waypoint
        distance_to_waypoint = calculate_distance(_current_lat, _current_lng, target_lat, target_lng)
        if distance_to_waypoint < 0.1:  # Within 0.1 miles
            _current_waypoint += 1
            print(f"[NAV] Reached waypoint {_current_waypoint}/{len(_waypoints)}")
        
        # Calculate overall progress
        _route_progress = _current_waypoint / max(1, len(_waypoints) - 1)
        
        # Simulate speed based on route type
        if _route_settings.get("route_type") == "eco":
            _simulated_speed = random.uniform(20, 30)
        elif _route_settings.get("route_type") == "safe":
            _simulated_speed = random.uniform(15, 25)
        else:  # fastest
            _simulated_speed = random.uniform(25, 35)
        
        # Add some randomness
        _simulated_speed += random.uniform(-2, 2)
        _simulated_speed = max(0, min(_simulated_speed, _route_settings.get("max_speed", 35)))
        
        return {
            "status": "navigating" if _current_waypoint < len(_waypoints) else "arrived",
            "destination": _route_destination,
            "current_lat": round(_current_lat, 6),
            "current_lng": round(_current_lng, 6),
            "distance_remaining": calculate_distance(_current_lat, _current_lng, _target_lat, _target_lng),
            "eta_minutes": max(1, int(calculate_distance(_current_lat, _current_lng, _target_lat, _target_lng) / (_simulated_speed / 60))),
            "next_instruction": get_navigation_instruction(_current_waypoint),
            "route_progress": min(1.0, _route_progress),
            "current_speed": int(_simulated_speed),
            "speed_limit": _route_settings.get("max_speed", 35)
        }
    
    return None


async def simulate_grid_navigation():
    """Simulate following grid-based waypoints from server A* planner."""
    global _grid_route_active, _grid_current_index, _simulated_speed

    if not _grid_route_active or not _grid_waypoints:
        return None

    total = len(_grid_waypoints)

    # "Move" from one cell to the next based on time
    elapsed = time.time() - _grid_start_time
    target_index = int(elapsed * _grid_speed_cells_per_sec)

    if target_index >= total:
        target_index = total - 1

    if target_index != _grid_current_index:
        print(f"[NAV] Reached waypoint {target_index + 1}/{total}")
        _grid_current_index = target_index

    # Compute progress and fake speed
    progress = _grid_current_index / max(1, total - 1)
    _route_progress = progress  # reuse the same variable

    # Simulate a speed (arbitrary units)
    _simulated_speed = 20 + 10 * progress

    current_wp = _grid_waypoints[_grid_current_index]
    status = "navigating" if _grid_current_index < total - 1 else "arrived"

    return {
        "status": status,
        "destination": f"grid:{current_wp.get('row')},{current_wp.get('col')}",
        "current_lat": round(_current_lat, 6),
        "current_lng": round(_current_lng, 6),
        "distance_remaining": max(0, (total - 1 - _grid_current_index)),  # cells remaining
        "eta_minutes": max(0, int((total - 1 - _grid_current_index) / max(0.1, _grid_speed_cells_per_sec * 60))),
        "next_instruction": f"Head {current_wp.get('heading', 'E')} to cell ({current_wp.get('row')},{current_wp.get('col')})",
        "route_progress": progress,
        "current_speed": int(_simulated_speed),
        "speed_limit": _route_settings.get("max_speed", 35) if _route_settings else 35,
    }


def start_autonomous_route(destination: str, settings: dict):
    """Start autonomous navigation to destination (GPS-style mock route)"""
    global _route_active, _route_destination, _route_settings, _route_start_time, _current_waypoint, _route_progress
    
    _route_active = True
    _route_destination = destination
    _route_settings = settings
    _route_start_time = time.time()
    _current_waypoint = 0
    _route_progress = 0.0
    
    generate_mock_route(destination)
    
    print(f"[ROUTE] Started autonomous navigation to: {destination}")
    print(f"[ROUTE] Settings: {settings}")


def stop_autonomous_route(reason: str = "user_request"):
    """Stop autonomous navigation"""
    global _route_active, _simulated_speed
    
    _route_active = False
    _simulated_speed = 0.0
    
    print(f"[ROUTE] Stopped autonomous navigation - reason: {reason}")


def apply_manual_control(speed: float, angle: float):
    """Simulate applying manual control values from joystick"""
    global _current_speed, _current_angle
    
    # Block manual control if in emergency mode or autonomous mode is active
    if _emergency_active:
        print("[BLOCKED] Manual control blocked - emergency stop active")
        return False
    
    if _route_active or _grid_route_active:
        print("[BLOCKED] Manual control blocked - autonomous mode active")
        return False
    
    # clamp speed/angle to -1..1
    s = max(-1.0, min(1.0, float(speed)))
    a = max(-1.0, min(1.0, float(angle)))
    _current_speed = s
    _current_angle = a
    
    # Convert to motor-specific values for simulation
    motor_pwm = int(abs(s) * 255)
    motor_direction = "FORWARD" if s >= 0 else "REVERSE"
    servo_center = 1500
    servo_range = 500
    servo_position = servo_center + int(a * servo_range)
    
    base_speed = s
    turn_factor = a * 0.5
    left_motor = base_speed + turn_factor
    right_motor = base_speed - turn_factor
    left_pwm = int(abs(max(-1.0, min(1.0, left_motor))) * 255)
    right_pwm = int(abs(max(-1.0, min(1.0, right_motor))) * 255)
    
    speed_pct = int(s * 100)
    angle_deg = int(a * 45)
    print(f"[CONTROL] Manual control -> speed={s:.2f} ({speed_pct}%), angle={a:.2f} ({angle_deg}°)")
    print(f"[MOTORS] PWM={motor_pwm} {motor_direction}, Servo={servo_position}μs, Differential L={left_pwm} R={right_pwm}")
    return True


def emergency_stop():
    """Immediate emergency stop - highest priority"""
    global _current_speed, _current_angle, _emergency_active, _last_emergency_time, _route_active, _simulated_speed, _grid_route_active
    
    _emergency_active = True
    _last_emergency_time = time.time()
    _current_speed = 0.0
    _current_angle = 0.0
    
    # Stop autonomous navigation
    if _route_active:
        stop_autonomous_route("emergency_stop")
    _grid_route_active = False
    _simulated_speed = 0.0
    
    print("=" * 60)
    print("🚨 EMERGENCY STOP ACTIVATED 🚨")
    print(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("ALL MOTORS DISABLED IMMEDIATELY")
    print("Manual controls BLOCKED until emergency cleared")
    print("Autonomous navigation STOPPED")
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
        handshake = {
            "role": "pi",
            "device_id": device_id,
            "action": "handshake",
            "payload": {"info": "pi-sim"},
        }
        await ws.send(json.dumps(handshake))

        # Siri-style: record audio to buffer, send on close
        import sounddevice as sd
        import numpy as np
        import tempfile
        samplerate = 16000
        audio_buffer = []
        recording_stream = None

        voice_drive_task = None

        def audio_callback(indata, frames, time_info, status):
            audio_buffer.append(indata.copy())

        async def start_recording():
            nonlocal recording_stream, audio_buffer
            print("[MIC] Microphone recording started (Siri-style)")
            audio_buffer = []
            recording_stream = sd.InputStream(samplerate=samplerate, channels=1, dtype='int16', callback=audio_callback)
            recording_stream.start()

        async def stop_and_send_recording():
            nonlocal recording_stream, audio_buffer
            nonlocal voice_drive_task
            print("[MIC] Microphone recording stopped, sending to AI server")
            if recording_stream:
                recording_stream.stop()
                recording_stream.close()
                recording_stream = None
            if not audio_buffer:
                print("[MIC] No audio recorded.")
                return
            # Concatenate all chunks
            audio_data = np.concatenate(audio_buffer, axis=0)
            # Save to temp WAV file
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmpfile:
                import scipy.io.wavfile
                scipy.io.wavfile.write(tmpfile.name, samplerate, audio_data)
                tmpfile.flush()
                # Send to AI server
                try:
                    url = f"{AI_SERVER_URL.rstrip('/')}/process/audio"
                    with open(tmpfile.name, "rb") as f:
                        files = {"file": ("audio.wav", f, "audio/wav")}
                        resp = requests.post(url, files=files, timeout=15)
                    if resp.ok:
                        data = resp.json()

                        # Post-process AI output (wake-word + intent parsing)
                        try:
                            intent_obj = parse_ai_intent(data if isinstance(data, dict) else {})
                            print(f"[AI][POST] intent={intent_obj.get('intent')} ok={intent_obj.get('ok')} reason={intent_obj.get('reason')} cmd=\"{intent_obj.get('clean_command','')}\"")
                            intent_telemetry = {
                                "role": "pi",
                                "device_id": device_id,
                                "action": "telemetry",
                                "type": "voice_intent",
                                "payload": intent_obj,
                                "ts": time.time(),
                            }
                            await ws.send(json.dumps(intent_telemetry))

                            # Execute safe discrete actions locally (sim placeholders)
                            if intent_obj.get("ok") and intent_obj.get("intent") == "play_music" and spotify:
                                q = (intent_obj.get("args") or {}).get("query")
                                if isinstance(q, str) and q.strip():
                                    try:
                                        print(f"[CLIENT][SPOTIFY] Triggering playback for query: {q}")
                                        play_result = spotify.play_music(q)
                                        music_msg = {
                                            "role": "pi",
                                            "device_id": device_id,
                                            "action": "telemetry",
                                            "type": "music_play",
                                            "payload": {"query": q, "status": play_result, "source": "voice"},
                                            "ts": time.time(),
                                        }
                                        await ws.send(json.dumps(music_msg))
                                    except Exception as e:
                                        err_msg = {
                                            "role": "pi",
                                            "device_id": device_id,
                                            "action": "telemetry",
                                            "type": "music_play",
                                            "payload": {"query": q, "error": str(e), "source": "voice"},
                                            "ts": time.time(),
                                        }
                                        await ws.send(json.dumps(err_msg))

                            if intent_obj.get("ok") and intent_obj.get("intent") == "stop":
                                # Non-emergency stop: cancel timed drive and stop routes
                                if voice_drive_task and not voice_drive_task.done():
                                    voice_drive_task.cancel()
                                stop_autonomous_route("voice_stop")
                                _grid_route_active = False
                                apply_manual_control(0.0, 0.0)
                                stop_msg = {
                                    "role": "pi",
                                    "device_id": device_id,
                                    "action": "telemetry",
                                    "type": "voice_drive_status",
                                    "payload": {"status": "stopped", "reason": "voice_stop"},
                                    "ts": time.time(),
                                }
                                await ws.send(json.dumps(stop_msg))

                            if intent_obj.get("ok") and intent_obj.get("intent") == "auto_route_start":
                                args = intent_obj.get("args") or {}
                                destination = args.get("destination", "Unknown")
                                settings = {
                                    "route_type": args.get("route_type", "fastest"),
                                    "max_speed": args.get("max_speed", 35),
                                    "following_distance": "safe",
                                }
                                if not _emergency_active:
                                    start_autonomous_route(str(destination), settings)
                                    ack = {
                                        "role": "pi",
                                        "device_id": device_id,
                                        "action": "telemetry",
                                        "type": "route_ack",
                                        "payload": {"status": "route_started", "destination": destination, "source": "voice"},
                                        "ts": time.time(),
                                    }
                                else:
                                    ack = {
                                        "role": "pi",
                                        "device_id": device_id,
                                        "action": "telemetry",
                                        "type": "route_ack",
                                        "payload": {"status": "blocked_emergency", "destination": destination, "source": "voice"},
                                        "ts": time.time(),
                                    }
                                await ws.send(json.dumps(ack))

                            if intent_obj.get("ok") and intent_obj.get("intent") == "auto_route_stop":
                                args = intent_obj.get("args") or {}
                                reason = args.get("reason", "user_request")
                                stop_autonomous_route(str(reason))
                                _grid_route_active = False

                                ack = {
                                    "role": "pi",
                                    "device_id": device_id,
                                    "action": "telemetry",
                                    "type": "route_ack",
                                    "payload": {"status": "route_stopped", "reason": reason, "source": "voice"},
                                    "ts": time.time(),
                                }
                                await ws.send(json.dumps(ack))

                            if intent_obj.get("ok") and intent_obj.get("intent") == "emergency_stop":
                                emergency_stop()
                                await ws.send(json.dumps({
                                    "role": "pi",
                                    "device_id": device_id,
                                    "action": "telemetry",
                                    "type": "emergency_ack",
                                    "payload": {
                                        "status": "stopped",
                                        "motors_disabled": True,
                                        "emergency_timestamp": _last_emergency_time,
                                        "device_id": device_id,
                                        "route_stopped": True,
                                        "reason": "voice_emergency_stop",
                                    },
                                    "ts": time.time(),
                                }))

                            if intent_obj.get("ok") and intent_obj.get("intent") == "timed_drive":
                                args = intent_obj.get("args") or {}
                                speed = float(args.get("speed", 0.0))
                                angle = float(args.get("angle", 0.0))
                                duration_s = float(args.get("duration_s", 5.0))

                                async def _timed_drive():
                                    # For now this is a placeholder until LaneFollower is bridged in.
                                    if _emergency_active:
                                        await ws.send(json.dumps({
                                            "role": "pi",
                                            "device_id": device_id,
                                            "action": "telemetry",
                                            "type": "voice_drive_status",
                                            "payload": {"status": "blocked", "reason": "emergency_active"},
                                            "ts": time.time(),
                                        }))
                                        return
                                    if _route_active or _grid_route_active:
                                        await ws.send(json.dumps({
                                            "role": "pi",
                                            "device_id": device_id,
                                            "action": "telemetry",
                                            "type": "voice_drive_status",
                                            "payload": {"status": "blocked", "reason": "autonomous_active"},
                                            "ts": time.time(),
                                        }))
                                        return

                                    started = apply_manual_control(speed, angle)
                                    await ws.send(json.dumps({
                                        "role": "pi",
                                        "device_id": device_id,
                                        "action": "telemetry",
                                        "type": "voice_drive_status",
                                        "payload": {"status": "started" if started else "blocked", "duration_s": duration_s, "speed": speed, "angle": angle, "mode": args.get("mode")},
                                        "ts": time.time(),
                                    }))
                                    if not started:
                                        return
                                    try:
                                        await asyncio.sleep(max(0.1, min(duration_s, 10.0)))
                                    finally:
                                        apply_manual_control(0.0, 0.0)
                                        await ws.send(json.dumps({
                                            "role": "pi",
                                            "device_id": device_id,
                                            "action": "telemetry",
                                            "type": "voice_drive_status",
                                            "payload": {"status": "stopped", "reason": "timeout"},
                                            "ts": time.time(),
                                        }))

                                if voice_drive_task and not voice_drive_task.done():
                                    voice_drive_task.cancel()
                                voice_drive_task = asyncio.create_task(_timed_drive())
                        except Exception as e:
                            print(f"[AI][POST][ERROR] {e}")

                        msg = {
                            "role": "pi",
                            "device_id": device_id,
                            "action": "telemetry",
                            "type": "mic_transcript",
                            "payload": data,
                            "ts": time.time(),
                        }
                        await ws.send(json.dumps(msg))
                        print(f"[MIC] Transcription sent: {data}")
                    else:
                        print(f"[MIC][ERROR] AI server response: {resp.status_code} {resp.text}")
                except Exception as e:
                    print(f"[MIC][ERROR] {e}")
                finally:
                    os.remove(tmpfile.name)


        async def receiver():
            # DECLARE ALL GLOBALS USED/MODIFIED IN THIS FUNCTION HERE
            global _grid_route_active, _grid_waypoints, _grid_current_index, _grid_start_time
            global _current_speed, _current_angle, _emergency_active, _last_emergency_time
            global _route_active, _simulated_speed
            global AI_SERVER_URL

            try:
                async for message in ws:
                    try:
                        pkt = json.loads(message)
                    except Exception:
                        print("RECV (text):", message)
                        continue

                    act = pkt.get("action")
                    ptype = pkt.get("type")
                    payload = pkt.get("payload", {})

                    if isinstance(payload, dict):
                        ai_override = payload.get("ai_server_url")
                        if ai_override:
                            AI_SERVER_URL = ai_override
                    src = pkt.get("from") or pkt.get("device_id")
                    # Microphone open/close control
                    if act == "control" and ptype == "microphone_open":
                        print(f"[LOG] Received microphone_open event from {src} (payload: {payload})")
                        await start_recording()
                        continue
                    elif act == "control" and ptype == "microphone_close":
                        print(f"[LOG] Received microphone_close event from {src} (payload: {payload})")
                        await stop_and_send_recording()
                        continue

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
                                "device_id": device_id,
                                "route_stopped": True
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
                                "route_active": _route_active or _grid_route_active,
                                "blocked": not success
                            }, 
                            "ts": time.time()
                        }
                        await ws.send(json.dumps(ack))
                    
                    elif act == "control" and ptype == "quick_command":
                        # Receive quick command text, forward to AI server /process/text, and emit telemetry with result
                        qc_text = payload.get("text", "")
                        print(f"[CLIENT] quick_command received from {src}: \"{qc_text}\"")

                        # Acknowledge receipt immediately
                        ack = {
                            "role": "pi",
                            "device_id": device_id,
                            "action": "telemetry",
                            "type": "quick_command_ack",
                            "payload": {"received_text": qc_text},
                            "ts": time.time(),
                        }
                        await ws.send(json.dumps(ack))

                        # Call AI server for processing
                        result_payload = {"input": qc_text, "response": None, "error": None}
                        intent_obj = None
                        try:
                            url = f"{AI_SERVER_URL.rstrip('/')}/process/text"
                            r = requests.post(url, json={"text": qc_text}, timeout=10)
                            r.raise_for_status()
                            data = r.json()
                            result_payload["response"] = data.get("response")
                            # Mirror input from server if provided
                            if data.get("input"):
                                result_payload["input"] = data["input"]
                            print(f"[CLIENT] AI response: {result_payload['response']}")

                            # Post-process AI output (wake-word + intent parsing)
                            if isinstance(data, dict):
                                try:
                                    intent_obj = parse_ai_intent(data)
                                    print(f"[AI][POST] intent={intent_obj.get('intent')} ok={intent_obj.get('ok')} reason={intent_obj.get('reason')} cmd=\"{intent_obj.get('clean_command','')}\"")
                                    intent_telemetry = {
                                        "role": "pi",
                                        "device_id": device_id,
                                        "action": "telemetry",
                                        "type": "voice_intent",
                                        "payload": intent_obj,
                                        "ts": time.time(),
                                    }
                                    await ws.send(json.dumps(intent_telemetry))
                                except Exception as e:
                                    print(f"[AI][POST][ERROR] {e}")
                        except Exception as e:
                            result_payload["error"] = str(e)
                            print(f"[CLIENT][ERROR] AI server call failed: {e}")

                        # Send command result telemetry back to backend/frontend
                        result_msg = {
                            "role": "pi",
                            "device_id": device_id,
                            "action": "telemetry",
                            "type": "command_result",
                            "payload": result_payload,
                            "ts": time.time(),
                        }
                        await ws.send(json.dumps(result_msg))

                        # Optional: trigger Spotify only via parsed intent (keeps one command format)
                        if (
                            isinstance(intent_obj, dict)
                            and intent_obj.get("ok")
                            and intent_obj.get("intent") == "play_music"
                            and spotify
                        ):
                            q = (intent_obj.get("args") or {}).get("query")
                            if isinstance(q, str) and q.strip():
                                try:
                                    print(f"[CLIENT][SPOTIFY] Triggering playback for query: {q}")
                                    play_result = spotify.play_music(q)
                                    music_msg = {
                                        "role": "pi",
                                        "device_id": device_id,
                                        "action": "telemetry",
                                        "type": "music_play",
                                        "payload": {"query": q, "status": play_result, "source": "quick_command"},
                                        "ts": time.time(),
                                    }
                                    await ws.send(json.dumps(music_msg))
                                except Exception as e:
                                    print(f"[CLIENT][SPOTIFY][ERROR] {e}")
                                    err_msg = {
                                        "role": "pi",
                                        "device_id": device_id,
                                        "action": "telemetry",
                                        "type": "music_play",
                                        "payload": {"query": q, "error": str(e), "source": "quick_command"},
                                        "ts": time.time(),
                                    }
                                    await ws.send(json.dumps(err_msg))

                        # Optional: trigger navigation locally via parsed intent
                        if isinstance(intent_obj, dict) and intent_obj.get("ok") and intent_obj.get("intent") == "auto_route_start":
                            args = intent_obj.get("args") or {}
                            destination = args.get("destination", "Unknown")
                            settings = {
                                "route_type": args.get("route_type", "fastest"),
                                "max_speed": args.get("max_speed", 35),
                                "following_distance": "safe",
                            }
                            if not _emergency_active:
                                start_autonomous_route(str(destination), settings)
                                ack = {
                                    "role": "pi",
                                    "device_id": device_id,
                                    "action": "telemetry",
                                    "type": "route_ack",
                                    "payload": {"status": "route_started", "destination": destination, "source": "quick_command"},
                                    "ts": time.time(),
                                }
                            else:
                                ack = {
                                    "role": "pi",
                                    "device_id": device_id,
                                    "action": "telemetry",
                                    "type": "route_ack",
                                    "payload": {"status": "blocked_emergency", "destination": destination, "source": "quick_command"},
                                    "ts": time.time(),
                                }
                            await ws.send(json.dumps(ack))

                        if isinstance(intent_obj, dict) and intent_obj.get("ok") and intent_obj.get("intent") == "auto_route_stop":
                            args = intent_obj.get("args") or {}
                            reason = args.get("reason", "user_request")
                            stop_autonomous_route(str(reason))
                            _grid_route_active = False

                            ack = {
                                "role": "pi",
                                "device_id": device_id,
                                "action": "telemetry",
                                "type": "route_ack",
                                "payload": {"status": "route_stopped", "reason": reason, "source": "quick_command"},
                                "ts": time.time(),
                            }
                            await ws.send(json.dumps(ack))
                    
                    elif act == "control" and ptype == "auto_route_start":
                        destination = payload.get("destination", "Unknown")
                        settings = {
                            "route_type": payload.get("route_type", "fastest"),
                            "max_speed": payload.get("max_speed", 35),
                            "following_distance": payload.get("following_distance", "safe")
                        }
                        
                        if not _emergency_active:
                            start_autonomous_route(destination, settings)
                            ack = {
                                "role": "pi",
                                "device_id": device_id,
                                "action": "telemetry",
                                "type": "route_ack",
                                "payload": {"status": "route_started", "destination": destination},
                                "ts": time.time()
                            }
                        else:
                            ack = {
                                "role": "pi",
                                "device_id": device_id,
                                "action": "telemetry",
                                "type": "route_ack",
                                "payload": {"status": "blocked_emergency", "destination": destination},
                                "ts": time.time()
                            }
                        await ws.send(json.dumps(ack))
                    
                    elif act == "control" and ptype == "auto_route_stop":
                        reason = payload.get("reason", "user_request")
                        stop_autonomous_route(reason)
                        # also stop grid route, if any
                        _grid_route_active = False

                        ack = {
                            "role": "pi",
                            "device_id": device_id,
                            "action": "telemetry",
                            "type": "route_ack",
                            "payload": {"status": "route_stopped", "reason": reason},
                            "ts": time.time()
                        }
                        await ws.send(json.dumps(ack))
                        
                        # Also send updated route status to clear frontend display
                        route_status_update = {
                            "role": "pi",
                            "device_id": device_id,
                            "action": "telemetry",
                            "type": "route_status",
                            "payload": {
                                "status": "idle",
                                "destination": "",
                                "current_lat": _current_lat,
                                "current_lng": _current_lng,
                                "distance_remaining": 0,
                                "eta_minutes": 0,
                                "next_instruction": "",
                                "route_progress": 0,
                                "current_speed": 0,
                                "speed_limit": 35
                            },
                            "ts": time.time()
                        }
                        await ws.send(json.dumps(route_status_update))

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
                        
                    elif act == "control" and ptype == "execute_route":
                        # New: receive grid waypoints from server A* planner
                        wps = payload.get("waypoints") or []
                        goal_name = payload.get("goal_name", "Unknown")

                        # DEBUG LOG: raw waypoints from server
                        try:
                            print("[ROUTE][DEBUG] Raw waypoints payload from server:")
                            print(f"  type: {type(wps)}, len: {len(wps)}")
                            for i, wp in enumerate(wps):
                                print(f"    #{i}: {wp}")
                        except Exception as e:
                            print(f"[ROUTE][DEBUG] Error while printing waypoints: {e}")

                        if not wps:
                            print("[ROUTE] Received execute_route with empty waypoints")
                            _grid_route_active = False
                            _grid_waypoints = []
                        else:
                            _grid_route_active = True
                            _grid_waypoints = wps
                            _grid_current_index = 0
                            _grid_start_time = time.time()
                            print(f"[ROUTE] Grid route received: {len(_grid_waypoints)} waypoints to {goal_name}")
                            print(f"[ROUTE] First WP: {_grid_waypoints[0]}, Last WP: {_grid_waypoints[-1]}")

                        # ack back to server/frontend
                        ack = {
                            "role": "pi",
                            "device_id": device_id,
                            "action": "telemetry",
                            "type": "route_ack",
                            "payload": {
                                "status": "route_started" if _grid_route_active else "route_invalid",
                                "destination": goal_name,
                                "waypoint_count": len(_grid_waypoints)
                            },
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
            # <<< ADD THIS GLOBAL DECLARATION >>>
            global _grid_route_active, _route_active, _simulated_speed, _current_speed
            # ------------------------------------
            interval = 1.0 / max(0.01, fps)
            while True:
                start = time.time()

                # Send camera frame if available
                if cap:
                    ret, frame = cap.read()
                    if ret:
                        ok, enc = cv2.imencode(
                            ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80]
                        )
                        if ok:
                            b64 = base64.b64encode(enc.tobytes()).decode("ascii")
                            payload = {
                                "frame_b64": b64,
                                "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
                                "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
                                "encoding": "jpeg",
                            }
                            packet = {
                                "role": "pi",
                                "device_id": device_id,
                                "action": "telemetry",
                                "type": "camera_frame",
                                "payload": payload,
                                "ts": time.time(),
                            }
                            await ws.send(json.dumps(packet))

                # Send periodic status update (enhanced with route status)
                status_payload = {
                    "speed": _simulated_speed if (_route_active or _grid_route_active) else _current_speed,
                    "angle": _current_angle,
                    "battery": 85.2,
                    "temperature": 42.1,
                    "connected": True,
                    "emergency_active": _emergency_active,
                    "route_active": _route_active or _grid_route_active,
                    "last_emergency": _last_emergency_time if _emergency_active else None,
                }
                status_packet = {
                    "role": "pi",
                    "device_id": device_id,
                    "action": "telemetry",
                    "type": "status",
                    "payload": status_payload,
                    "ts": time.time(),
                }
                await ws.send(json.dumps(status_packet))

                # Send route status if GPS-style navigation is active
                if _route_active:
                    route_status = await simulate_autonomous_navigation()
                    if route_status:
                        route_packet = {
                            "role": "pi",
                            "device_id": device_id,
                            "action": "telemetry",
                            "type": "route_status",
                            "payload": route_status,
                            "ts": time.time(),
                        }
                        await ws.send(json.dumps(route_packet))

                        # Check if route completed
                        if route_status["status"] == "arrived":
                            stop_autonomous_route("destination_reached")

                # Send route status if grid-based navigation is active
                if _grid_route_active:
                    grid_status = await simulate_grid_navigation()
                    if grid_status:
                        grid_packet = {
                            "role": "pi",
                            "device_id": device_id,
                            "action": "telemetry",
                            "type": "route_status",
                            "payload": grid_status,
                            "ts": time.time(),
                        }
                        await ws.send(json.dumps(grid_packet))

                        if grid_status["status"] == "arrived":
                            print("[ROUTE] Grid route completed.")
                            _grid_route_active = False

                # sleep remaining time
                elapsed = time.time() - start
                await asyncio.sleep(max(0, interval - elapsed))
        except websockets.exceptions.ConnectionClosedOK as e:
            print(f"WebSocket closed cleanly: code={e.code} reason={e.reason}")
        except websockets.exceptions.ConnectionClosedError as e:
            print(f"WebSocket closed by server: code={e.code} reason={e.reason}")
        except KeyboardInterrupt:
            print("\nShutting down pi simulator...")
        finally:
            if cap:
                cap.release()
            recv_task.cancel()



# --- Device Discovery and Wait-for-Connect ---
import socket

UDP_BROADCAST_PORT = 50010
UDP_LISTEN_PORT = 50011
UDP_BROADCAST_ADDR = '<broadcast>'

def broadcast_presence(device_id, info=None, listen_port=None):
    """Broadcast device presence via UDP."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    payload = json.dumps({
        "device_id": device_id,
        "info": info or "pi-sim",
        "action": "announce",
        "listen_port": listen_port or UDP_LISTEN_PORT,
    }).encode()
    sock.sendto(payload, (UDP_BROADCAST_ADDR, UDP_BROADCAST_PORT))
    sock.close()

def wait_for_connect(device_id, listen_sock, timeout=60):
    """Wait for a UDP 'connect' command from the server."""
    listen_sock.settimeout(timeout)
    print(f"[{device_id}] Waiting for connect command from server on UDP port {listen_sock.getsockname()[1]}...")
    try:
        while True:
            data, addr = listen_sock.recvfrom(4096)
            try:
                msg = json.loads(data.decode())
            except Exception:
                continue
            if msg.get("action") == "connect" and msg.get("device_id") == device_id:
                print(f"[{device_id}] Received connect command from {addr}")
                return msg.get("ws_url", None)
    except socket.timeout:
        print(f"[{device_id}] Timeout waiting for connect command.")
        return None
    finally:
        listen_sock.close()

if __name__ == "__main__":
    # Usage: python client.py [device_id] [fps]
    device_id = sys.argv[1] if len(sys.argv) > 1 else "pi-01"
    fps = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0

    try:
        while True:
            # Prepare a dedicated UDP socket for this standby cycle
            listen_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            listen_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                listen_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except (AttributeError, OSError):
                pass
            listen_sock.bind(("", 0))  # pick an ephemeral port
            listen_port = listen_sock.getsockname()[1]

            # Step 1: Broadcast presence with the chosen port
            broadcast_presence(device_id, listen_port=listen_port)

            # Step 2: Wait for connect command
            ws_url = wait_for_connect(device_id, listen_sock)
            if not ws_url:
                print(f"[{device_id}] No connect command received. Retrying in 5 seconds...")
                time.sleep(5)
                continue

            # Step 3: Connect to server WebSocket
            asyncio.run(pi_client(ws_url, device_id=device_id, fps=fps))
            print(f"[{device_id}] WebSocket session ended. Returning to standby.")
    except KeyboardInterrupt:
        print("\nShutting down pi simulator...")
