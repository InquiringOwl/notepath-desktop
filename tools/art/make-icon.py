# Draws NotePath's placeholder icon (until Devon supplies a logo): build/icon.png (1024) and app/brand/np-mark-64.png (top bar).
# A console-style note page (chamfered corner like Inquire's windows) with a lit path of nodes across it, on Deep Space.
# Run: python3 tools/art/make-icon.py   (needs Pillow)
from PIL import Image, ImageDraw, ImageFilter
import os, math
R = os.path.join(os.path.dirname(__file__), '..', '..')
S = 2048  # drawn at 2x, then shrunk for smooth edges
CY = (92, 200, 224); VI = (180, 155, 255); AM = (242, 184, 75)
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def icon(size_out, plate=True):
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if plate:
        bg = Image.new('RGBA', (S, S))
        px = bg.load()
        for y in range(0, S, 4):
            for x in range(0, S, 4):
                d1 = math.hypot(x - S * .78, y - S * .05) / (S * .9); d2 = math.hypot(x + S * .1, y - S * 1.1) / (S * .8)
                c = (7, 10, 16)
                c = lerp(c, (20, 52, 66), max(0, 1 - d1) ** 1.6)
                c = lerp(c, (40, 30, 70), max(0, 1 - d2) ** 1.8 * .8)
                for dy in range(4):
                    for dx in range(4): px[x + dx, y + dy] = c + (255,)
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([int(S * .06)] * 2 + [int(S * .94)] * 2, radius=int(S * .2), fill=255)
        img.paste(bg, (0, 0), mask)
        d = ImageDraw.Draw(img)
        d.rounded_rectangle([int(S * .06)] * 2 + [int(S * .94)] * 2, radius=int(S * .2), outline=(52, 68, 95, 255), width=int(S * .006))
    k = .84 if plate else 1.0  # page area
    o = (1 - k) / 2
    P = lambda x, y: (S * (o + k * x), S * (o + k * y))
    # the page: chamfered top-right corner (folded), thin frame
    page = [P(.2, .14), P(.66, .14), P(.82, .3), P(.82, .86), P(.2, .86)]
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    g.polygon(page, fill=(17, 24, 39, 235))
    wpx = S * .018 * k
    for a, b in zip(page, page[1:] + page[:1]): g.line([a, b], fill=CY + (255,), width=int(wpx))
    for q in page: g.ellipse([q[0] - wpx / 2, q[1] - wpx / 2, q[0] + wpx / 2, q[1] + wpx / 2], fill=CY + (255,))
    g.line([P(.66, .14), P(.66, .3), P(.82, .3)], fill=CY + (200,), width=int(S * .012 * k))
    # text lines on the page
    for i, (y, w) in enumerate([(.42, .44), (.53, .36), (.64, .16)]):
        g.rounded_rectangle([P(.3, y)[0], P(.3, y)[1] - S * .012 * k, P(.3 + w, y)[0], P(.3, y)[1] + S * .012 * k], radius=int(S * .012 * k), fill=(139, 151, 174, 200))
    # the path: a smooth trail of dots from the bottom left, curving across the page to one lit node
    def bez(t, p0, p1, p2, p3): return tuple((1-t)**3*p0[i] + 3*(1-t)**2*t*p1[i] + 3*(1-t)*t*t*p2[i] + t**3*p3[i] for i in range(2))
    c = [P(.1, .95), P(.45, .98), P(.3, .62), P(.7, .6)]
    dots = [bez(i / 9, *c) for i in range(10)]
    halo = Image.new('RGBA', (S, S), (0, 0, 0, 0)); hd = ImageDraw.Draw(halo)
    end = dots[-1]; R0 = S * .075 * k
    hd.ellipse([end[0] - R0, end[1] - R0, end[0] + R0, end[1] + R0], fill=AM + (255,))
    halo = halo.filter(ImageFilter.GaussianBlur(S * .03))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(S * .02)))
    img = Image.alpha_composite(img, glow)
    img = Image.alpha_composite(img, Image.eval(halo, lambda v: int(v * .7)))
    d = ImageDraw.Draw(img)
    for i, q in enumerate(dots[:-1]):
        r = S * (.011 + .009 * i / 8) * k
        d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], fill=AM + (int(110 + 145 * i / 8),))
    r = S * .04 * k
    d.ellipse([end[0] - r, end[1] - r, end[0] + r, end[1] + r], fill=(255, 236, 190, 255), outline=AM + (255,), width=int(S * .01 * k))
    return img.resize((size_out, size_out), Image.LANCZOS)

os.makedirs(os.path.join(R, 'build'), exist_ok=True); os.makedirs(os.path.join(R, 'app', 'brand'), exist_ok=True)
icon(1024).save(os.path.join(R, 'build', 'icon.png'))
icon(64, plate=False).save(os.path.join(R, 'app', 'brand', 'np-mark-64.png'))
icon(128, plate=False).save(os.path.join(R, 'app', 'brand', 'np-mark-128.png'))
print('icon.png, np-mark-64.png, np-mark-128.png')
