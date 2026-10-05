#!/usr/bin/env python3
"""
Convert Option 3B Lord Hayagriva Front Bust artwork into a crisp, stroke-weighted transparent PNG
and export base64 data URI string for the titlebar emblem.
"""
import os
import sys
import base64
import cv2
import numpy as np
from PIL import Image

def main():
    source_img_path = "/Users/atulgrover/.gemini/antigravity-ide/brain/f115d693-8975-4e5c-8ccc-587bed9dba38/hayagriva_no_crown_1791209970957.jpg"
    dest_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../branding/resources"))
    os.makedirs(dest_dir, exist_ok=True)
    dest_png_path = os.path.join(dest_dir, "hayagriva_bust_no_crown.png")
    dest_b64_path = os.path.join(dest_dir, "hayagriva_bust_no_crown_base64.txt")

    if not os.path.exists(source_img_path):
        print(f"Error: Source image not found: {source_img_path}", file=sys.stderr)
        sys.exit(1)

    # 1. Read grayscale
    img = cv2.imread(source_img_path, cv2.IMREAD_GRAYSCALE)

    # 2. Invert so strokes are 255 and white background is 0
    inv = 255 - img

    # 3. Crop tight to bust bounding box
    coords = cv2.findNonZero(inv)
    x, y, w, h = cv2.boundingRect(coords)
    pad = int(max(w, h) * 0.03)
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(inv.shape[1], x + w + pad)
    y2 = min(inv.shape[0], y + h + pad)
    cropped = inv[y1:y2, x1:x2]

    # 4. Dilate strokes slightly (k=15 on ~1000px) so downscaled lines remain 1.5-2px crisp black
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    dilated = cv2.dilate(cropped, kernel)

    # 5. Downscale to 128x128 with INTER_AREA for antialiased subpixel quality
    res128 = cv2.resize(dilated, (128, 128), interpolation=cv2.INTER_AREA)

    # 6. Create RGBA image: strokes are solid black #18181b (24, 24, 27) with alpha from intensity
    rgba = np.zeros((128, 128, 4), dtype=np.uint8)
    rgba[:, :, 0] = 24
    rgba[:, :, 1] = 24
    rgba[:, :, 2] = 27
    rgba[:, :, 3] = res128

    out_img = Image.fromarray(rgba, "RGBA")
    out_img.save(dest_png_path, "PNG", optimize=True)
    print(f"Saved PNG mask to {dest_png_path}")

    # 7. Generate base64 string
    with open(dest_png_path, "rb") as f:
        b64_str = base64.b64encode(f.read()).decode("utf-8")

    with open(dest_b64_path, "w") as f:
        f.write(b64_str)
    print(f"Saved base64 string ({len(b64_str)} chars) to {dest_b64_path}")

if __name__ == "__main__":
    main()
