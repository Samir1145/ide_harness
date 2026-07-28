#!/usr/bin/env python3
"""
Canonical Branding & Logo Asset Processor for Hayagriva.
Source of Truth: branding/hayagriva_logo.png (User-updated Master Logo)
"""

import os
import base64
import subprocess
import shutil
import re
from PIL import Image, ImageOps

repo_root = "/Users/atulgrover/Desktop/HAYAGRIVA"
master_logo_path = os.path.join(repo_root, "branding/hayagriva_logo.png")
resources_dir = os.path.join(repo_root, "branding/resources")

def process_branding():
    if not os.path.exists(master_logo_path):
        print(f"[ERROR] Master logo file not found at {master_logo_path}")
        return

    print(f"[Branding Processor] Processing master logo: {master_logo_path}...")
    orig_img = Image.open(master_logo_path).convert("RGBA")
    width, height = orig_img.size
    print(f"Master dimensions: {width}x{height}")

    # Copy master logo to backend assets
    os.makedirs(os.path.join(repo_root, "backend/lib/assets"), exist_ok=True)
    orig_img.save(os.path.join(repo_root, "backend/lib/assets/logo.png"))

    # Convert grayscale -> invert luminance for alpha channel
    gray = orig_img.convert("L")
    alpha = ImageOps.invert(gray)

    # 1. Generate white-on-transparent logo (for dark themes & splash loaders)
    white_logo = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    white_logo.putalpha(alpha)
    os.makedirs(resources_dir, exist_ok=True)
    white_logo_path = os.path.join(resources_dir, "logo_white.png")
    white_logo.save(white_logo_path, "PNG")

    # 2. Generate dark-on-transparent logo (for light themes)
    black_logo = Image.new("RGBA", (width, height), (20, 20, 20, 0))
    black_logo.putalpha(alpha)
    black_logo_path = os.path.join(resources_dir, "logo_black.png")
    black_logo.save(black_logo_path, "PNG")

    # Save Base64 text string of white logo for SVG masks & HTML preload
    with open(white_logo_path, "rb") as f:
        base64_white = base64.b64encode(f.read()).decode("utf-8")
    with open(os.path.join(resources_dir, "logo_white_base64.txt"), "w") as f:
        f.write(base64_white)

    # 3. Extract square centered deity icon (512x512)
    side = min(width, height)
    left_offset = (width - side) // 2
    crop_box = (left_offset, 0, left_offset + side, side)

    cropped_alpha = alpha.crop(crop_box).resize((512, 512), Image.Resampling.LANCZOS)
    
    white_icon_512 = Image.new("RGBA", (512, 512), (255, 255, 255, 0))
    white_icon_512.putalpha(cropped_alpha)
    white_icon_512.save(os.path.join(resources_dir, "icon_white_512.png"), "PNG")

    black_icon_512 = Image.new("RGBA", (512, 512), (20, 20, 20, 0))
    black_icon_512.putalpha(cropped_alpha)
    black_icon_512.save(os.path.join(resources_dir, "icon_black_512.png"), "PNG")
    black_icon_512.save(os.path.join(repo_root, "backend/lib/assets/icon.png"), "PNG")

    # 4. Update preload.html
    preload_path = os.path.join(resources_dir, "preload.html")
    if os.path.exists(preload_path):
        with open(preload_path, "r", encoding="utf-8") as f:
            content = f.read()
        content = re.sub(r'<img id="spinner"[\s\S]*?\/>', f'<img id="spinner" src="data:image/png;base64,{base64_white}" alt="Hayagriva Logo" />', content)
        with open(preload_path, "w", encoding="utf-8") as f:
            f.write(content)

    # 5. Update TheiaIDESplash.svg
    splash_svg = f"""<?xml version="1.1" encoding="UTF-8" standalone="no"?>
<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1160 484" width="445.5" height="186">
  <defs>
    <mask id="logo-mask">
      <image href="data:image/png;base64,{base64_white}" x="0" y="0" width="1160" height="484" />
    </mask>
  </defs>
  <rect x="0" y="0" width="1160" height="484" fill="#ffffff" mask="url(#logo-mask)" />
</svg>"""

    splash_path = os.path.join(resources_dir, "TheiaIDESplash.svg")
    with open(splash_path, "w", encoding="utf-8") as f:
        f.write(splash_svg)

    splash_targets = [
        os.path.join(repo_root, "frontend/applications/electron/resources/TheiaIDESplash.svg"),
        os.path.join(repo_root, "frontend/applications/browser/resources/TheiaIDESplash.svg"),
        os.path.join(repo_root, "frontend/applications/electron-next/resources/TheiaIDESplash.svg")
    ]
    for target in splash_targets:
        if os.path.exists(os.path.dirname(target)):
            with open(target, "w", encoding="utf-8") as f:
                f.write(splash_svg)

    # 6. Patch frontend/theia-extensions/hayagriva/src/browser/extension.ts CSS overrides
    with open(os.path.join(resources_dir, "logo_black.png"), "rb") as f:
        base64_black = base64.b64encode(f.read()).decode("utf-8")
    extension_ts_path = os.path.join(repo_root, "frontend/theia-extensions/hayagriva/src/browser/extension.ts")
    if os.path.exists(extension_ts_path):
        with open(extension_ts_path, "r", encoding="utf-8") as f:
            ext_content = f.read()
        target_marker = "svg.theia-WelcomeMessage-Logo {"
        idx = ext_content.find(target_marker)
        if idx != -1:
            bg_marker = "background-image: url('data:image/png;base64,"
            bg_idx = ext_content.find(bg_marker, idx)
            if bg_idx != -1:
                start_data = bg_idx + len(bg_marker)
                end_data = ext_content.find("');", start_data)
                if end_data != -1:
                    new_ext_content = ext_content[:start_data] + base64_black + ext_content[end_data:]
                    with open(extension_ts_path, "w", encoding="utf-8") as f:
                        f.write(new_ext_content)
                    print("Updated base64 dark logo in extension.ts WelcomeMessage-Logo CSS override!")

    # 7. Synchronize product extension icons
    product_icons_dir = os.path.join(repo_root, "frontend/theia-extensions/product/src/browser/icons")
    if os.path.exists(product_icons_dir):
        black_logo.save(os.path.join(product_icons_dir, "TheiaIDE.png"), "PNG")
        white_logo.save(os.path.join(product_icons_dir, "TheiaIDE-next.png"), "PNG")
        black_icon_512.save(os.path.join(product_icons_dir, "512-512.png"), "PNG")
        white_icon_512.save(os.path.join(product_icons_dir, "512-512-next.png"), "PNG")

    icon_destinations = [
        os.path.join(repo_root, "frontend/applications/electron/resources/icon.png"),
        os.path.join(repo_root, "frontend/applications/browser/resources/icon.png"),
        os.path.join(resources_dir, "icons/512x512.png"),
        os.path.join(resources_dir, "icons/WindowIcon/512-512.png"),
        os.path.join(resources_dir, "icons/LinuxLauncherIcons/512x512.png"),
        os.path.join(repo_root, "frontend/applications/electron/resources/icons/MacLauncherIcons/icon.icon/Assets/icon.png"),
        os.path.join(resources_dir, "icons/MacLauncherIcons/icon.icon/Assets/icon.png"),
    ]
    for dest in icon_destinations:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        black_icon_512.save(dest, "PNG")

    # Generate JPG assets for Theia Light BG / Dark BG
    jpg_bg_light = Image.new("RGB", (512, 512), (255, 255, 255))
    jpg_bg_light.paste(black_icon_512, (0, 0), black_icon_512)
    jpg_bg_dark = Image.new("RGB", (512, 512), (30, 30, 30))
    jpg_bg_dark.paste(white_icon_512, (0, 0), white_icon_512)

    jpg_destinations = [
        (jpg_bg_light, os.path.join(repo_root, "frontend/applications/electron/resources/icons/MacLauncherIcons/icon.icon/Assets/Theia Light BG.jpg")),
        (jpg_bg_dark, os.path.join(repo_root, "frontend/applications/electron/resources/icons/MacLauncherIcons/icon.icon/Assets/Theia Dark BG.jpg")),
        (jpg_bg_light, os.path.join(resources_dir, "icons/MacLauncherIcons/icon.icon/Assets/Theia Light BG.jpg")),
        (jpg_bg_dark, os.path.join(resources_dir, "icons/MacLauncherIcons/icon.icon/Assets/Theia Dark BG.jpg")),
    ]
    for img, dest in jpg_destinations:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        img.save(dest, "JPEG")

    # 8. Generate native macOS .icns icons
    tmp_iconset = os.path.join(resources_dir, ".hayagriva_tmp.iconset")
    if os.path.exists(tmp_iconset):
        shutil.rmtree(tmp_iconset)
    os.makedirs(tmp_iconset, exist_ok=True)

    sizes = [16, 32, 64, 128, 256, 512]
    for sz in sizes:
        resized = black_icon_512.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(tmp_iconset, f"icon_{sz}x{sz}.png"), "PNG")
        resized_2x = black_icon_512.resize((sz * 2, sz * 2), Image.Resampling.LANCZOS)
        resized_2x.save(os.path.join(tmp_iconset, f"icon_{sz}x{sz}@2x.png"), "PNG")

    icns_output_path = os.path.join(repo_root, "Hayagriva.app/Contents/Resources/hayagriva.icns")
    electron_icns = os.path.join(repo_root, "frontend/applications/electron/resources/icon.icns")
    electron_mac_icns = os.path.join(repo_root, "frontend/applications/electron/resources/icons/MacLauncherIcons/icon.icns")
    browser_icns = os.path.join(repo_root, "frontend/applications/browser/resources/icon.icns")
    branding_mac_icns = os.path.join(resources_dir, "icons/MacLauncherIcons/icon.icns")
    branding_icns = os.path.join(resources_dir, "icon.icns")

    try:
        subprocess.run(["iconutil", "-c", "icns", tmp_iconset, "-o", icns_output_path], check=True)
        shutil.copyfile(icns_output_path, electron_icns)
        shutil.copyfile(icns_output_path, electron_mac_icns)
        shutil.copyfile(icns_output_path, browser_icns)
        shutil.copyfile(icns_output_path, branding_mac_icns)
        shutil.copyfile(icns_output_path, branding_icns)
        print(f"Generated macOS .icns icon file at {icns_output_path}")
    except Exception as e:
        print(f"iconutil note: {e}")
    finally:
        shutil.rmtree(tmp_iconset, ignore_errors=True)

    print("✓ All branding assets successfully compiled from master logo!")

if __name__ == "__main__":
    process_branding()
