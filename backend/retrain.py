#!/usr/bin/env python3
"""
FireShield AI — retrain.py

FIXES vs previous version:
  1. data.yaml uses relative path '.' — absolute path broke on other machines
  2. Hard negatives split 80/20 train/valid — validation metrics now honest
  3. mosaic=1.0 — was 0.4, free augmentation for small datasets
  4. workers = 0 on Mac, 4 on Linux/cloud — was hardcoded 0 everywhere
  5. mAP check before copying model — bad model no longer silently deployed
  6. MIN_HUE_PIXELS / MIN_COLOR_VARIANCE comments clarified — these are
     inference-only constants, they don't affect training
  7. CONF_THRESHOLD synced with fire_ws.py default (0.55)

Run:
  python3 retrain.py              # interactive
  python3 retrain.py --yes        # non-interactive (CI / SSH)

Inference usage:
  from retrain import filter_detections, FireTracker
  tracker = FireTracker(required_hits=4)
  raw       = filter_detections(frame, results[0])
  confirmed = tracker.update(raw)
  if confirmed:
      trigger_alarm()
"""

import os
import sys
import shutil
import yaml
import argparse
import logging
from pathlib import Path
from collections import defaultdict

logging.basicConfig(
    level=logging.INFO,
    format="  %(levelname)-8s %(message)s",
)
log = logging.getLogger("fireshield")

os.chdir(os.path.dirname(os.path.abspath(__file__)))
log.info("Working directory: %s", os.getcwd())

# ─────────────────────────────────────────────────────────
#  Config
# ─────────────────────────────────────────────────────────
MODEL_BASE  = 'yolov8s.pt'
MODEL_BASE = 'yolov8s.pt'
EPOCHS = 100
IMG_SIZE = 640
BATCH_SIZE = 16

OUTPUT_NAME = 'fire_v2'
DATASET_DIR = 'data'

# ─────────────────────────────────────────────────────────
#  Inference filter thresholds (used in filter_detections only, NOT training)
# ─────────────────────────────────────────────────────────
CONF_THRESHOLD     = 0.55    # synced with fire_ws.py default
MIN_BOX_AREA       = 1500
MAX_BOX_RATIO      = 5.0
MIN_COLOR_VARIANCE = 150     # lowered — uniform flame regions are real fire
MIN_HUE_PIXELS     = 0.20    # lowered — smoke-covered fire has <40% pure hue


# ─────────────────────────────────────────────────────────
#  Safe RNG / color helpers
# ─────────────────────────────────────────────────────────
_rng = None


def r(a: int, b: int) -> int:
    return int(_rng.integers(int(a), int(b)))


def clamp(v: int, lo: int = 0, hi: int = 255) -> int:
    return int(max(lo, min(hi, int(v))))


def color(b: int, g: int, red: int) -> tuple:
    return (clamp(b), clamp(g), clamp(red))


# ─────────────────────────────────────────────────────────
#  Step 1 — Check existing dataset
# ─────────────────────────────────────────────────────────
def check_existing_dataset() -> dict:
    log.info("=" * 56)
    log.info("STEP 1: Checking existing dataset")
    log.info("=" * 56)

    required = {
        'train/images': Path(DATASET_DIR) / 'train' / 'images',
        'train/labels': Path(DATASET_DIR) / 'train' / 'labels',
        'valid/images': Path(DATASET_DIR) / 'valid' / 'images',
        'valid/labels': Path(DATASET_DIR) / 'valid' / 'labels',
    }

    counts = {}
    all_ok = True

    for name, folder in required.items():
        if folder.exists():
            n = len(list(folder.glob('*')))
            counts[name] = n
            log.info("OK       %s: %d files", name, n)
        else:
            log.error("MISSING  %s", name)
            all_ok = False

    if not all_ok:
        log.error("Missing required folders under '%s/'", DATASET_DIR)
        sys.exit(1)

    train_count = counts.get('train/images', 0)
    valid_count = counts.get('valid/images', 0)

    log.info("Training images  : %d", train_count)
    log.info("Validation images: %d", valid_count)

    if valid_count == 0:
        log.error("valid/images is empty — YOLO needs validation images.")
        sys.exit(1)

    if train_count < 100:
        log.warning("Small dataset (%d images) — add more for better results.", train_count)

    return counts


# ─────────────────────────────────────────────────────────
#  Step 1b — Dataset integrity + orphan label cleanup
# ─────────────────────────────────────────────────────────
def validate_and_clean_dataset():
    log.info("=" * 56)
    log.info("STEP 1b: Dataset integrity check")
    log.info("=" * 56)

    IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
    splits = [
        ('train', Path(DATASET_DIR) / 'train' / 'images',
                  Path(DATASET_DIR) / 'train' / 'labels'),
        ('valid', Path(DATASET_DIR) / 'valid' / 'images',
                  Path(DATASET_DIR) / 'valid' / 'labels'),
    ]

    for split_name, img_dir, lbl_dir in splits:
        log.info("--- %s ---", split_name)
        img_stems = {p.stem for p in img_dir.glob('*') if p.suffix.lower() in IMAGE_EXTS}
        lbl_stems = {p.stem for p in lbl_dir.glob('*.txt')}

        orphan_labels = lbl_stems - img_stems
        orphan_images = img_stems - lbl_stems
        matched       = img_stems & lbl_stems

        log.info("  Images  : %d", len(img_stems))
        log.info("  Labels  : %d", len(lbl_stems))
        log.info("  Matched : %d", len(matched))

        if orphan_images:
            log.warning("  %d image(s) with no label — treated as background (ok).",
                        len(orphan_images))

        if orphan_labels:
            log.warning("  %d orphan label(s) found — deleting.", len(orphan_labels))
            deleted = 0
            for stem in sorted(orphan_labels):
                lbl_path = lbl_dir / f"{stem}.txt"
                try:
                    lbl_path.unlink()
                    deleted += 1
                except OSError as exc:
                    log.error("    Could not delete %s: %s", lbl_path, exc)
            log.info("  Deleted %d orphan labels.", deleted)
        else:
            log.info("  No orphan labels — clean.")


# ─────────────────────────────────────────────────────────
#  Step 2 — Dataset source hints
# ─────────────────────────────────────────────────────────
def print_dataset_sources():
    log.info("=" * 56)
    log.info("STEP 2: Dataset sources")
    log.info("=" * 56)
    print()
    print("  Target: 1,500+ fire images + 1,500+ negative images")
    print()
    print("  Fire datasets (free, YOLO format):")
    print("  1. D-Fire (1900+ images): https://github.com/gaiasd/DFireDataset")
    print("  2. Roboflow: https://universe.roboflow.com/ — search 'fire detection'")
    print("  3. Kaggle: https://www.kaggle.com/datasets/phylake1337/fire-dataset")
    print()
    print("  Negatives to photograph:")
    print("  yellow/orange LEDs, sunsets, candles, construction signs, street lamps")
    print("  Place in data/train/images/ with empty .txt label files")
    print()


# ─────────────────────────────────────────────────────────
#  Step 3 — Hard negatives
#  FIX 2: 80% go to train/, 20% go to valid/
# ─────────────────────────────────────────────────────────
def create_hard_negatives():
    log.info("=" * 56)
    log.info("STEP 3: Creating hard negative examples (80% train / 20% valid)")
    log.info("=" * 56)

    try:
        import cv2
        import numpy as np
    except ImportError:
        log.warning("cv2/numpy not available — skipping. pip install opencv-python numpy")
        return

    global _rng
    _rng = np.random.default_rng(42)

    train_img = Path(DATASET_DIR) / 'train' / 'images'
    train_lbl = Path(DATASET_DIR) / 'train' / 'labels'
    valid_img = Path(DATASET_DIR) / 'valid' / 'images'
    valid_lbl = Path(DATASET_DIR) / 'valid' / 'labels'

    for d in [train_img, train_lbl, valid_img, valid_lbl]:
        d.mkdir(parents=True, exist_ok=True)

    created = 0
    skipped = 0

    def save_negative(img, name, to_valid=False):
        img_dir = valid_img if to_valid else train_img
        lbl_dir = valid_lbl if to_valid else train_lbl
        try:
            ok = cv2.imwrite(str(img_dir / f'neg_{name}.jpg'), img)
            if not ok:
                return False
            (lbl_dir / f'neg_{name}.txt').open('w').close()
            return True
        except Exception as exc:
            log.debug("save_negative(%s): %s", name, exc)
            return False

    def add_texture(img, strength=15):
        noise = _rng.integers(-strength, strength, img.shape, dtype=np.int16)
        return np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)

    def add_grain(img):
        grain = _rng.standard_normal(img.shape) * 8
        return np.clip(img.astype(np.float32) + grain, 0, 255).astype(np.uint8)

    H, W = 480, 640

    def make_candle(i):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(r(5, 25), r(5, 25), r(5, 25))
        cx, cy = r(100, 540), r(100, 380)
        for radius in range(80, 0, -5):
            a = 1.0 - radius / 80.0
            cv2.circle(img, (cx, cy), radius,
                       color(int(10*a), int(100*a), int(240*a)), -1)
        cv2.rectangle(img, (cx-4, cy+5), (cx+4, cy+25), color(160, 200, 230), -1)
        return add_grain(add_texture(img, 20))

    def make_sunset(i):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        for y in range(H):
            t = y / H
            img[y, :] = color(int(t*180), int(t*60+(1-t)*80), int((1-t)*220+t*20))
        for _ in range(r(2, 6)):
            cy_c = r(H//3, 2*H//3)
            cv2.line(img, (0, cy_c), (W, cy_c+r(-20, 20)),
                     color(r(100, 160), 100, 200), r(3, 12))
        return add_texture(img, 10)

    def make_led_strip(i):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(15, 15, 15)
        y1 = r(150, 330)
        thickness = r(8, 30)
        col = color(r(0, 30), r(150, 255), r(200, 255))
        cv2.rectangle(img, (40, y1), (600, y1+thickness), col, -1)
        for blur_r in range(1, 4):
            faded = color(col[0]//3, col[1]//3, col[2]//3)
            cv2.rectangle(img, (40, y1-blur_r*4), (600, y1+thickness+blur_r*4), faded, 1)
        return add_grain(img)

    def make_phone_screen(i):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(30, 30, 30)
        sx1, sy1 = r(80, 200),  r(60, 150)
        sx2, sy2 = r(400, 560), r(300, 420)
        sx1, sx2 = min(sx1, sx2-10), max(sx1+10, sx2)
        sy1, sy2 = min(sy1, sy2-10), max(sy1+10, sy2)
        scol = color(r(0, 40), r(150, 255), r(200, 255))
        cv2.rectangle(img, (sx1-10, sy1-10), (sx2+10, sy2+10), color(40, 40, 40), -1)
        cv2.rectangle(img, (sx1, sy1), (sx2, sy2), scol, -1)
        for _ in range(r(2, 5)):
            lx = r(sx1+10, max(sx1+20, sx2-50))
            ly = r(sy1+10, max(sy1+20, sy2-10))
            ui = color(scol[0]*7//10, scol[1]*7//10, scol[2]*7//10)
            cv2.rectangle(img, (lx, ly), (lx+r(20, 80), ly+r(5, 15)), ui, -1)
        return add_texture(img, 8)

    def make_traffic_light(i):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(20, 20, 20)
        hx, hy = r(200, 380), r(50, 200)
        cv2.rectangle(img, (hx-20, hy), (hx+20, hy+100), color(50, 50, 50), -1)
        cv2.circle(img, (hx, hy+50), 15, color(0, 165, 255), -1)
        cv2.circle(img, (hx, hy+50), 22, color(0, 60, 100), 4)
        return add_grain(img)

    def make_construction(i):
        base = r(60, 120)
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(base, base, base)
        ox1, oy1 = r(80, 200),  r(80, 200)
        ox2, oy2 = r(400, 560), r(280, 400)
        ox1, ox2 = min(ox1, ox2-10), max(ox1+10, ox2)
        oy1, oy2 = min(oy1, oy2-10), max(oy1+10, oy2)
        cv2.rectangle(img, (ox1, oy1), (ox2, oy2), color(0, 120, 255), -1)
        h_third = (oy2 - oy1) // 3
        for sy in [oy1+h_third, oy1+2*h_third]:
            cv2.rectangle(img, (ox1, sy-8), (ox2, sy+8), color(200, 200, 200), -1)
        return add_texture(img, 15)

    def make_leaves(i):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(r(20, 60), r(60, 100), r(100, 160))
        for _ in range(r(8, 20)):
            ax, ay = max(1, r(20, 80)), max(1, r(15, 50))
            cv2.ellipse(img, (r(0, W), r(0, H)), (ax, ay),
                        r(0, 180), 0, 360,
                        color(r(0, 40), r(30, 100), r(150, 230)), -1)
        return add_grain(add_texture(img, 20))

    def make_street_lamp(i):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(10, 10, 15)
        lamp_x, lamp_y = r(150, 490), r(60, 180)
        cv2.line(img, (lamp_x, lamp_y+20), (lamp_x, H-1), color(60, 60, 60), 4)
        for radius, alpha in [(60, 0.15), (40, 0.3), (20, 0.6), (10, 1.0)]:
            cv2.circle(img, (lamp_x, lamp_y), radius,
                       color(int(20*alpha), int(150*alpha), int(255*alpha)), -1)
        return add_texture(img, 5)

    def make_skin(i):
        b_v, g_v, r_v = r(80, 140), r(110, 175), r(165, 225)
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(b_v, g_v, r_v)
        for _ in range(r(3, 8)):
            dk = r(10, 30)
            cv2.ellipse(img, (r(50, 590), r(50, 430)),
                        (max(1, r(10, 60)), max(1, r(10, 40))),
                        0, 0, 360, color(b_v-dk, g_v-dk, r_v-dk), -1)
        return add_grain(add_texture(img, 12))

    def make_bbq_coals(i):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        img[:] = color(5, 5, 5)
        for bar_x in range(100, 550, 40):
            cv2.line(img, (bar_x, 150), (bar_x, 380), color(50, 50, 50), 6)
        for _ in range(r(20, 50)):
            heat = r(100, 200)
            cv2.circle(img, (r(80, 580), r(350, 440)), max(1, r(5, 20)),
                       color(r(0, 30), r(30, heat//2), heat), -1)
        return add_grain(add_texture(img, 10))

    generators = {
        0: ('candle',        make_candle),
        1: ('sunset',        make_sunset),
        2: ('led_strip',     make_led_strip),
        3: ('phone_screen',  make_phone_screen),
        4: ('traffic_light', make_traffic_light),
        5: ('construction',  make_construction),
        6: ('leaves',        make_leaves),
        7: ('street_lamp',   make_street_lamp),
        8: ('skin',          make_skin),
        9: ('bbq_coals',     make_bbq_coals),
    }

    for i in range(250):
        ntype = i % 10
        name_prefix, fn = generators[ntype]
        # FIX 2: last 20% (i >= 200) go to valid/
        to_valid = (i >= 200)
        try:
            img = fn(i)
            if save_negative(img, f'{name_prefix}_{i:04d}', to_valid=to_valid):
                created += 1
            else:
                skipped += 1
        except Exception as exc:
            skipped += 1
            log.warning("Skipped %s_%04d — %s", name_prefix, i, exc)

    log.info("Hard negatives: %d created (%d to train, %d to valid), %d skipped.",
             created, min(created, 200), max(0, created - 200), skipped)


# ─────────────────────────────────────────────────────────
#  Step 4 — data.yaml
#  FIX 1: Use relative path '.' instead of absolute path
# ─────────────────────────────────────────────────────────
def create_data_yaml() -> str:
    log.info("=" * 56)
    log.info("STEP 4: Creating data.yaml")
    log.info("=" * 56)

    yaml_path = Path(DATASET_DIR) / 'data.yaml'
    data_yaml = {
        # FIX 1: '.' means relative to data.yaml location — works on any machine
        'path':  '.',
        'train': 'train/images',
        'val':   'valid/images',
        'nc':    1,
        'names': ['fire'],
    }

    if (Path(DATASET_DIR) / 'test' / 'images').exists():
        data_yaml['test'] = 'test/images'

    with open(yaml_path, 'w') as f:
        yaml.dump(data_yaml, f, default_flow_style=False, sort_keys=False)

    log.info("Saved: %s", yaml_path)
    return str(yaml_path)


# ─────────────────────────────────────────────────────────
#  Step 5 — Train
# ─────────────────────────────────────────────────────────
def train(yaml_path: str):
    log.info("=" * 56)
    log.info("STEP 5: Training")
    log.info("=" * 56)

    try:
        from ultralytics import YOLO
        import torch
    except ImportError:
        log.error("ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    if torch.backends.mps.is_available():
        device = 'mps'
    elif torch.cuda.is_available():
        device = '0'
    else:
        device = 'cpu'

    # FIX 4: workers=0 only on Mac — Linux/cloud uses 4 for faster data loading
    import platform
    workers = 0 if platform.system() == 'Darwin' else 4

    print(f"  MPS available : {torch.backends.mps.is_available()}")
    print(f"  Using device  : {device}")
    print(f"  Workers       : {workers}")

    log.info("Model      : %s", MODEL_BASE)
    log.info("Epochs     : %d (patience=30)", EPOCHS)
    log.info("Batch size : %d", BATCH_SIZE)
    log.info("Device     : %s", device)

    model = YOLO(MODEL_BASE)

    model.train(
        data     = yaml_path,
        epochs   = EPOCHS,
        imgsz    = IMG_SIZE,
        batch    = BATCH_SIZE,
        name     = OUTPUT_NAME,
        device   = device,
        workers  = workers,
        patience = 30,
        save     = True,
        plots    = True,
        dropout  = 0.1,

        # FIX 3: mosaic=1.0 — was 0.4, gives 4x effective images for small datasets
        hsv_h     = 0.010,
        hsv_s     = 0.4,
        hsv_v     = 0.5,
        degrees   = 15,
        translate = 0.1,
        scale     = 0.5,
        fliplr    = 0.5,
        flipud    = 0.0,
        mosaic    = 1.0,
        mixup     = 0.0,
        copy_paste= 0.0,

        optimizer    = 'SGD',
        lr0          = 0.01,
        lrf          = 0.01,
        momentum     = 0.937,
        weight_decay = 0.0005,
        warmup_epochs= 3,
        cos_lr       = True,

        conf = 0.25,
        iou  = 0.45,
    )

    log.info("Training complete.")


# ─────────────────────────────────────────────────────────
#  Step 6 — Copy best model
#  FIX 5: Check mAP before deploying
# ─────────────────────────────────────────────────────────
def copy_best_model():
    log.info("=" * 56)
    log.info("STEP 6: Saving best model")
    log.info("=" * 56)

    search_patterns = [
        f'runs/detect/{OUTPUT_NAME}/weights/best.pt',
        f'runs/train/{OUTPUT_NAME}/weights/best.pt',
        f'runs/detect/{OUTPUT_NAME}*/weights/best.pt',
        f'runs/train/{OUTPUT_NAME}*/weights/best.pt',
    ]

    best_pt = None
    for pattern in search_patterns:
        found = list(Path('.').glob(pattern))
        if found:
            best_pt = max(found, key=lambda p: p.stat().st_mtime)
            break

    if not best_pt:
        log.error("Could not find best.pt — searched:")
        for p in search_patterns:
            log.error("  %s", p)
        return

    # FIX 5: Quick mAP sanity check before deploying
    results_csv = best_pt.parent.parent / 'results.csv'
    if results_csv.exists():
        try:
            import csv
            with open(results_csv) as f:
                rows = list(csv.DictReader(f))
            if rows:
                # Last row = best epoch metrics
                last = rows[-1]
                map50_key = next((k for k in last if 'map50' in k.lower() and '95' not in k.lower()), None)
                if map50_key:
                    map50 = float(last[map50_key].strip())
                    log.info("Best mAP50 from training: %.3f", map50)
                    if map50 < 0.30:
                        log.error("mAP50=%.3f is too low — model not deployed.", map50)
                        log.error("Check your dataset labels and add more training images.")
                        return
                    elif map50 < 0.60:
                        log.warning("mAP50=%.3f — model deployed but below target (>0.85).", map50)
                        log.warning("Consider adding more labeled fire images before production use.")
        except Exception as exc:
            log.warning("Could not read results.csv: %s — skipping mAP check", exc)

    log.info("Found: %s", best_pt)

    for dest in [Path('fire.pt'), Path('models') / 'fire.pt']:
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(best_pt), str(dest))
        log.info("Copied to: %s", dest)

    log.info("Restart backend to load the new model.")


# ─────────────────────────────────────────────────────────
#  Step 7 — Validate
# ─────────────────────────────────────────────────────────
def validate_model():
    log.info("=" * 56)
    log.info("STEP 7: Validating new model")
    log.info("=" * 56)

    model_path = Path('models/fire.pt')
    if not model_path.exists():
        model_path = Path('fire.pt')
    if not model_path.exists():
        log.warning("fire.pt not found — skipping validation.")
        return

    try:
        from ultralytics import YOLO
        import torch

        if torch.backends.mps.is_available():
            device = 'mps'
        elif torch.cuda.is_available():
            device = '0'
        else:
            device = 'cpu'

        log.info("Validating on device: %s", device)

        model   = YOLO(str(model_path))
        metrics = model.val(
            data   = str(Path(DATASET_DIR) / 'data.yaml'),
            device = device,
        )

        p   = float(metrics.box.p.mean())
        r_  = float(metrics.box.r.mean())
        m50 = float(metrics.box.map50)
        m95 = float(metrics.box.map)

        log.info("mAP50    : %.3f   (target > 0.85)", m50)
        log.info("mAP50-95 : %.3f   (target > 0.60)", m95)
        log.info("Precision: %.3f   (target > 0.88)", p)
        log.info("Recall   : %.3f   (target > 0.78)", r_)

        if p >= 0.88 and r_ >= 0.78:
            log.info("Model meets production targets.")
        elif p >= 0.90 and r_ < 0.75:
            log.warning("High precision, low recall — model too strict.")
            log.warning("Lower CONFIDENCE_THRESHOLD in fire_ws.py to 0.45.")
        elif p < 0.75 and r_ >= 0.78:
            log.warning("Low precision — false positives remain.")
            log.warning("Add more real negatives and retrain.")
        else:
            log.warning("Both below target — dataset too small or mislabelled.")
            log.warning("Add more images from Step 2 sources.")

    except Exception as exc:
        log.error("Validation error: %s", exc)


# ─────────────────────────────────────────────────────────
#  Inference post-processing
# ─────────────────────────────────────────────────────────
try:
    import cv2 as _cv2
    import numpy as _np
    _INFERENCE_DEPS = True
    _FIRE_HUE_LOW1  = _np.array([0,   50,  100], dtype=_np.uint8)
    _FIRE_HUE_HIGH1 = _np.array([35, 255,  255], dtype=_np.uint8)
    _FIRE_HUE_LOW2  = _np.array([155, 50,  100], dtype=_np.uint8)
    _FIRE_HUE_HIGH2 = _np.array([180, 255, 255], dtype=_np.uint8)
except ImportError:
    _INFERENCE_DEPS = False


def filter_detections(frame_bgr, results) -> list:
    """
    Secondary filter on top of raw YOLO detections.
    Removes false positives from yellow/orange non-fire objects.

    Args:
        frame_bgr : Full BGR frame (numpy ndarray)
        results   : Single YOLO result — i.e. model(frame)[0]

    Returns:
        List of dicts {box, conf, reason}
    """
    if not _INFERENCE_DEPS:
        log.warning("filter_detections: cv2/numpy not installed.")
        return []

    kept = []
    boxes = results.boxes
    if boxes is None or len(boxes) == 0:
        return kept

    fh, fw = frame_bgr.shape[:2]

    for box in boxes:
        xyxy = box.xyxy[0].tolist()
        conf = float(box.conf[0])
        keep, reason = _is_real_fire(frame_bgr, xyxy, conf, fw, fh)
        if keep:
            kept.append({"box": xyxy, "conf": conf, "reason": reason})

    return kept


def _is_real_fire(frame_bgr, box, conf, fw, fh):
    x1, y1, x2, y2 = [int(v) for v in box]

    if conf < CONF_THRESHOLD:
        return False, f"low_conf({conf:.2f})"

    area = (x2 - x1) * (y2 - y1)
    if area < MIN_BOX_AREA:
        return False, f"too_small({area}px)"

    w = max(x2 - x1, 1)
    h = max(y2 - y1, 1)
    if max(w, h) / min(w, h) > MAX_BOX_RATIO:
        return False, "bad_aspect"

    x1c, y1c = max(0, x1), max(0, y1)
    x2c, y2c = min(fw, x2), min(fh, y2)
    crop = frame_bgr[y1c:y2c, x1c:x2c]
    if crop.size == 0:
        return False, "empty_crop"

    if float(_np.var(crop)) < MIN_COLOR_VARIANCE:
        return False, "flat_region"

    hsv   = _cv2.cvtColor(crop, _cv2.COLOR_BGR2HSV)
    mask1 = _cv2.inRange(hsv, _FIRE_HUE_LOW1, _FIRE_HUE_HIGH1)
    mask2 = _cv2.inRange(hsv, _FIRE_HUE_LOW2, _FIRE_HUE_HIGH2)
    mask  = _cv2.bitwise_or(mask1, mask2)

    if _np.count_nonzero(mask) / max(mask.size, 1) < MIN_HUE_PIXELS:
        return False, "wrong_color"

    return True, "ok"


class FireTracker:
    """
    Temporal stability filter for video streams.
    Requires detection in N consecutive frames before confirming fire.

    Usage:
        tracker   = FireTracker(required_hits=4)
        raw       = filter_detections(frame, results[0])
        confirmed = tracker.update(raw)
        if confirmed:
            trigger_alarm()
    """

    def __init__(self, required_hits: int = 4, decay: int = 2):
        self.required_hits = required_hits
        self.decay         = decay
        self._hits:   dict = defaultdict(int)
        self._misses: dict = defaultdict(int)

    def _zone(self, box, grid: int = 32) -> int:
        cx = int((box[0] + box[2]) / 2)
        cy = int((box[1] + box[3]) / 2)
        return (cx // grid) * 10_000 + (cy // grid)

    def update(self, detections: list) -> list:
        active_zones = {self._zone(d["box"]) for d in detections}

        for z in active_zones:
            self._hits[z]  += 1
            self._misses[z] = 0

        for z in list(self._hits.keys()):
            if z not in active_zones:
                self._misses[z] += 1
                if self._misses[z] >= self.decay:
                    del self._hits[z]
                    self._misses.pop(z, None)

        return [
            d for d in detections
            if self._hits.get(self._zone(d["box"]), 0) >= self.required_hits
        ]

    def reset(self):
        self._hits.clear()
        self._misses.clear()


# ─────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='FireShield AI — model retrainer')
    parser.add_argument('--yes', '-y', action='store_true',
                        help='Skip confirmation prompts')
    args = parser.parse_args()

    print()
    print("  FireShield AI — Model Retrainer")
    print()

    missing = []
    for pkg in ['ultralytics', 'cv2', 'yaml', 'numpy']:
        try:
            __import__(pkg)
        except ImportError:
            pip_name = {'cv2': 'opencv-python', 'yaml': 'pyyaml'}.get(pkg, pkg)
            missing.append(pip_name)

    if missing:
        log.error("Missing packages:")
        for pkg in missing:
            log.error("  pip install %s", pkg)
        sys.exit(1)

    if not args.yes:
        try:
            input("  Press ENTER to start, Ctrl+C to cancel... ")
        except KeyboardInterrupt:
            print("\n  Cancelled.")
            sys.exit(0)

    check_existing_dataset()
    validate_and_clean_dataset()
    print_dataset_sources()
    create_hard_negatives()
    yaml_path = create_data_yaml()
    train(yaml_path)
    copy_best_model()
    validate_model()

    log.info("=" * 56)
    log.info("DONE — restart backend to use the new model.")
    log.info("=" * 56)


if __name__ == '__main__':
    main()