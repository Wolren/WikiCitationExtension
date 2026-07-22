"""Generate PNG extension icons from the SVG design."""
from PIL import Image, ImageDraw, ImageFont
import os, sys

SIZES = [16, 48, 128]
COLOR = "#3366cc"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public")

def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded rect background
    r = max(2, size // 8)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=r, fill=COLOR)

    # White "W" letter
    font_size = int(size * 0.7)
    try:
        font = ImageFont.truetype("Arial.ttf", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("arial.ttf", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), "W", font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    draw.text((x, y), "W", fill="white", font=font)

    return img

def main():
    for size in SIZES:
        img = make_icon(size)
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        img.save(path, "PNG")
        print(f"Created {path} ({size}x{size})")

    # Also generate 128px as icon.png (fallback)
    img128 = make_icon(128)
    path128 = os.path.join(OUT_DIR, "icon.png")
    img128.save(path128, "PNG")
    print(f"Created {path128}")

if __name__ == "__main__":
    main()
