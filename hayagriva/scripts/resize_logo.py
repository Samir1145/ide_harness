import os
from PIL import Image

def resize_logo():
    src_path = "/Users/atulgrover/Desktop/HAYAGRIVA/resources/resources/hayagriva.png"
    dest_dir = "/Users/atulgrover/Desktop/HAYAGRIVA/resources/resources"
    
    if not os.path.exists(src_path):
        print(f"Error: Source image {src_path} not found.")
        return
        
    try:
        img = Image.open(src_path)
        print(f"Loaded source image {src_path} ({img.size[0]}x{img.size[1]})")
        
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
