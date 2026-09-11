import os

img_dir = "neg"
label_dir = "data/train/labels"

os.makedirs(label_dir, exist_ok=True)

for root, _, files in os.walk(img_dir):
    for f in files:
        if f.endswith((".jpg", ".png", ".jpeg")):
            name = os.path.splitext(f)[0]
            open(os.path.join(label_dir, name + ".txt"), "w").close()