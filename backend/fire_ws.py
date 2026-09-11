#!/usr/bin/env python3
"""
FireShield AI — fire_ws.py

FIXES vs previous version:
  1. CONFIDENCE_THRESHOLD lowered to 0.55 — was 0.85, too strict for real fire
  2. Removed hardcoded 0.85 inside loop — now uses CONFIDENCE_THRESHOLD variable
  3. is_valid_box color ratio lowered to 0.20 — was 0.40, rejected smoke-covered fire
  4. HSV range expanded — now catches red embers (155-180) + bright flame cores (lower S)
  5. Min box area lowered to 1500px — was 5000px, rejected distant/small fires
  6. Aspect ratio relaxed to 0.15 — was 0.30, too strict
  7. Color variance threshold lowered to 15 std — was 25, rejected uniform flame regions
  8. CONFIRM_FRAMES_REQUIRED = 2 — was 3, faster confirmation for real fires
"""
from ultralytics import YOLO
import cv2
import threading
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
import ssl
import json
import sys
import os
import argparse
import subprocess

# ─────────────────────────────────────────────────────────
#  Config
# ─────────────────────────────────────────────────────────
SMTP_SERVER     = os.getenv('SMTP_SERVER',     'smtp.gmail.com')
SMTP_PORT       = int(os.getenv('SMTP_PORT',   '465'))
SENDER_EMAIL    = os.getenv('SENDER_EMAIL',    '')
SENDER_PASSWORD = os.getenv('SENDER_PASSWORD', '')
RECEIVER_EMAIL  = os.getenv('RECEIVER_EMAIL',  '')

# FIX 1: Lowered from 0.85 → 0.55 — real fire detections score 0.55–0.80
# Override via env: CONFIDENCE_THRESHOLD=0.60 node server.js
CONFIDENCE_THRESHOLD = float(os.getenv('CONFIDENCE_THRESHOLD', '0.55'))

EMAIL_COOLDOWN          = 300
ALARM_FILE              = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'alarm.mp3')
DETECTIONS_DIR          = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'detections')

# FIX 8: Lowered from 3 → 2 — still rejects single-frame glints, confirms faster
CONFIRM_FRAMES_REQUIRED = 2
RELEASE_FRAMES_REQUIRED = 15

MAX_SCREENSHOTS_PER_EVENT = 3
SCREENSHOT_INTERVAL       = 5.0
FRAME_EMIT_INTERVAL       = 2.0


def emit(obj: dict):
    """Write JSON line to stdout — Node.js reads this."""
    print(json.dumps(obj), flush=True)


# ─────────────────────────────────────────────────────────
#  Alarm — cross-platform
# ─────────────────────────────────────────────────────────
alarm_playing = False
alarm_lock    = threading.Lock()
alarm_process = None

try:
    import pygame
    pygame.mixer.init()
    pygame_ok = True
except Exception:
    pygame_ok = False


def start_alarm():
    global alarm_playing, alarm_process
    with alarm_lock:
        if alarm_playing:
            return
        if not os.path.exists(ALARM_FILE):
            emit({"type": "warn", "message": f"Alarm file not found: {ALARM_FILE}"})
            return
        try:
            if pygame_ok:
                pygame.mixer.music.load(ALARM_FILE)
                pygame.mixer.music.play(-1)
            else:
                for player in [['aplay', '-q'], ['afplay']]:
                    try:
                        alarm_process = subprocess.Popen(
                            player + [ALARM_FILE],
                            stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL
                        )
                        break
                    except FileNotFoundError:
                        continue
            alarm_playing = True
            emit({"type": "alarm", "state": "on"})
        except Exception as e:
            emit({"type": "warn", "message": f"Alarm start failed: {e}"})


def stop_alarm():
    global alarm_playing, alarm_process
    with alarm_lock:
        if not alarm_playing:
            return
        try:
            if pygame_ok:
                pygame.mixer.music.stop()
            else:
                if alarm_process and alarm_process.poll() is None:
                    alarm_process.terminate()
                    alarm_process = None
            alarm_playing = False
            emit({"type": "alarm", "state": "off"})
        except Exception as e:
            emit({"type": "warn", "message": f"Alarm stop failed: {e}"})


# ─────────────────────────────────────────────────────────
#  Email Alert
# ─────────────────────────────────────────────────────────
def send_email_notification():
    if not SENDER_EMAIL or not SENDER_PASSWORD or not RECEIVER_EMAIL:
        emit({"type": "info", "message": "Email not configured — skipping"})
        return
    try:
        msg            = MIMEMultipart()
        msg['From']    = SENDER_EMAIL
        msg['To']      = RECEIVER_EMAIL
        msg['Subject'] = "FireShield Alert: Fire Detected"
        current_time   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        body = f"FIRE HAS BEEN DETECTED\n\nTime: {current_time}\n\nFireShield AI automated alert."
        msg.attach(MIMEText(body, 'plain'))
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, RECEIVER_EMAIL, msg.as_string())
        emit({"type": "info", "message": "Email alert sent"})
    except Exception as e:
        emit({"type": "error", "message": f"Email error: {str(e)}"})


# ─────────────────────────────────────────────────────────
#  Screenshot
# ─────────────────────────────────────────────────────────
def save_screenshot(frame, confidence):
    os.makedirs(DETECTIONS_DIR, exist_ok=True)
    ts    = datetime.now().strftime('%Y%m%d_%H%M%S')
    name  = f'fire_{ts}_{int(confidence)}.jpg'
    fpath = os.path.join(DETECTIONS_DIR, name)
    cv2.imwrite(fpath, frame)
    emit({
        "type":       "screenshot",
        "filename":   name,
        "confidence": round(confidence, 1),
        "timestamp":  datetime.now().isoformat(),
    })
    return name


# ─────────────────────────────────────────────────────────
#  FIX 3+4+5+6+7: Correct fire validation
# ─────────────────────────────────────────────────────────
def is_valid_box(frame, x1, y1, x2, y2):
    w = x2 - x1
    h = y2 - y1

    # FIX 5: Lowered from 5000 → 1500px — catches distant/small fires
    if w * h < 1500:
        return False

    # FIX 6: Relaxed from 0.30 → 0.15 — horizontal fires (spreading ground fire) are valid
    if h / (w + 1e-6) < 0.15:
        return False

    try:
        roi = frame[y1:y2, x1:x2]
        if roi.size == 0:
            return False

        hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)

        # FIX 4: Two HSV ranges — catches full fire spectrum:
        # Range 1: orange/yellow flames (hue 0–35, includes bright cores with lower S)
        mask1 = cv2.inRange(hsv, (0,  50, 100), (35, 255, 255))
        # Range 2: deep red embers (hue wrap-around 155–180)
        mask2 = cv2.inRange(hsv, (155, 50, 100), (180, 255, 255))
        mask  = cv2.bitwise_or(mask1, mask2)

        fire_pixels  = cv2.countNonZero(mask)
        total_pixels = roi.shape[0] * roi.shape[1]
        ratio        = fire_pixels / total_pixels

        # FIX 3: Lowered from 0.40 → 0.20 — smoke-covered fire has <40% pure hue pixels
        if ratio < 0.20:
            return False

        # FIX 7: Lowered std threshold from 25 → 15 — uniform flame regions are still fire
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        if gray.std() < 15:
            return False

        return True

    except Exception:
        return False


# ─────────────────────────────────────────────────────────
#  Main detection loop
# ─────────────────────────────────────────────────────────
def run_detection(model_path: str):
    emit({"type": "info", "message": f"Loading model: {model_path}"})
    if not os.path.exists(model_path):
        emit({"type": "error", "message": f"Model not found: {model_path}"})
        sys.exit(1)

    model = YOLO(model_path)

    model_class_names = model.names if hasattr(model, 'names') else {}
    fire_class_ids = [
        cid for cid, cname in model_class_names.items()
        if 'fire' in str(cname).lower()
    ]
    if not fire_class_ids:
        fire_class_ids = [0]

    emit({
        "type":    "info",
        "message": f"Model loaded. Fire class IDs: {fire_class_ids}. Classes: {model_class_names}"
    })

    cap = None
    for cam_idx in [0, 1, 2]:
        cap = cv2.VideoCapture(cam_idx)
        if cap.isOpened():
            emit({"type": "info", "message": f"Webcam opened at index {cam_idx}"})
            break
        cap.release()
        cap = None

    if cap is None:
        emit({"type": "error", "message": "Cannot open any webcam (tried 0,1,2)"})
        sys.exit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)

    for _ in range(5):
        cap.read()
        time.sleep(0.05)

    emit({"type": "info", "message": f"Detection loop started (conf={CONFIDENCE_THRESHOLD})"})

    confirm_counter        = 0
    no_fire_counter        = 0
    confirmed_fire         = False
    email_thread           = None
    last_email_time        = 0.0
    screenshots_this_event = 0
    last_screenshot_time   = 0.0

    fps_start   = time.time()
    fps_counter = 0
    fps_val     = 0.0

    last_emit_time  = 0.0
    last_emit_state = None

    while True:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.01)
            continue

        frame        = cv2.resize(frame, (640, 480))
        current_time = time.time()

        results = model(
            frame,
            stream=True,
            verbose=False,
            iou=0.4,
            # FIX 2: Use variable, not hardcoded value
            conf=CONFIDENCE_THRESHOLD,
            agnostic_nms=True,
        )

        raw_fire_this_frame = False
        best_conf           = 0.0
        boxes_data          = []
        annotated_frame     = frame.copy()

        for info in results:
            for box in info.boxes:
                confidence = float(box.conf[0])
                class_id   = int(box.cls[0])

                is_fire_class = (
                    class_id in fire_class_ids or
                    len(model_class_names) == 1
                )
                if not is_fire_class:
                    continue

                # FIX 2: Use CONFIDENCE_THRESHOLD variable — not hardcoded 0.85
                if confidence < CONFIDENCE_THRESHOLD:
                    continue

                x1, y1, x2, y2 = map(int, box.xyxy[0])
                x1 = max(0, x1); y1 = max(0, y1)
                x2 = min(frame.shape[1], x2); y2 = min(frame.shape[0], y2)

                if not is_valid_box(frame, x1, y1, x2, y2):
                    continue

                raw_fire_this_frame = True
                conf_pct = round(confidence * 100, 1)
                if conf_pct > best_conf:
                    best_conf = conf_pct

                cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 0, 255), 3)
                label = f'fire {int(conf_pct)}%'
                cv2.rectangle(annotated_frame,
                              (x1, y1 - 30), (x1 + len(label) * 10, y1),
                              (0, 0, 255), -1)
                cv2.putText(annotated_frame, label, (x1 + 4, y1 - 8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

                boxes_data.append({
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                    "confidence": conf_pct,
                    "class": "fire",
                })

        # ── Frame counters ───────────────────────────────
        if raw_fire_this_frame:
            confirm_counter += 1
            no_fire_counter  = 0
        else:
            no_fire_counter += 1
            confirm_counter  = 0

        # ── Fire confirmed ───────────────────────────────
        if confirm_counter >= CONFIRM_FRAMES_REQUIRED:
            if not confirmed_fire:
                confirmed_fire         = True
                screenshots_this_event = 0
                emit({"type": "info", "message": "Fire confirmed"})

            start_alarm()

            if (screenshots_this_event < MAX_SCREENSHOTS_PER_EVENT and
                    (current_time - last_screenshot_time) > SCREENSHOT_INTERVAL):
                save_screenshot(annotated_frame, best_conf)
                screenshots_this_event += 1
                last_screenshot_time    = current_time

            if (current_time - last_email_time) > EMAIL_COOLDOWN:
                if email_thread is None or not email_thread.is_alive():
                    email_thread    = threading.Thread(
                        target=send_email_notification, daemon=True
                    )
                    email_thread.start()
                    last_email_time = current_time

        # ── Fire gone ────────────────────────────────────
        if no_fire_counter >= RELEASE_FRAMES_REQUIRED and confirmed_fire:
            confirmed_fire = False
            stop_alarm()
            emit({"type": "info", "message": "Fire cleared"})

        # ── FPS ──────────────────────────────────────────
        fps_counter += 1
        if (current_time - fps_start) >= 1.0:
            fps_val     = fps_counter / (current_time - fps_start)
            fps_counter = 0
            fps_start   = current_time

        # ── Throttled frame emit ─────────────────────────
        current_state_sig = (confirmed_fire, round(best_conf), len(boxes_data))
        state_changed     = (current_state_sig != last_emit_state)
        time_to_heartbeat = (current_time - last_emit_time) >= FRAME_EMIT_INTERVAL

        if state_changed or time_to_heartbeat:
            emit({
                "type":          "frame",
                "fire_detected": confirmed_fire,
                "raw_detected":  raw_fire_this_frame,
                "confirm_count": confirm_counter,
                "confidence":    best_conf,
                "fps":           round(fps_val, 1),
                "boxes":         boxes_data,
                "timestamp":     datetime.now().isoformat(),
            })
            last_emit_time  = current_time
            last_emit_state = current_state_sig

    cap.release()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default=os.path.join(
        os.path.dirname(os.path.abspath(__file__)), 'fire.pt'
    ))
    args = parser.parse_args()
    run_detection(args.model)