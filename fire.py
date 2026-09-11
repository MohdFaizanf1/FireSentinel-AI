from ultralytics import YOLO
import cvzone
import cv2
import math
from playsound import playsound
import threading
import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage
from datetime import datetime
import ssl
import os
import csv
from flask import Flask, jsonify
from flask_cors import CORS

# ─────────────────────────────────────────────────────────
#  Flask API Server (runs in background thread)
#  HTML dashboard polls http://127.0.0.1:5050/status
# ─────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

detection_state = {
    "fire_detected":       False,
    "confidence":          0.0,
    "total_detections":    0,
    "last_detection_time": None,
    "fps":                 0.0,
    "log":                 []
}

@app.route('/status')
def status():
    return jsonify(detection_state)

def run_flask():
    app.run(host='127.0.0.1', port=5050, debug=False, use_reloader=False)

# ─────────────────────────────────────────────────────────
#  Email Configuration
# ─────────────────────────────────────────────────────────
SMTP_SERVER     = "smtp.gmail.com"
SMTP_PORT       = 465
SENDER_EMAIL    = "mrsimens72@gmail.com"
SENDER_PASSWORD = "jawy snfv zjjk vcuz"   # 16-char Google App Password
RECEIVER_EMAIL  = "shaikhazam0990@gmail.com"

# ─────────────────────────────────────────────────────────
#  Model & Detection Settings
# ─────────────────────────────────────────────────────────
MODEL_PATH           = '/Users/azamshaikh/Developer/Fire_Detector_model/fire.pt'
CONFIDENCE_THRESHOLD = 0.75
ALARM_COOLDOWN       = 2.0    # seconds between alarm triggers
EMAIL_COOLDOWN       = 300    # 5 minutes between emails
ALARM_FILE           = 'alarm.mp3'

# ─────────────────────────────────────────────────────────
#  Folder Setup
# ─────────────────────────────────────────────────────────
SCREENSHOTS_DIR = 'detections'
LOGS_DIR        = 'logs'
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)

LOG_FILE = os.path.join(LOGS_DIR, f"fire_log_{datetime.now().strftime('%Y-%m-%d')}.csv")

# ─────────────────────────────────────────────────────────
#  CSV Logger
# ─────────────────────────────────────────────────────────
def init_csv_log():
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, 'w', newline='') as f:
            csv.writer(f).writerow([
                'timestamp', 'confidence_%', 'bbox_x1', 'bbox_y1',
                'bbox_x2', 'bbox_y2', 'screenshot_path', 'alert_sent'
            ])
        print(f"[LOG] CSV log created: {LOG_FILE}")

def log_detection(confidence, x1, y1, x2, y2, screenshot_path, alert_sent):
    try:
        with open(LOG_FILE, 'a', newline='') as f:
            csv.writer(f).writerow([
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                f"{confidence:.1f}", x1, y1, x2, y2,
                screenshot_path, alert_sent
            ])
    except Exception as e:
        print(f"[LOG ERROR] {e}")

# ─────────────────────────────────────────────────────────
#  Screenshot
# ─────────────────────────────────────────────────────────
def save_screenshot(frame):
    ts   = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    path = os.path.join(SCREENSHOTS_DIR, f"fire_{ts}.jpg")
    cv2.imwrite(path, frame)
    print(f"[SCREENSHOT] Saved → {path}")
    return path

# ─────────────────────────────────────────────────────────
#  Email with Screenshot Attached
# ─────────────────────────────────────────────────────────
def send_email_notification(screenshot_path=None):
    try:
        msg            = MIMEMultipart()
        msg['From']    = SENDER_EMAIL
        msg['To']      = RECEIVER_EMAIL
        msg['Subject'] = "🔥 FIRE DETECTION ALERT — FireShield AI"
        current_time   = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        body = (
            f"⚠️  FIRE DETECTED\n\n"
            f"Time of detection : {current_time}\n\n"
            f"This is an automated alert from the FireShield AI Detection System.\n"
            f"Please respond immediately and verify the location.\n\n"
            f"{'A screenshot of the detection has been attached.' if screenshot_path else ''}"
        )
        msg.attach(MIMEText(body, 'plain'))
        if screenshot_path and os.path.exists(screenshot_path):
            with open(screenshot_path, 'rb') as img_file:
                image = MIMEImage(img_file.read(), name=os.path.basename(screenshot_path))
                image.add_header('Content-Disposition', 'attachment',
                                 filename=os.path.basename(screenshot_path))
                msg.attach(image)
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT, context=context) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.sendmail(SENDER_EMAIL, RECEIVER_EMAIL, msg.as_string())
        print(f"[EMAIL] Alert sent at {current_time}")
    except smtplib.SMTPAuthenticationError:
        print("[EMAIL ERROR] Authentication failed. Check your App Password.")
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")

# ─────────────────────────────────────────────────────────
#  Alarm Sound
# ─────────────────────────────────────────────────────────
def play_alarm():
    if os.path.exists(ALARM_FILE):
        playsound(ALARM_FILE)
    else:
        print(f"[ALARM] '{ALARM_FILE}' not found. Place alarm.mp3 in the project folder.")

# ─────────────────────────────────────────────────────────
#  HUD Overlay
# ─────────────────────────────────────────────────────────
def draw_hud(frame, fire_detected, fps, detection_count):
    h, w  = frame.shape[:2]
    overlay   = frame.copy()
    bar_color = (0, 30, 200) if fire_detected else (0, 140, 0)
    cv2.rectangle(overlay, (0, 0), (w, 44), bar_color, -1)
    cv2.addWeighted(overlay, 0.72, frame, 0.28, 0, frame)
    status = "!!!  FIRE DETECTED  !!!" if fire_detected else "MONITORING — No Fire"
    cv2.putText(frame, status, (14, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.85, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, f"FPS: {fps:.1f}", (w - 120, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7,  (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(frame, f"Session detections: {detection_count}", (14, h - 36),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1, cv2.LINE_AA)
    cv2.putText(frame, "API → http://127.0.0.1:5050/status   |   Press S to quit", (14, h - 14),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (150, 150, 150), 1, cv2.LINE_AA)

# ─────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────
def main():
    init_csv_log()

    # Start Flask API server in background
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()
    print("[API]    Flask server → http://127.0.0.1:5050/status")

    print("[SYSTEM] Loading YOLO model...")
    model = YOLO(MODEL_PATH)
    print("[SYSTEM] Model loaded ✓")

    cap = cv2.VideoCapture(0, cv2.CAP_AVFOUNDATION)
    if not cap.isOpened():
        print("[WARN]   Camera 0 unavailable, trying camera 1...")
        cap = cv2.VideoCapture(1, cv2.CAP_AVFOUNDATION)
    if not cap.isOpened():
        print("[ERROR]  No webcam found.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS,          30)
    cap.set(cv2.CAP_PROP_BUFFERSIZE,   1)

    print("[SYSTEM] Warming up camera (2s)...")
    for _ in range(20):
        cap.read()
        time.sleep(0.05)
    print("[SYSTEM] Camera ready. Starting detection...")

    classnames         = ['fire']
    alarm_thread       = None
    email_thread       = None
    last_fire_time     = 0.0
    last_email_time    = 0.0
    fps_start          = time.time()
    fps_counter        = 0
    fps_display        = 0.0
    session_detections = 0

    cv2.namedWindow('FireShield AI — Detection', cv2.WINDOW_NORMAL)
    cv2.resizeWindow('FireShield AI — Detection', 960, 720)

    while True:
        ret, frame = cap.read()
        if not ret or frame is None:
            time.sleep(0.01)
            continue

        results       = model(frame, stream=True, verbose=False)
        fire_detected = False
        current_time  = time.time()
        best_conf     = 0.0
        best_box      = None
        screenshot_path = None

        for info in results:
            for box in info.boxes:
                confidence = float(box.conf[0])
                cls_id     = int(box.cls[0])

                if confidence >= CONFIDENCE_THRESHOLD:
                    fire_detected = True
                    x1, y1, x2, y2 = map(int, box.xyxy[0])

                    if confidence > best_conf:
                        best_conf = confidence
                        best_box  = (x1, y1, x2, y2)

                    # Draw double-border bounding box
                    cv2.rectangle(frame, (x1 - 3, y1 - 3), (x2 + 3, y2 + 3), (0, 0, 120), 2)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3)

                    pct = math.ceil(confidence * 100)
                    cvzone.putTextRect(
                        frame,
                        f'{classnames[cls_id]}  {pct}%',
                        [x1 + 8, y1 + 100],
                        scale=1.5, thickness=2,
                        colorR=(160, 0, 0)
                    )

        # ── Alarm + Screenshot + Email ────────────────────────
        if fire_detected:
            session_detections += 1

            if (current_time - last_fire_time) > ALARM_COOLDOWN:
                if alarm_thread is None or not alarm_thread.is_alive():
                    alarm_thread   = threading.Thread(target=play_alarm, daemon=True)
                    alarm_thread.start()
                    last_fire_time = current_time

                    # Save screenshot on each alarm trigger
                    screenshot_path = save_screenshot(frame)
                    if best_box:
                        x1, y1, x2, y2 = best_box
                        log_detection(best_conf * 100, x1, y1, x2, y2,
                                      screenshot_path, True)

            if (current_time - last_email_time) > EMAIL_COOLDOWN:
                if email_thread is None or not email_thread.is_alive():
                    email_thread = threading.Thread(
                        target=send_email_notification,
                        args=(screenshot_path,),
                        daemon=True
                    )
                    email_thread.start()
                    last_email_time = current_time

        # ── Update Flask API State ────────────────────────────
        detection_state["fire_detected"]    = fire_detected
        detection_state["fps"]              = round(fps_display, 1)
        detection_state["total_detections"] = session_detections

        if fire_detected and best_conf > 0:
            detection_state["confidence"]          = round(best_conf * 100, 1)
            detection_state["last_detection_time"] = datetime.now().strftime("%H:%M:%S")

            sev = "HIGH" if best_conf >= 0.9 else "MED" if best_conf >= 0.8 else "LOW"
            log_entry = {
                "time":       datetime.now().strftime("%H:%M:%S"),
                "conf":       round(best_conf * 100, 1),
                "sev":        sev,
                "screenshot": screenshot_path or ""
            }
            detection_state["log"].insert(0, log_entry)
            detection_state["log"] = detection_state["log"][:100]  # keep last 100

        # ── FPS ───────────────────────────────────────────────
        fps_counter += 1
        elapsed = time.time() - fps_start
        if elapsed >= 1.0:
            fps_display = fps_counter / elapsed
            fps_counter = 0
            fps_start   = time.time()

        draw_hud(frame, fire_detected, fps_display, session_detections)
        cv2.imshow('FireShield AI — Detection', frame)

        if cv2.waitKey(1) & 0xFF == ord('s'):
            print("\n[SYSTEM] Stopping by user request...")
            break

    cap.release()
    cv2.destroyAllWindows()
    print(f"[SYSTEM] Session complete.")
    print(f"[SYSTEM] Total detections : {session_detections}")
    print(f"[SYSTEM] Log saved to     : {LOG_FILE}")
    print(f"[SYSTEM] Screenshots in   : {SCREENSHOTS_DIR}/")


if __name__ == '__main__':
    main()