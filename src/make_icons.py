"""Make the web app's icons from one square-ish source image.

Usage (from the repository root):
    npm run icons                          # = python3 src/make_icons.py scratch/RCL.png
    python3 src/make_icons.py PATH/TO/IMAGE

Needs Pillow (`pip install pillow`); the build itself does not. Writes to
src/web/icons/ (committed):

    favicon-16.png, favicon-32.png   browser tab icons (transparent background)
    icon-192.png                     larger icon, e.g. Android home screen (transparent)
    apple-touch-icon.png             180x180, opaque (iOS shows transparency as black)

`npm run build` embeds all four in dist/rcl.html as data URIs.

The near-white background around the artwork is made transparent (flood-filled
from the edges, so white areas inside the artwork are kept), the artwork is
cropped to its bounding box and centred on a square canvas.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "web", "icons")
DEFAULT_SOURCE = os.path.join(ROOT, "scratch", "RCL.png")

PNG_SIZES = {"favicon-16.png": 16, "favicon-32.png": 32, "icon-192.png": 192}
APPLE = ("apple-touch-icon.png", 180)


def remove_background(im, threshold=40, key=(255, 0, 255)):
    """RGBA copy of `im` with the near-white background (touching the edges) made transparent."""
    from PIL import Image, ImageDraw
    rgb = im.convert("RGB")
    w, h = rgb.size
    marked = rgb.copy()
    step = max(1, min(w, h) // 32)
    seeds = [(x, y) for x in range(0, w, step) for y in (0, h - 1)] + \
            [(x, y) for y in range(0, h, step) for x in (0, w - 1)]
    for seed in seeds:
        r, g, b = marked.getpixel(seed)
        if (r, g, b) != key and min(r, g, b) >= 255 - threshold:
            ImageDraw.floodfill(marked, seed, key, thresh=threshold)
    # Alpha: 0 where the flood reached, 255 elsewhere.
    px = marked.load()
    alpha = Image.new("L", (w, h), 255)
    apx = alpha.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == key:
                apx[x, y] = 0
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def square(im, margin=0.04):
    """Crop to the visible artwork and centre it on a transparent square canvas."""
    from PIL import Image
    box = im.getchannel("A").getbbox() or (0, 0) + im.size
    art = im.crop(box)
    side = int(max(art.size) * (1 + 2 * margin))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)
    return canvas


def make_icons(source, out_dir=OUT):
    from PIL import Image
    master = square(remove_background(Image.open(source)))
    os.makedirs(out_dir, exist_ok=True)
    written = []
    for name, size in PNG_SIZES.items():
        path = os.path.join(out_dir, name)
        master.resize((size, size), Image.LANCZOS).save(path, optimize=True)
        written.append(path)
    name, size = APPLE
    opaque = Image.new("RGBA", master.size, (255, 255, 255, 255))
    opaque.alpha_composite(master)
    path = os.path.join(out_dir, name)
    opaque.convert("RGB").resize((size, size), Image.LANCZOS).save(path, optimize=True)
    written.append(path)
    return written


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    source = argv[0] if argv else DEFAULT_SOURCE
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("make_icons needs Pillow: pip install pillow", file=sys.stderr)
        return 1
    if not os.path.exists(source):
        print(f"no such image: {source}", file=sys.stderr)
        return 1
    for path in make_icons(source):
        print(f"wrote {os.path.relpath(path, ROOT)} ({os.path.getsize(path):,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
