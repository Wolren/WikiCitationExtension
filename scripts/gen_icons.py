"""Generate WikiCitationExtension icon set.

Design: rounded Wikipedia-blue square (#3366CC) with a heavy white
closing quote glyph (U+201D, Arial Black, same as Wikipedia's citation
icon) centered both ways.

PNGs are rendered at 1024px and downscaled with LANCZOS for clean AA.
The SVG master is built from the same Arial Black glyph via fontTools,
positioned to match the measured ink bbox of the rendered PNG, so
vector and raster can never drift.
"""
from PIL import Image, ImageDraw, ImageFont
import numpy as np

S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Background: rounded rect, Wikipedia blue
radius = int(S * 0.22)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill="#3366CC")

# Quotation mark: heavy single closing quote (U+201D), like Wikipedia's citation icon
FONT_PATH = r"C:\Windows\Fonts\ariblk.ttf"
FONT_SIZE = 1.02
font = ImageFont.truetype(FONT_PATH, int(S * FONT_SIZE))
glyph = "\u201d"
d.text((0, 0), glyph, font=font, fill="#FFFFFF")

# Measure actual white-ink bbox (Pillow textbbox returns the line box, not ink)
arr = np.array(img)
white = (arr[:, :, 0] > 200) & (arr[:, :, 1] > 200) & (arr[:, :, 2] > 200)
ys, xs = np.where(white)
ink_x0, ink_x1 = xs.min(), xs.max()
ink_y0, ink_y1 = ys.min(), ys.max()
ink_w = ink_x1 - ink_x0 + 1
ink_h = ink_y1 - ink_y0 + 1

# Re-render with the ink box exactly centered
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius, fill="#3366CC")
d.text((int((S - ink_w) / 2 - ink_x0), int((S - ink_h) / 2 - ink_y0)), glyph, font=font, fill="#FFFFFF")

out = {
    "public/icon128.png": 128,
    "public/icon48.png": 48,
    "public/icon16.png": 16,
    "public/icon.png": 128,
}
for path, size in out.items():
    img.resize((size, size), Image.LANCZOS).save(path)
print("generated", ", ".join(out))

# ---- SVG master: same glyph, same placement ----
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

font_file = TTFont(FONT_PATH)
glyph_name = font_file.getBestCmap()[0x201D]
glyphset = font_file.getGlyphSet()
g = font_file["glyf"][glyph_name]
gx_units, gy_units = g.xMin, g.yMin
gw_units, gh_units = g.xMax - g.xMin, g.yMax - g.yMin

vb = 48.0
s = ink_w / gw_units * vb / S
tx = (S - ink_w) / 2 * vb / S - gx_units * s
ty = (S - ink_h) / 2 * vb / S + (gy_units + gh_units) * s

pen = SVGPathPen(glyphset)
# fontTools applies the LAST chained transform to the point first, so
# translate() must come before scale() to get x' = x*s + tx, y' = -y*s + ty
tpen = TransformPen(pen, Transform().translate(tx, ty).scale(s, -s))
glyphset[glyph_name].draw(tpen)
path_d = pen.getCommands()

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="10.56" fill="#3366CC"/>
  <path d="{path_d}" fill="#FFFFFF"/>
</svg>
'''
with open("public/icon.svg", "w", encoding="utf-8") as f:
    f.write(svg)
print(f"wrote public/icon.svg (ink {ink_w}x{ink_h} at {ink_x0},{ink_y0})")
