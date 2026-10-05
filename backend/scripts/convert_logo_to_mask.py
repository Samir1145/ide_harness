#!/usr/bin/env python3
"""
Convert Option 3B Lord Hayagriva artwork into a clean, antialiased transparent PNG mask
and export base64 data URI string.
"""
import os
import sys
import base64
from PIL import Image

def main():
    source_img_path = "/Users/atulgrover/.gemini/antigravity-ide/brain/f115d693-8975-4e5c-8ccc-587bed9dba38/hayagriva_profile_silhouette_1791211650783.jpg"
    dest_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../branding/resources"))
    os.makedirs(dest_dir, exist_ok=True)
    dest_png_path = os.path.join(dest_dir, "hayagriva_bust_no_crown.png")
    dest_b64_path = os.path.join(dest_dir, "hayagriva_bust_no_crown_base64.txt")

    if not os.path.exists(source_img_path):
        print(f"Error: Source image not found: {source_img_path}", file=sys.stderr)
        sys.exit(1)

    # Open image and convert to grayscale
    img = Image.open(source_img_path).convert("L")
    
    # Crop to content bounding box to maximize fill
    # Invert to find non-white pixels
    inv = img.point(lambda p: 255 - p)
    bbox = inv.getbbox()
    if bbox:
        # Add slight padding around content
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        pad = int(max(w, h) * 0.03)
        c_box = (
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(img.width, bbox[2] + pad),
            min(img.height, bbox[3] + pad)
        )
        img = img.crop(c_box)

    # Resize to clean square (128x128 for crisp titlebar masking) with Lanczos
    size = (128, 128)
    img = img.resize(size, Image.Resampling.LANCZOS)

    # Create RGBA image: black strokes (RGB=24,24,27), alpha based on darkness
    rgba = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = img.load()
    out_pixels = rgba.load()

    for y in range(size[1]):
        for x in range(size[0]):
            lum = pixels[x, y]
            if lum >= 220:
                # White background -> fully transparent
                out_pixels[x, y] = (0, 0, 0, 0)
            elif lum <= 80:
                # Dark strokes -> solid black
                out_pixels[x, y] = (0, 0, 0, 255)
            else:
                # Smooth antialiased gradient between 80 and 220
                alpha = int(255 * (220 - lum) / 140.0)
                out_pixels[x, y] = (0, 0, 0, alpha)

    # Save PNG
    rgba.save(dest_png_path, "PNG", optimize=True)
    print(f"Saved PNG mask to {dest_png_path}")

    # Generate base64 string
    with open(dest_png_path, "rb") as f:
        b64_str = base64.b64encode(f.read()).decode("utf-8")

    with open(dest_b64_path, "w") as f:
        f.write(b64_str)
    print(f"Saved base64 string ({len(b64_str)} chars) to {dest_b64_path}")

if __name__ == "__main__":
    main()
