import os
from PIL import Image

def make_square(img):
    # Ensure it's in RGBA mode for transparency
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    
    max_side = max(img.size)
    # Create transparent square canvas
    square_img = Image.new("RGBA", (max_side, max_side), (0, 0, 0, 0))
    # Calculate offsets to center the image
    offset_x = (max_side - img.size[0]) // 2
    offset_y = (max_side - img.size[1]) // 2
    # Paste original image
    square_img.paste(img, (offset_x, offset_y), img)
    return square_img

def resize_logo():
    src_path = "/Users/atulgrover/Desktop/HAYAGRIVA/resources/resources/hayagriva.png"
    dest_dir = "/Users/atulgrover/Desktop/HAYAGRIVA/resources/resources"
    
    if not os.path.exists(src_path):
        print(f"Error: Source image {src_path} not found.")
        return
        
    try:
        raw_img = Image.open(src_path)
        print(f"Loaded source image {src_path} ({raw_img.size[0]}x{raw_img.size[1]})")
        
        # Center in a square transparent canvas to preserve aspect ratio
        img = make_square(raw_img)
        print(f"Squared image to ({img.size[0]}x{img.size[1]})")
        
        # 128x128px
        small_img = img.resize((128, 128), Image.Resampling.LANCZOS)
        small_img.save(os.path.join(dest_dir, "hayagriva_small.png"), "PNG")
        print("Created: hayagriva_small.png (128x128)")
        
        # 256x256px
        med_img = img.resize((256, 256), Image.Resampling.LANCZOS)
        med_img.save(os.path.join(dest_dir, "hayagriva_medium.png"), "PNG")
        print("Created: hayagriva_medium.png (256x256)")
        
        # 512x512px
        large_img = img.resize((512, 512), Image.Resampling.LANCZOS)
        large_img.save(os.path.join(dest_dir, "hayagriva_large.png"), "PNG")
        print("Created: hayagriva_large.png (512x512)")
        
        print("Logo resizing completed successfully!")
    except Exception as e:
        print(f"An error occurred during resizing: {e}")

if __name__ == "__main__":
    resize_logo()
