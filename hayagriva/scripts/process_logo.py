import os
from PIL import Image

def process_image(src_path, mode):
    img = Image.open(src_path)
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    
    datas = img.getdata()
    newData = []
    
    for item in datas:
        r, g, b, a = item
        # Calculate brightness (grayscale value)
        brightness = (r + g + b) // 3
        
        if mode == "white_on_transparent":
            # If the pixel is near-white, make it transparent
            if brightness > 220:
                newData.append((0, 0, 0, 0))
            else:
                # Invert dark lines to white. Keep intermediate shading as transparency
                alpha = int(255 * (1.0 - (brightness / 255.0)))
                # Prevent negative or overflow
                alpha = max(0, min(255, alpha))
                # Boost alpha slightly for better visibility
                alpha = min(255, int(alpha * 1.2))
                newData.append((243, 243, 243, alpha))
                
        elif mode == "black_on_transparent":
            # If the pixel is near-white, make it transparent
            if brightness > 220:
                newData.append((0, 0, 0, 0))
            else:
                # Keep dark lines as black/dark gray, make it transparent elsewhere
                alpha = int(255 * (1.0 - (brightness / 255.0)))
                alpha = max(0, min(255, alpha))
                alpha = min(255, int(alpha * 1.2))
                newData.append((30, 30, 30, alpha))
                
        else:
            # Fallback: keep original
            newData.append(item)
            
    img.putdata(newData)
    return img

def make_square(img):
    max_side = max(img.size)
    square_img = Image.new("RGBA", (max_side, max_side), (0, 0, 0, 0))
    offset_x = (max_side - img.size[0]) // 2
    offset_y = (max_side - img.size[1]) // 2
    square_img.paste(img, (offset_x, offset_y), img)
    return square_img

def main():
    src_path = "/Users/atulgrover/Desktop/HAYAGRIVA/resources/resources/hayagriva.png"
    dest_dir = "/Users/atulgrover/Desktop/HAYAGRIVA/resources/resources"
    
    if not os.path.exists(src_path):
        print(f"Error: Source image {src_path} not found.")
        return
        
    print(f"[Logo Processor] Processing {src_path}...")
    
    # Generate white-on-transparent
    white_img = process_image(src_path, "white_on_transparent")
    white_square = make_square(white_img)
    
    # Generate black-on-transparent
    black_img = process_image(src_path, "black_on_transparent")
    black_square = make_square(black_img)
    
    # Save the processed original square sizes
    # Small (128x128)
    white_square.resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(dest_dir, "hayagriva_small.png"), "PNG")
    print("Created: hayagriva_small.png (white-on-transparent 128x128)")
    
    # Medium (256x256)
    white_square.resize((256, 256), Image.Resampling.LANCZOS).save(os.path.join(dest_dir, "hayagriva_medium.png"), "PNG")
    print("Created: hayagriva_medium.png (white-on-transparent 256x256)")
    
    # Large (512x512)
    white_square.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(dest_dir, "hayagriva_large.png"), "PNG")
    print("Created: hayagriva_large.png (white-on-transparent 512x512)")
    
    # Also save the black large for black icon targets
    black_large_path = os.path.join(dest_dir, "hayagriva_large_black.png")
    black_square.resize((512, 512), Image.Resampling.LANCZOS).save(black_large_path, "PNG")
    print("Created: hayagriva_large_black.png (black-on-transparent 512x512)")
    
    print("[Logo Processor] Completed processing successfully!")

if __name__ == "__main__":
    main()
