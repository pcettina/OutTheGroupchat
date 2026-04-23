"""Render 5 OTG logo concepts per docs/design/workflows/brand-identity.md.

Each concept: wordmark + mark-only + per-concept contact sheet.
Then a grand contact sheet showing all 5.

Rendered at 2x then downscaled with LANCZOS for crisp edges.
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------- constants ----------

HERE = Path(__file__).resolve().parent
FONTS = Path(
    r"C:\Users\patce\AppData\Roaming\Claude\local-agent-mode-sessions"
    r"\skills-plugin\8a609f09-47b4-4bfd-8c14-7a477ee34a44"
    r"\04901349-0b20-42a2-a1e3-728af49562bf\skills\canvas-design\canvas-fonts"
)

SODIUM     = (0xFF, 0x6B, 0x4A)
BOURBON    = (0xFF, 0xB3, 0x47)
BRICK      = (0x7A, 0x2C, 0x1A)
TILE       = (0x5F, 0xB3, 0xA8)
MARASCHINO = (0x3A, 0x1F, 0x2B)
BG_DARK    = (0x15, 0x11, 0x0E)
BG_LIGHT   = (0xFA, 0xF3, 0xE7)
TEXT_BRIGHT = (0xF5, 0xEB, 0xDD)
TEXT_DIM    = (0x8B, 0x7E, 0x6F)
BORDER_COL  = (0x2B, 0x22, 0x1C)

SCALE = 2   # render at 2x then downscale
OUT = HERE


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size * SCALE)


def new_canvas(w: int, h: int, bg: tuple[int, int, int] = BG_DARK) -> Image.Image:
    return Image.new("RGB", (w * SCALE, h * SCALE), bg)


def finalize(img: Image.Image, target_wh: tuple[int, int]) -> Image.Image:
    return img.resize(target_wh, Image.Resampling.LANCZOS)


def save(img: Image.Image, name: str, size_hint: tuple[int, int]) -> Path:
    path = OUT / name
    finalize(img, size_hint).save(path, "PNG", optimize=True)
    return path


def text_bbox(drw: ImageDraw.ImageDraw, txt: str, f: ImageFont.FreeTypeFont) -> tuple[int, int, int, int]:
    return drw.textbbox((0, 0), txt, font=f)


# ---------- concept 1: MARQUEE LETTER ----------

def render_c1_wordmark() -> None:
    """OutTheGroupchat, BricolageGrotesque Bold, sodium on warm-black, subtle glow."""
    W, H = 1600, 800
    img = new_canvas(W, H)
    drw = ImageDraw.Draw(img)

    word = "OutTheGroupchat"
    f = font("BricolageGrotesque-Bold.ttf", 150)

    x0, y0, x1, y1 = text_bbox(drw, word, f)
    tw, th = x1 - x0, y1 - y0

    cx = (W * SCALE) // 2
    cy = (H * SCALE) // 2
    tx = cx - tw // 2 - x0
    ty = cy - th // 2 - y0

    # soft marquee bloom — draw blurred orange behind text
    glow_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gdrw = ImageDraw.Draw(glow_layer)
    gdrw.text((tx, ty), word, font=f, fill=(*SODIUM, 180))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=18 * SCALE))
    img.paste(glow_layer, (0, 0), glow_layer)

    # crisp text on top
    drw = ImageDraw.Draw(img)
    drw.text((tx, ty), word, font=f, fill=SODIUM)

    # subtle slab accent line beneath T, h, G terminals — suggest hand-set marquee
    cursor = tx
    positions: dict[str, int] = {}
    for ch in word:
        w_this = drw.textlength(ch, font=f)
        if ch == "T" and "T" not in positions:
            positions["T"] = int(cursor + w_this / 2)
        if ch == "h" and "h" not in positions:
            positions["h"] = int(cursor + w_this / 2)
        if ch == "G" and "G" not in positions:
            positions["G"] = int(cursor + w_this / 2)
        cursor += w_this

    # tiny slab marks just beneath baseline at T, h, G positions
    bl = ty + y1 + 14 * SCALE
    for key in ("T", "h", "G"):
        if key not in positions:
            continue
        cx_mark = positions[key]
        drw.rectangle(
            [cx_mark - 18 * SCALE, bl, cx_mark + 18 * SCALE, bl + 6 * SCALE],
            fill=SODIUM,
        )

    # faint hairline frame (bodega marquee edge)
    pad = 40 * SCALE
    drw.rectangle(
        [pad, pad, W * SCALE - pad, H * SCALE - pad],
        outline=BORDER_COL,
        width=2 * SCALE,
    )

    save(img, "concept-1-marquee-letter-wordmark.png", (W, H))


def render_c1_mark() -> None:
    """Big O with sodium-bulb glow behind — marquee letter, bulb lit."""
    S = 800
    img = new_canvas(S, S)
    drw = ImageDraw.Draw(img)

    cx, cy = (S * SCALE) // 2, (S * SCALE) // 2

    # radial bulb glow — heavier blur so rings blend into smooth halo
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gdrw = ImageDraw.Draw(glow)
    for r, a in [(360, 22), (280, 42), (210, 70), (150, 100), (100, 140), (60, 180)]:
        gdrw.ellipse(
            [cx - r * SCALE, cy - r * SCALE, cx + r * SCALE, cy + r * SCALE],
            fill=(*SODIUM, a),
        )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=32 * SCALE))
    img.paste(glow, (0, 0), glow)

    # the letter O
    f = font("BricolageGrotesque-Bold.ttf", 440)
    drw = ImageDraw.Draw(img)
    x0, y0, x1, y1 = text_bbox(drw, "O", f)
    tw, th = x1 - x0, y1 - y0
    drw.text((cx - tw // 2 - x0, cy - th // 2 - y0), "O", font=f, fill=SODIUM)

    save(img, "concept-1-marquee-letter-mark.png", (S, S))


# ---------- concept 2: PIN-DROP ----------

def render_c2_wordmark() -> None:
    """Sodium pin (mark) + restrained lowercase 'outthegroupchat' wordmark."""
    W, H = 1600, 800
    img = new_canvas(W, H)

    # pin on left
    pin_cx = 420 * SCALE
    pin_cy = (H * SCALE) // 2
    _draw_pin(img, pin_cx, pin_cy, head_r=120 * SCALE, tail_len=180 * SCALE)

    # wordmark right
    drw = ImageDraw.Draw(img)
    word = "outthegroupchat"
    f = font("InstrumentSans-Regular.ttf", 96)
    x0, y0, x1, y1 = text_bbox(drw, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 650 * SCALE - x0
    ty = pin_cy - th // 2 - y0
    drw.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    # tiny kicker below — "nyc. tonight."
    kf = font("InstrumentSans-Regular.ttf", 28)
    drw.text((tx, ty + th + 22 * SCALE), "nyc  ·  tonight", font=kf, fill=TEXT_DIM)

    save(img, "concept-2-pin-drop-wordmark.png", (W, H))


def render_c2_mark() -> None:
    """Just the pin."""
    S = 800
    img = new_canvas(S, S)
    _draw_pin(img, (S * SCALE) // 2, (S * SCALE) // 2, head_r=180 * SCALE, tail_len=240 * SCALE)
    save(img, "concept-2-pin-drop-mark.png", (S, S))


def _draw_pin(img: Image.Image, cx: int, cy: int, head_r: int, tail_len: int) -> None:
    """Draw a location pin with sodium streetlamp glow. cy = vertical center of pin overall."""
    # pin geometry: head circle centered at (cx, cy - tail_len/2 + head_r*0.1)
    head_cy = cy - (tail_len + head_r) // 2 + head_r
    tail_tip_y = head_cy + head_r + tail_len

    # radial glow behind head
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gdrw = ImageDraw.Draw(glow)
    for r_mul, a in [(3.2, 25), (2.4, 55), (1.8, 95), (1.3, 140)]:
        r = int(head_r * r_mul)
        gdrw.ellipse([cx - r, head_cy - r, cx + r, head_cy + r], fill=(*SODIUM, a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=18 * int(head_r / 40)))
    img.paste(glow, (0, 0), glow)

    drw = ImageDraw.Draw(img)

    # pin tail — tapered triangle from head bottom to tip
    head_bottom_y = head_cy + int(head_r * 0.75)
    tail_half_top = int(head_r * 0.55)
    drw.polygon(
        [
            (cx - tail_half_top, head_bottom_y),
            (cx + tail_half_top, head_bottom_y),
            (cx, tail_tip_y),
        ],
        fill=SODIUM,
    )

    # pin head — solid sodium
    drw.ellipse(
        [cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r],
        fill=SODIUM,
    )

    # inner hole (gives pin depth, reads as bulb)
    inner_r = int(head_r * 0.38)
    drw.ellipse(
        [cx - inner_r, head_cy - inner_r, cx + inner_r, head_cy + inner_r],
        fill=BG_DARK,
    )

    # tiny specular highlight on head (bulb filament)
    spec_r = int(head_r * 0.12)
    sx, sy = cx - int(head_r * 0.35), head_cy - int(head_r * 0.35)
    drw.ellipse([sx - spec_r, sy - spec_r, sx + spec_r, sy + spec_r], fill=BOURBON)


# ---------- concept 3: CLINK ----------

def render_c3_wordmark() -> None:
    """Two overlapping circles + 'out the groupchat' with italic 'the'."""
    W, H = 1600, 800
    img = new_canvas(W, H)

    # mark on left
    mark_cx = 360 * SCALE
    mark_cy = (H * SCALE) // 2
    _draw_clink(img, mark_cx, mark_cy, r=140 * SCALE)

    # wordmark on right
    drw = ImageDraw.Draw(img)
    f_sans = font("BricolageGrotesque-Bold.ttf", 96)
    f_ital = font("InstrumentSerif-Italic.ttf", 96)

    piece1 = "out "
    piece2 = "the"
    piece3 = " groupchat"

    w1 = drw.textlength(piece1, font=f_sans)
    w2 = drw.textlength(piece2, font=f_ital)
    w3 = drw.textlength(piece3, font=f_sans)

    x0, y0, x1, y1 = text_bbox(drw, piece1 + "the" + piece3, f_sans)
    th = y1 - y0

    tx = 620 * SCALE
    ty = mark_cy - th // 2 - y0

    drw.text((tx, ty), piece1, font=f_sans, fill=TEXT_BRIGHT)
    drw.text((tx + w1, ty), piece2, font=f_ital, fill=TILE)
    drw.text((tx + w1 + w2, ty), piece3, font=f_sans, fill=TEXT_BRIGHT)

    save(img, "concept-3-clink-wordmark.png", (W, H))


def render_c3_mark() -> None:
    S = 800
    img = new_canvas(S, S)
    _draw_clink(img, (S * SCALE) // 2, (S * SCALE) // 2, r=220 * SCALE)
    save(img, "concept-3-clink-mark.png", (S, S))


def _draw_clink(img: Image.Image, cx: int, cy: int, r: int) -> None:
    """Two overlapping circles — sodium (left) + tile (right), overlap = maraschino."""
    offset = int(r * 0.65)

    # build via RGBA layers so we can compute overlap
    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))

    left = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(left)
    ld.ellipse([cx - offset - r, cy - r, cx - offset + r, cy + r], fill=(*SODIUM, 255))

    right = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(right)
    rd.ellipse([cx + offset - r, cy - r, cx + offset + r, cy + r], fill=(*TILE, 255))

    # paint sodium, then tile, then recolor overlap to maraschino
    canvas = Image.alpha_composite(canvas, left)
    canvas = Image.alpha_composite(canvas, right)

    # overlap calculation: where both original masks are opaque → maraschino
    left_mask = left.split()[3]
    right_mask = right.split()[3]
    from PIL import ImageChops

    overlap_mask = ImageChops.multiply(left_mask, right_mask).point(lambda v: 255 if v > 0 else 0)
    overlap_layer = Image.new("RGBA", img.size, (*MARASCHINO, 255))
    canvas.paste(overlap_layer, (0, 0), overlap_mask)

    img.paste(canvas, (0, 0), canvas)


# ---------- concept 4: BRACKET ----------

def render_c4_wordmark() -> None:
    """Dark square frame + bracket arm escaping right edge + wordmark."""
    W, H = 1600, 800
    img = new_canvas(W, H)
    drw = ImageDraw.Draw(img)

    # mark on left
    frame_size = 300 * SCALE
    fx = 200 * SCALE
    fy = (H * SCALE - frame_size) // 2
    _draw_bracket(drw, fx, fy, frame_size)

    # wordmark right
    word = "OutTheGroupchat"
    f = font("BricolageGrotesque-Bold.ttf", 84)
    x0, y0, x1, y1 = text_bbox(drw, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 640 * SCALE - x0
    ty = (H * SCALE) // 2 - th // 2 - y0
    drw.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    # faint "off your phone." kicker
    kf = font("InstrumentSans-Italic.ttf", 26)
    drw.text(
        (tx, ty + th + 18 * SCALE),
        "off your phone",
        font=kf,
        fill=TEXT_DIM,
    )

    save(img, "concept-4-bracket-wordmark.png", (W, H))


def render_c4_mark() -> None:
    S = 800
    img = new_canvas(S, S)
    drw = ImageDraw.Draw(img)
    frame_size = 500 * SCALE
    fx = (S * SCALE - frame_size) // 2
    fy = (S * SCALE - frame_size) // 2
    _draw_bracket(drw, fx, fy, frame_size)
    save(img, "concept-4-bracket-mark.png", (S, S))


def _draw_bracket(drw: ImageDraw.ImageDraw, fx: int, fy: int, size: int) -> None:
    """Dark square frame, chunky ] inside, arm extends past right edge."""
    # frame (rounded corners in subtle border color, thick stroke)
    stroke = max(4 * SCALE, size // 40)
    drw.rounded_rectangle(
        [fx, fy, fx + size, fy + size],
        radius=int(size * 0.08),
        outline=BORDER_COL,
        width=stroke,
    )
    # fill interior with maraschino for depth
    inner_pad = stroke // 2 + 2 * SCALE
    drw.rounded_rectangle(
        [fx + inner_pad, fy + inner_pad, fx + size - inner_pad, fy + size - inner_pad],
        radius=int(size * 0.07),
        fill=MARASCHINO,
    )

    # bracket ] — vertical bar + top + bottom arms, arms extend past right edge
    b_thick = int(size * 0.12)
    b_inner_pad = int(size * 0.18)
    # vertical bar centered-ish left
    bar_x = fx + int(size * 0.32)
    bar_top = fy + b_inner_pad
    bar_bot = fy + size - b_inner_pad
    drw.rectangle([bar_x, bar_top, bar_x + b_thick, bar_bot], fill=SODIUM)

    # top arm — extends past right edge
    arm_extend = int(size * 0.25)
    drw.rectangle(
        [bar_x, bar_top, fx + size + arm_extend, bar_top + b_thick],
        fill=SODIUM,
    )
    # bottom arm — same extension
    drw.rectangle(
        [bar_x, bar_bot - b_thick, fx + size + arm_extend, bar_bot],
        fill=SODIUM,
    )


# ---------- concept 5: RECEIPT ----------

def render_c5_wordmark() -> None:
    """Rough stamp + editorial italic wordmark."""
    W, H = 1600, 800
    img = new_canvas(W, H)

    # stamp on left
    stamp_cx = 400 * SCALE
    stamp_cy = (H * SCALE) // 2
    _draw_receipt_stamp(img, stamp_cx, stamp_cy, r=170 * SCALE)

    # wordmark right in InstrumentSerif italic
    drw = ImageDraw.Draw(img)
    word = "OutTheGroupchat"
    f = font("InstrumentSerif-Italic.ttf", 140)
    x0, y0, x1, y1 = text_bbox(drw, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 680 * SCALE - x0
    ty = stamp_cy - th // 2 - y0
    drw.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    # kicker — tiny monospace stamp date, like a receipt
    kf = font("GeistMono-Regular.ttf", 26)
    drw.text(
        (tx, ty + th + 14 * SCALE),
        "paid  ·  tuesday, 10:47 pm  ·  no. 041",
        font=kf,
        fill=TEXT_DIM,
    )

    save(img, "concept-5-receipt-wordmark.png", (W, H))


def render_c5_mark() -> None:
    S = 800
    img = new_canvas(S, S)
    _draw_receipt_stamp(img, (S * SCALE) // 2, (S * SCALE) // 2, r=280 * SCALE)
    save(img, "concept-5-receipt-mark.png", (S, S))


def _draw_receipt_stamp(img: Image.Image, cx: int, cy: int, r: int) -> None:
    """Circular stamp with ink-bleed imperfections. OTG centered. Sodium ink on warm-black."""
    rng = random.Random(420)

    stamp_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sdrw = ImageDraw.Draw(stamp_layer)

    outer_thick = max(8 * SCALE, r // 22)
    inner_thick = max(4 * SCALE, r // 40)
    inner_r = int(r * 0.72)

    # outer ring — draw as series of slightly offset arcs for ink wobble
    steps = 180
    for i in range(steps):
        a0 = (i / steps) * 360
        a1 = ((i + 1) / steps) * 360
        jitter_x = rng.randint(-2, 2) * SCALE
        jitter_y = rng.randint(-2, 2) * SCALE
        thick = outer_thick + rng.randint(-2, 2) * SCALE
        sdrw.arc(
            [cx - r + jitter_x, cy - r + jitter_y, cx + r + jitter_x, cy + r + jitter_y],
            start=a0,
            end=a1,
            fill=SODIUM,
            width=max(2 * SCALE, thick),
        )

    # inner ring
    for i in range(steps):
        a0 = (i / steps) * 360
        a1 = ((i + 1) / steps) * 360
        jitter_x = rng.randint(-1, 1) * SCALE
        jitter_y = rng.randint(-1, 1) * SCALE
        sdrw.arc(
            [cx - inner_r + jitter_x, cy - inner_r + jitter_y, cx + inner_r + jitter_x, cy + inner_r + jitter_y],
            start=a0,
            end=a1,
            fill=SODIUM,
            width=inner_thick,
        )

    # central "OTG"
    f = font("BricolageGrotesque-Bold.ttf", max(60, r // 5))
    tx0, ty0, tx1, ty1 = sdrw.textbbox((0, 0), "OTG", font=f)
    tw, th = tx1 - tx0, ty1 - ty0
    sdrw.text((cx - tw // 2 - tx0, cy - th // 2 - ty0), "OTG", font=f, fill=SODIUM)

    # tiny top-and-bottom micro-text on the ring, radial
    _draw_curved_text(
        stamp_layer, cx, cy, int((r + inner_r) / 2),
        "· meetup · meetup · meetup · meetup ·",
        font("GeistMono-Bold.ttf", max(16, r // 22)),
        SODIUM,
        start_angle=-90,
    )

    # ink bleed — scatter faint sodium dots around the stamp edges
    for _ in range(220):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(r * 0.95, r * 1.08)
        dot_r = rng.randint(1, 3) * SCALE
        dx = int(cx + rr * math.cos(a))
        dy = int(cy + rr * math.sin(a))
        alpha = rng.randint(60, 160)
        sdrw.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=(*SODIUM, alpha))

    # slight blur for ink-bleed softness
    stamp_layer = stamp_layer.filter(ImageFilter.GaussianBlur(radius=0.8 * SCALE))

    # mask out a narrow upper-right rim only — stamp lifted early,
    # applied via an annular mask so the gap affects the rings but spares the center text
    ring_mask = Image.new("L", img.size, 255)
    rmdrw = ImageDraw.Draw(ring_mask)
    rmdrw.pieslice(
        [cx - r - 10 * SCALE, cy - r - 10 * SCALE, cx + r + 10 * SCALE, cy + r + 10 * SCALE],
        start=-40, end=-5, fill=0,
    )
    # re-fill the interior circle so only the rim region is cut
    interior_r = int(inner_r * 0.85)
    rmdrw.ellipse(
        [cx - interior_r, cy - interior_r, cx + interior_r, cy + interior_r],
        fill=255,
    )
    r_ch, g_ch, b_ch, a_ch = stamp_layer.split()
    from PIL import ImageChops
    a_ch = ImageChops.multiply(a_ch, ring_mask)
    stamp_layer = Image.merge("RGBA", (r_ch, g_ch, b_ch, a_ch))

    img.paste(stamp_layer, (0, 0), stamp_layer)


def _draw_curved_text(
    layer: Image.Image,
    cx: int,
    cy: int,
    radius: int,
    text: str,
    f: ImageFont.FreeTypeFont,
    color: tuple[int, int, int],
    start_angle: float = 0,
) -> None:
    """Render text along a circle at given radius. Angle in degrees, 0 = right, -90 = top."""
    tmp_draw = ImageDraw.Draw(layer)
    total_chars = len(text)
    # approximate angular width per char using average char width
    sample_w = tmp_draw.textlength(text, font=f)
    angular_total = (sample_w / (2 * math.pi * radius)) * 360 if radius > 0 else 0
    cur_angle = start_angle - angular_total / 2

    for ch in text:
        cw = tmp_draw.textlength(ch, font=f)
        char_angle = (cw / (2 * math.pi * radius)) * 360
        theta = math.radians(cur_angle + char_angle / 2)
        x = cx + radius * math.cos(theta)
        y = cy + radius * math.sin(theta)

        # rotate glyph to be tangent to circle
        char_img = Image.new("RGBA", (int(cw * 1.6) + 20, int(f.size * 1.6)), (0, 0, 0, 0))
        cdrw = ImageDraw.Draw(char_img)
        cdrw.text((10, 5), ch, font=f, fill=(*color, 255))
        rot_deg = -(cur_angle + char_angle / 2 + 90)
        rotated = char_img.rotate(rot_deg, resample=Image.Resampling.BICUBIC, expand=True)
        layer.paste(rotated, (int(x - rotated.width / 2), int(y - rotated.height / 2)), rotated)
        cur_angle += char_angle


# ---------- contact sheets ----------

CONCEPTS: list[tuple[int, str, str]] = [
    (1, "Marquee Letter", "concept-1-marquee-letter"),
    (2, "Pin-Drop",        "concept-2-pin-drop"),
    (3, "Clink",           "concept-3-clink"),
    (4, "Bracket",         "concept-4-bracket"),
    (5, "Receipt",         "concept-5-receipt"),
]


def contact_sheet_per_concept(n: int, name: str, slug: str) -> None:
    """Per-concept: wordmark above, mark below at consistent scale."""
    W, H = 1600, 1200
    img = new_canvas(W, H)

    drw = ImageDraw.Draw(img)

    # title at top
    tf = font("InstrumentSans-Bold.ttf", 40)
    lf = font("InstrumentSans-Regular.ttf", 22)
    drw.text((60 * SCALE, 40 * SCALE), f"concept {n}  ·  {name.lower()}", font=tf, fill=TEXT_BRIGHT)
    subtitle_map = {
        1: "typography-as-logo · bodega marquee · no separate mark",
        2: "action-symbol mark + restrained lowercase · drop-pin check-in",
        3: "color-overlap-as-meeting · sodium + tile + maraschino",
        4: "architectural bracket · off-your-phone made literal",
        5: "found-object stamp · receipt-paper utility · the uncomfortable one",
    }
    drw.text((60 * SCALE, 95 * SCALE), subtitle_map.get(n, ""), font=lf, fill=TEXT_DIM)

    # wordmark panel
    word_img = Image.open(OUT / f"{slug}-wordmark.png").convert("RGB")
    word_target_w = int(1400 * SCALE)
    word_ratio = word_img.height / word_img.width
    word_target_h = int(word_target_w * word_ratio)
    word_scaled = word_img.resize((word_target_w, word_target_h), Image.Resampling.LANCZOS)
    wx = (W * SCALE - word_target_w) // 2
    wy = 170 * SCALE
    img.paste(word_scaled, (wx, wy))

    # label under wordmark
    lbl = font("InstrumentSans-Regular.ttf", 18)
    drw.text((wx, wy + word_target_h + 14 * SCALE), "wordmark  ·  horizontal lockup", font=lbl, fill=TEXT_DIM)

    # divider
    dy = wy + word_target_h + 70 * SCALE
    drw.line([(60 * SCALE, dy), (W * SCALE - 60 * SCALE, dy)], fill=BORDER_COL, width=2 * SCALE)

    # mark panel
    mark_img = Image.open(OUT / f"{slug}-mark.png").convert("RGB")
    mark_target = int(420 * SCALE)
    mark_scaled = mark_img.resize((mark_target, mark_target), Image.Resampling.LANCZOS)
    mx = (W * SCALE - mark_target) // 2
    my = dy + 50 * SCALE
    img.paste(mark_scaled, (mx, my))
    drw.text((mx, my + mark_target + 14 * SCALE), "mark-only  ·  square", font=lbl, fill=TEXT_DIM)

    save(img, f"{slug}-contact.png", (W, H))


def grand_contact_sheet() -> None:
    """Single grid of all 5 concepts. 5 rows, each row = thumb wordmark + thumb mark."""
    W, H = 1600, 2400
    img = new_canvas(W, H)
    drw = ImageDraw.Draw(img)

    # header
    hf = font("BricolageGrotesque-Bold.ttf", 44)
    drw.text((60 * SCALE, 50 * SCALE), "OutTheGroupchat  ·  logo concepts  ·  round 1", font=hf, fill=TEXT_BRIGHT)
    sf = font("InstrumentSans-Regular.ttf", 22)
    drw.text(
        (60 * SCALE, 115 * SCALE),
        "five genuinely distinct directions · last call philosophy · sodium on warm-black",
        font=sf,
        fill=TEXT_DIM,
    )

    # divider
    drw.line([(60 * SCALE, 175 * SCALE), (W * SCALE - 60 * SCALE, 175 * SCALE)], fill=BORDER_COL, width=2 * SCALE)

    row_h = 420 * SCALE
    top = 210 * SCALE
    for i, (n, name, slug) in enumerate(CONCEPTS):
        ry = top + i * row_h

        # concept label
        num_f = font("InstrumentSans-Bold.ttf", 32)
        name_f = font("InstrumentSans-Bold.ttf", 22)
        drw.text((60 * SCALE, ry + 20 * SCALE), f"{n:02d}", font=num_f, fill=SODIUM)
        drw.text((60 * SCALE, ry + 62 * SCALE), name.lower(), font=name_f, fill=TEXT_BRIGHT)

        # wordmark thumbnail
        word_img = Image.open(OUT / f"{slug}-wordmark.png").convert("RGB")
        wt_w = int(900 * SCALE)
        wt_h = int(wt_w * (word_img.height / word_img.width))
        word_scaled = word_img.resize((wt_w, wt_h), Image.Resampling.LANCZOS)
        wx = 260 * SCALE
        wy = ry + (row_h - wt_h) // 2 - 20 * SCALE
        img.paste(word_scaled, (wx, wy))

        # mark thumbnail
        mark_img = Image.open(OUT / f"{slug}-mark.png").convert("RGB")
        mt = int(280 * SCALE)
        mark_scaled = mark_img.resize((mt, mt), Image.Resampling.LANCZOS)
        mx = 1230 * SCALE
        my = ry + (row_h - mt) // 2 - 20 * SCALE
        img.paste(mark_scaled, (mx, my))

        # row divider
        if i < len(CONCEPTS) - 1:
            drw.line(
                [(60 * SCALE, ry + row_h - 10 * SCALE), (W * SCALE - 60 * SCALE, ry + row_h - 10 * SCALE)],
                fill=BORDER_COL,
                width=1 * SCALE,
            )

    # footer
    ff = font("GeistMono-Regular.ttf", 20)
    drw.text(
        (60 * SCALE, H * SCALE - 50 * SCALE),
        "docs/design/DESIGN_BRIEF.md  ·  brand/palette.json  ·  round 1  ·  2026-04-23",
        font=ff,
        fill=TEXT_DIM,
    )

    save(img, "contact-sheet-all-concepts.png", (W, H))


# ---------- run ----------

def main() -> None:
    print("rendering concept 1 — Marquee Letter...")
    render_c1_wordmark()
    render_c1_mark()

    print("rendering concept 2 — Pin-Drop...")
    render_c2_wordmark()
    render_c2_mark()

    print("rendering concept 3 — Clink...")
    render_c3_wordmark()
    render_c3_mark()

    print("rendering concept 4 — Bracket...")
    render_c4_wordmark()
    render_c4_mark()

    print("rendering concept 5 — Receipt...")
    render_c5_wordmark()
    render_c5_mark()

    print("rendering per-concept contact sheets...")
    for n, name, slug in CONCEPTS:
        contact_sheet_per_concept(n, name, slug)

    print("rendering grand contact sheet...")
    grand_contact_sheet()

    print("done.")


if __name__ == "__main__":
    main()
