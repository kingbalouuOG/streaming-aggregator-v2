"""
Regenerate Android launcher icons from the brand export.

Run once after dropping new brand PNGs into Downloads, or whenever the
mark changes. Produces:

  mipmap-{d}/ic_launcher.png         — legacy square (rounded mark, transparent corners)
  mipmap-{d}/ic_launcher_round.png   — legacy round (circle-masked)
  mipmap-{d}/ic_launcher_foreground.png — adaptive foreground (maskable, full-bleed)
  mipmap-{d}/ic_launcher_background.png — adaptive background (solid ink)

The adaptive XMLs are rewritten to drop the 16.7% inset since the
maskable source already bakes in its safe zone.
"""
from PIL import Image, ImageDraw
from pathlib import Path

SRC = Path("C:/Users/User/Downloads/Videx (2)/logo-export/png")
RES = Path("c:/Users/User/Documents/Code/StreamingAggregatorV2/android/app/src/main/res")

# (density, legacy size, adaptive canvas size)
DENSITIES = [
    ("ldpi", 36, 81),
    ("mdpi", 48, 108),
    ("hdpi", 72, 162),
    ("xhdpi", 96, 216),
    ("xxhdpi", 144, 324),
    ("xxxhdpi", 192, 432),
]

INK = (10, 10, 15, 255)

rounded = Image.open(SRC / "icon-1024.png").convert("RGBA")
maskable = Image.open(SRC / "maskable-512.png").convert("RGBA")


def circle_mask(im: Image.Image) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, im.size[0], im.size[1]), fill=255)
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


for d, legacy, canvas in DENSITIES:
    folder = RES / f"mipmap-{d}"
    legacy_im = rounded.resize((legacy, legacy), Image.LANCZOS)
    legacy_im.save(folder / "ic_launcher.png")
    circle_mask(legacy_im).save(folder / "ic_launcher_round.png")
    maskable.resize((canvas, canvas), Image.LANCZOS).save(folder / "ic_launcher_foreground.png")
    Image.new("RGBA", (canvas, canvas), INK).save(folder / "ic_launcher_background.png")
    print(f"  {d}: legacy {legacy} · adaptive {canvas}")

print("done")
