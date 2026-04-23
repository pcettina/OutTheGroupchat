"""Round 2 — refinements of Receipt, Clink, Bracket + 3 hybrids.

Receipt-v2 : polished stamp, intentional ink-bleed, ornamental kicker
Clink-v2   : unequal circles, center-meeting dot, tighter wordmark
Bracket-v2 : flipped to ] glyph, arms dramatic past LEFT edge
Hybrid-Tab     : Receipt outer ring + Clink inner Venn
Hybrid-Stub    : stamp-as-frame with bracket arms escaping past outer rim
Hybrid-Breakout: Clink Venn inside a dark frame, sodium circle bursts right
"""
from __future__ import annotations

import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

# ---------- paths & constants ----------

HERE = Path(__file__).resolve().parent
OUT = HERE
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
TEXT_BRIGHT = (0xF5, 0xEB, 0xDD)
TEXT_DIM    = (0x8B, 0x7E, 0x6F)
BORDER_COL  = (0x2B, 0x22, 0x1C)

SCALE = 2


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size * SCALE)


def new_canvas(w: int, h: int, bg=BG_DARK) -> Image.Image:
    return Image.new("RGB", (w * SCALE, h * SCALE), bg)


def finalize(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    return img.resize(size, Image.Resampling.LANCZOS)


def save(img: Image.Image, name: str, size: tuple[int, int]) -> Path:
    p = OUT / name
    finalize(img, size).save(p, "PNG", optimize=True)
    return p


def tbbox(d: ImageDraw.ImageDraw, t: str, f: ImageFont.FreeTypeFont):
    return d.textbbox((0, 0), t, font=f)


# ---------- shared helpers ----------

def curved_text(
    layer: Image.Image,
    cx: int, cy: int, radius: int,
    text: str,
    f: ImageFont.FreeTypeFont,
    color: tuple[int, int, int],
    start_angle_deg: float = -90,
    alpha: int = 255,
):
    tmp = ImageDraw.Draw(layer)
    total_w = tmp.textlength(text, font=f)
    if radius <= 0:
        return
    angular_total = (total_w / (2 * math.pi * radius)) * 360
    cur = start_angle_deg - angular_total / 2
    for ch in text:
        cw = tmp.textlength(ch, font=f)
        char_angle = (cw / (2 * math.pi * radius)) * 360
        theta = math.radians(cur + char_angle / 2)
        x = cx + radius * math.cos(theta)
        y = cy + radius * math.sin(theta)
        ch_img = Image.new("RGBA", (int(cw * 1.8) + 20, int(f.size * 1.8)), (0, 0, 0, 0))
        cd = ImageDraw.Draw(ch_img)
        cd.text((10, 5), ch, font=f, fill=(*color, alpha))
        rot = -(cur + char_angle / 2 + 90)
        rotated = ch_img.rotate(rot, resample=Image.Resampling.BICUBIC, expand=True)
        layer.paste(rotated, (int(x - rotated.width / 2), int(y - rotated.height / 2)), rotated)
        cur += char_angle


def inked_ring(
    layer: Image.Image,
    cx: int, cy: int, radius: int, thickness: int,
    color: tuple[int, int, int],
    wobble: int = 2,
    steps: int = 200,
    seed: int = 1,
):
    """Draw a ring of small arcs with positional jitter — ink-stamp feel."""
    rng = random.Random(seed)
    d = ImageDraw.Draw(layer)
    for i in range(steps):
        a0 = (i / steps) * 360
        a1 = ((i + 1) / steps) * 360
        jx = rng.randint(-wobble, wobble) * SCALE
        jy = rng.randint(-wobble, wobble) * SCALE
        tt = thickness + rng.randint(-2, 2) * SCALE
        d.arc(
            [cx - radius + jx, cy - radius + jy, cx + radius + jx, cy + radius + jy],
            start=a0, end=a1, fill=color, width=max(2 * SCALE, tt),
        )


def ink_bleed(
    layer: Image.Image,
    cx: int, cy: int, radius: int,
    color: tuple[int, int, int],
    count: int = 160,
    rim_low: float = 0.95,
    rim_high: float = 1.08,
    seed: int = 2,
):
    rng = random.Random(seed)
    d = ImageDraw.Draw(layer)
    for _ in range(count):
        a = rng.uniform(0, math.tau)
        rr = rng.uniform(radius * rim_low, radius * rim_high)
        dot_r = rng.randint(1, 3) * SCALE
        dx = int(cx + rr * math.cos(a))
        dy = int(cy + rr * math.sin(a))
        alpha = rng.randint(50, 140)
        d.ellipse([dx - dot_r, dy - dot_r, dx + dot_r, dy + dot_r], fill=(*color, alpha))


def notch_upper_right(stamp: Image.Image, cx: int, cy: int, radius: int, inner_safe_r: int) -> Image.Image:
    mask = Image.new("L", stamp.size, 255)
    md = ImageDraw.Draw(mask)
    md.pieslice(
        [cx - radius - 10 * SCALE, cy - radius - 10 * SCALE, cx + radius + 10 * SCALE, cy + radius + 10 * SCALE],
        start=-40, end=-5, fill=0,
    )
    # preserve interior — only rim is cut
    md.ellipse([cx - inner_safe_r, cy - inner_safe_r, cx + inner_safe_r, cy + inner_safe_r], fill=255)
    r_, g_, b_, a_ = stamp.split()
    a_ = ImageChops.multiply(a_, mask)
    return Image.merge("RGBA", (r_, g_, b_, a_))


# ---------- CONCEPT: Clink v2 ----------

def clink_v2_mark(img: Image.Image, cx: int, cy: int, r_left: int, color_left=SODIUM, color_right=TILE, overlap_color=MARASCHINO, r_right: int | None = None):
    """Unequal two-circle Venn with a tiny centered maraschino dot in the exact overlap."""
    if r_right is None:
        r_right = int(r_left * 0.82)
    offset = int((r_left + r_right) * 0.35)
    left_cx = cx - offset
    right_cx = cx + offset

    canvas = Image.new("RGBA", img.size, (0, 0, 0, 0))

    left = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(left).ellipse(
        [left_cx - r_left, cy - r_left, left_cx + r_left, cy + r_left],
        fill=(*color_left, 255),
    )
    right = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(right).ellipse(
        [right_cx - r_right, cy - r_right, right_cx + r_right, cy + r_right],
        fill=(*color_right, 255),
    )
    canvas = Image.alpha_composite(canvas, left)
    canvas = Image.alpha_composite(canvas, right)

    # overlap → maraschino
    ov = ImageChops.multiply(left.split()[3], right.split()[3]).point(lambda v: 255 if v > 0 else 0)
    overlap_layer = Image.new("RGBA", img.size, (*overlap_color, 255))
    canvas.paste(overlap_layer, (0, 0), ov)

    img.paste(canvas, (0, 0), canvas)

    # tiny centered sodium dot in overlap — "the meeting"
    # find overlap centroid: midpoint of the two centers
    mid_cx = (left_cx + right_cx) // 2
    dot_r = int(min(r_left, r_right) * 0.08)
    ImageDraw.Draw(img).ellipse(
        [mid_cx - dot_r, cy - dot_r, mid_cx + dot_r, cy + dot_r],
        fill=TEXT_BRIGHT,
    )


def render_clink_v2_wordmark():
    W, H = 1600, 800
    img = new_canvas(W, H)
    cx, cy = 360 * SCALE, (H * SCALE) // 2
    clink_v2_mark(img, cx, cy, r_left=150 * SCALE)

    d = ImageDraw.Draw(img)
    f_sans = font("BricolageGrotesque-Bold.ttf", 96)
    f_ital = font("InstrumentSerif-Italic.ttf", 96)

    p1, p2, p3 = "out ", "the", " groupchat"
    w1 = d.textlength(p1, font=f_sans)
    w2 = d.textlength(p2, font=f_ital)
    w3 = d.textlength(p3, font=f_sans)
    _, y0, _, y1 = tbbox(d, p1 + "the" + p3, f_sans)
    th = y1 - y0

    tx = 620 * SCALE
    ty = cy - th // 2 - y0
    d.text((tx, ty), p1, font=f_sans, fill=TEXT_BRIGHT)
    d.text((tx + w1, ty), p2, font=f_ital, fill=TILE)
    d.text((tx + w1 + w2, ty), p3, font=f_sans, fill=TEXT_BRIGHT)

    # kicker under wordmark
    kf = font("InstrumentSans-Regular.ttf", 26)
    d.text((tx, ty + th + 20 * SCALE), "you  ·  the crew  ·  the meeting", font=kf, fill=TEXT_DIM)

    save(img, "clink-v2-wordmark.png", (W, H))


def render_clink_v2_mark():
    S = 800
    img = new_canvas(S, S)
    clink_v2_mark(img, (S * SCALE) // 2, (S * SCALE) // 2, r_left=230 * SCALE)
    save(img, "clink-v2-mark.png", (S, S))


# ---------- CONCEPT: Bracket v2 (mirrored `]`) ----------

def bracket_v2_mark(d: ImageDraw.ImageDraw, fx: int, fy: int, size: int):
    stroke = max(4 * SCALE, size // 40)
    d.rounded_rectangle([fx, fy, fx + size, fy + size], radius=int(size * 0.08), outline=BORDER_COL, width=stroke)
    pad = stroke // 2 + 2 * SCALE
    d.rounded_rectangle(
        [fx + pad, fy + pad, fx + size - pad, fy + size - pad],
        radius=int(size * 0.07), fill=MARASCHINO,
    )
    # ] geometry: vertical bar near right, arms extend LEFT past the frame
    b_thick = int(size * 0.12)
    b_inner_pad = int(size * 0.18)
    bar_x = fx + int(size * 0.62)
    bar_top = fy + b_inner_pad
    bar_bot = fy + size - b_inner_pad
    d.rectangle([bar_x, bar_top, bar_x + b_thick, bar_bot], fill=SODIUM)
    arm_extend = int(size * 0.35)   # more dramatic than round 1
    d.rectangle([fx - arm_extend, bar_top, bar_x + b_thick, bar_top + b_thick], fill=SODIUM)
    d.rectangle([fx - arm_extend, bar_bot - b_thick, bar_x + b_thick, bar_bot], fill=SODIUM)


def render_bracket_v2_wordmark():
    W, H = 1600, 800
    img = new_canvas(W, H)
    d = ImageDraw.Draw(img)
    frame_size = 300 * SCALE
    fx = 340 * SCALE  # pushed right so left-escaping arms have canvas room
    fy = (H * SCALE - frame_size) // 2
    bracket_v2_mark(d, fx, fy, frame_size)

    word = "OutTheGroupchat"
    f = font("BricolageGrotesque-Bold.ttf", 84)
    x0, y0, x1, y1 = tbbox(d, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 700 * SCALE - x0
    ty = (H * SCALE) // 2 - th // 2 - y0
    d.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    kf = font("InstrumentSans-Italic.ttf", 26)
    d.text((tx, ty + th + 18 * SCALE), "off your phone", font=kf, fill=TEXT_DIM)
    save(img, "bracket-v2-wordmark.png", (W, H))


def render_bracket_v2_mark():
    S = 800
    img = new_canvas(S, S)
    d = ImageDraw.Draw(img)
    frame_size = 500 * SCALE
    fx = (S * SCALE - frame_size) // 2
    fy = (S * SCALE - frame_size) // 2
    bracket_v2_mark(d, fx, fy, frame_size)
    save(img, "bracket-v2-mark.png", (S, S))


# ---------- CONCEPT: Receipt v2 ----------

def receipt_v2_stamp(img: Image.Image, cx: int, cy: int, r: int, center_text: str = "OTG"):
    stamp = Image.new("RGBA", img.size, (0, 0, 0, 0))

    outer_thick = max(8 * SCALE, r // 22)
    inner_thick = max(4 * SCALE, r // 40)
    inner_r = int(r * 0.72)

    inked_ring(stamp, cx, cy, r, outer_thick, SODIUM, wobble=2, steps=200, seed=11)
    inked_ring(stamp, cx, cy, inner_r, inner_thick, SODIUM, wobble=1, steps=200, seed=12)

    # center bold text
    f_center = font("BricolageGrotesque-Bold.ttf", max(60, r // 5))
    sd = ImageDraw.Draw(stamp)
    tx0, ty0, tx1, ty1 = sd.textbbox((0, 0), center_text, font=f_center)
    tw, th = tx1 - tx0, ty1 - ty0
    sd.text((cx - tw // 2 - tx0, cy - th // 2 - ty0), center_text, font=f_center, fill=SODIUM)

    # tiny dot line under center text (stamp-date bar)
    bar_w = int(r * 0.35)
    bar_h = max(2 * SCALE, r // 80)
    sd.rectangle(
        [cx - bar_w // 2, cy + th // 2 + 10 * SCALE, cx + bar_w // 2, cy + th // 2 + 10 * SCALE + bar_h],
        fill=SODIUM,
    )

    # curved text on the ring
    curved_text(
        stamp, cx, cy, int((r + inner_r) / 2),
        "·  meetup  ·  meetup  ·  meetup  ·  meetup  ·",
        font("GeistMono-Bold.ttf", max(16, r // 22)),
        SODIUM, start_angle_deg=-90,
    )

    ink_bleed(stamp, cx, cy, r, SODIUM, count=180, seed=13)
    stamp = stamp.filter(ImageFilter.GaussianBlur(radius=0.6 * SCALE))
    stamp = notch_upper_right(stamp, cx, cy, r, inner_safe_r=int(inner_r * 0.85))
    img.paste(stamp, (0, 0), stamp)


def render_receipt_v2_wordmark():
    W, H = 1600, 800
    img = new_canvas(W, H)
    cx, cy = 400 * SCALE, (H * SCALE) // 2
    receipt_v2_stamp(img, cx, cy, r=170 * SCALE)

    d = ImageDraw.Draw(img)
    word = "OutTheGroupchat"
    f = font("InstrumentSerif-Italic.ttf", 140)
    x0, y0, x1, y1 = tbbox(d, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 680 * SCALE - x0
    ty = cy - th // 2 - y0
    d.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    kf = font("GeistMono-Regular.ttf", 24)
    d.text(
        (tx, ty + th + 12 * SCALE),
        "tab · tuesday · 10:47 pm · no. 041",
        font=kf, fill=TEXT_DIM,
    )
    # receipt perforation line under kicker
    perf_y = ty + th + 56 * SCALE
    dash_w = 10 * SCALE
    for x in range(tx, int(tx + tw), dash_w * 2):
        d.rectangle([x, perf_y, x + dash_w, perf_y + 2 * SCALE], fill=BORDER_COL)

    save(img, "receipt-v2-wordmark.png", (W, H))


def render_receipt_v2_mark():
    S = 800
    img = new_canvas(S, S)
    receipt_v2_stamp(img, (S * SCALE) // 2, (S * SCALE) // 2, r=280 * SCALE)
    save(img, "receipt-v2-mark.png", (S, S))


# ---------- HYBRID 1: Tab (Receipt outer + Clink inner) ----------

def tab_mark(img: Image.Image, cx: int, cy: int, r: int):
    """Outer hand-inked ring + inner two-circle Venn."""
    stamp = Image.new("RGBA", img.size, (0, 0, 0, 0))

    outer_thick = max(8 * SCALE, r // 22)
    inked_ring(stamp, cx, cy, r, outer_thick, SODIUM, wobble=2, steps=220, seed=21)

    # curved microtext on outer ring
    mt_r = int(r * 0.88)
    curved_text(
        stamp, cx, cy, mt_r,
        "·  out the groupchat  ·  out the groupchat  ·",
        font("GeistMono-Bold.ttf", max(14, r // 26)),
        SODIUM, start_angle_deg=-90,
    )

    ink_bleed(stamp, cx, cy, r, SODIUM, count=140, seed=22)
    stamp = stamp.filter(ImageFilter.GaussianBlur(radius=0.6 * SCALE))
    stamp = notch_upper_right(stamp, cx, cy, r, inner_safe_r=int(r * 0.75))
    img.paste(stamp, (0, 0), stamp)

    # inner Venn — reduced scale
    inner_r = int(r * 0.42)
    clink_v2_mark(img, cx, cy, r_left=inner_r, r_right=int(inner_r * 0.82))


def render_tab_wordmark():
    W, H = 1600, 800
    img = new_canvas(W, H)
    cx, cy = 400 * SCALE, (H * SCALE) // 2
    tab_mark(img, cx, cy, r=180 * SCALE)

    d = ImageDraw.Draw(img)
    word = "OutTheGroupchat"
    f = font("InstrumentSerif-Italic.ttf", 128)
    x0, y0, x1, y1 = tbbox(d, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 720 * SCALE - x0
    ty = cy - th // 2 - y0
    d.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    kf = font("GeistMono-Regular.ttf", 24)
    d.text((tx, ty + th + 12 * SCALE), "bar tab · no. 041 · tuesday", font=kf, fill=TEXT_DIM)
    save(img, "hybrid-tab-wordmark.png", (W, H))


def render_tab_mark():
    S = 800
    img = new_canvas(S, S)
    tab_mark(img, (S * SCALE) // 2, (S * SCALE) // 2, r=280 * SCALE)
    save(img, "hybrid-tab-mark.png", (S, S))


# ---------- HYBRID 2: Stub (stamp-as-frame + bracket escaping) ----------

def stub_mark(img: Image.Image, cx: int, cy: int, r: int):
    """Round hand-inked stamp as the 'frame'; bracket inside with arms breaking past the rim."""
    stamp = Image.new("RGBA", img.size, (0, 0, 0, 0))

    outer_thick = max(10 * SCALE, r // 20)
    inner_r = int(r * 0.72)
    inked_ring(stamp, cx, cy, r, outer_thick, SODIUM, wobble=2, steps=220, seed=31)
    # no inner ring — let the bracket be the interior graphic

    ink_bleed(stamp, cx, cy, r, SODIUM, count=160, seed=32)
    stamp = stamp.filter(ImageFilter.GaussianBlur(radius=0.6 * SCALE))
    stamp = notch_upper_right(stamp, cx, cy, r, inner_safe_r=int(inner_r * 0.9))
    img.paste(stamp, (0, 0), stamp)

    # bracket interior — arms extend past the right rim of the stamp
    d = ImageDraw.Draw(img)
    bar_thick = int(r * 0.16)
    bar_half_h = int(r * 0.45)
    bar_x = cx - int(r * 0.25)
    d.rectangle([bar_x, cy - bar_half_h, bar_x + bar_thick, cy + bar_half_h], fill=SODIUM)
    arm_end = cx + r + int(r * 0.25)  # past the rim on the right
    d.rectangle([bar_x, cy - bar_half_h, arm_end, cy - bar_half_h + bar_thick], fill=SODIUM)
    d.rectangle([bar_x, cy + bar_half_h - bar_thick, arm_end, cy + bar_half_h], fill=SODIUM)


def render_stub_wordmark():
    W, H = 1600, 800
    img = new_canvas(W, H)
    cx, cy = 380 * SCALE, (H * SCALE) // 2
    stub_mark(img, cx, cy, r=170 * SCALE)

    d = ImageDraw.Draw(img)
    word = "OutTheGroupchat"
    f = font("BricolageGrotesque-Bold.ttf", 92)
    x0, y0, x1, y1 = tbbox(d, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 720 * SCALE - x0
    ty = cy - th // 2 - y0
    d.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    kf = font("InstrumentSans-Italic.ttf", 26)
    d.text((tx, ty + th + 16 * SCALE), "you're on the list", font=kf, fill=TEXT_DIM)
    save(img, "hybrid-stub-wordmark.png", (W, H))


def render_stub_mark():
    S = 800
    img = new_canvas(S, S)
    stub_mark(img, (S * SCALE) // 2, (S * SCALE) // 2, r=260 * SCALE)
    save(img, "hybrid-stub-mark.png", (S, S))


# ---------- HYBRID 3: Breakout (Clink Venn inside a dark frame, one circle escapes) ----------

def breakout_mark(d: ImageDraw.ImageDraw, img: Image.Image, fx: int, fy: int, size: int):
    stroke = max(4 * SCALE, size // 40)
    d.rounded_rectangle([fx, fy, fx + size, fy + size], radius=int(size * 0.08), outline=BORDER_COL, width=stroke)
    pad = stroke // 2 + 2 * SCALE
    d.rounded_rectangle(
        [fx + pad, fy + pad, fx + size - pad, fy + size - pad],
        radius=int(size * 0.07), fill=MARASCHINO,
    )

    # two circles, left fully inside frame, right extends past right frame edge
    cy = fy + size // 2
    r_left = int(size * 0.28)
    r_right = int(size * 0.28)
    left_cx = fx + int(size * 0.36)
    # right circle center sits near the frame's right edge so it escapes
    right_cx = fx + size - int(size * 0.08)

    tile_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(tile_layer).ellipse(
        [left_cx - r_left, cy - r_left, left_cx + r_left, cy + r_left],
        fill=(*TILE, 255),
    )
    sodium_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sodium_layer).ellipse(
        [right_cx - r_right, cy - r_right, right_cx + r_right, cy + r_right],
        fill=(*SODIUM, 255),
    )

    # composite tile first (contained), then sodium (escaping, draws on top of frame + past it)
    img.paste(tile_layer, (0, 0), tile_layer)
    img.paste(sodium_layer, (0, 0), sodium_layer)

    # overlap → maraschino (only where both tile and sodium alpha)
    ov = ImageChops.multiply(tile_layer.split()[3], sodium_layer.split()[3]).point(lambda v: 255 if v > 0 else 0)
    ov_layer = Image.new("RGBA", img.size, (*MARASCHINO, 255))
    img.paste(ov_layer, (0, 0), ov)

    # tiny bright dot at overlap midpoint — "the moment"
    dot_cx = (left_cx + right_cx) // 2
    dot_r = int(min(r_left, r_right) * 0.08)
    ImageDraw.Draw(img).ellipse(
        [dot_cx - dot_r, cy - dot_r, dot_cx + dot_r, cy + dot_r],
        fill=TEXT_BRIGHT,
    )


def render_breakout_wordmark():
    W, H = 1600, 800
    img = new_canvas(W, H)
    d = ImageDraw.Draw(img)

    frame_size = 340 * SCALE
    fx = 140 * SCALE
    fy = (H * SCALE - frame_size) // 2
    breakout_mark(d, img, fx, fy, frame_size)

    word = "OutTheGroupchat"
    f = font("BricolageGrotesque-Bold.ttf", 80)
    x0, y0, x1, y1 = tbbox(d, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 720 * SCALE - x0
    ty = (H * SCALE) // 2 - th // 2 - y0
    d.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    kf = font("InstrumentSans-Italic.ttf", 26)
    d.text((tx, ty + th + 16 * SCALE), "the crew's in. you're out.", font=kf, fill=TEXT_DIM)
    save(img, "hybrid-breakout-wordmark.png", (W, H))


def render_breakout_mark():
    S = 800
    img = new_canvas(S, S)
    d = ImageDraw.Draw(img)
    frame_size = 560 * SCALE
    fx = (S * SCALE - frame_size) // 2 - int(frame_size * 0.04)
    fy = (S * SCALE - frame_size) // 2
    breakout_mark(d, img, fx, fy, frame_size)
    save(img, "hybrid-breakout-mark.png", (S, S))


# ---------- HYBRID 4: Exit (Receipt × Bracket × phone silhouette) ----------

def _phone_perimeter_points(cx: int, cy: int, w: int, h: int, corner_r: int, step: int = 3) -> list[tuple[float, float]]:
    """Sample points clockwise around a rounded-rectangle perimeter, starting at top-left corner's 9 o'clock."""
    pts: list[tuple[float, float]] = []
    x0, y0 = cx - w // 2, cy - h // 2
    x1, y1 = cx + w // 2, cy + h // 2

    # top edge L→R (between top-left corner's end and top-right corner's start)
    for x in range(x0 + corner_r, x1 - corner_r + 1, step):
        pts.append((x, y0))
    # top-right corner (top to right)
    for a_deg in range(-90, 1, 2):
        a = math.radians(a_deg)
        px = x1 - corner_r + corner_r * math.cos(a)
        py = y0 + corner_r + corner_r * math.sin(a)
        pts.append((px, py))
    # right edge T→B
    for y in range(y0 + corner_r, y1 - corner_r + 1, step):
        pts.append((x1, y))
    # bottom-right corner (right to bottom)
    for a_deg in range(0, 91, 2):
        a = math.radians(a_deg)
        px = x1 - corner_r + corner_r * math.cos(a)
        py = y1 - corner_r + corner_r * math.sin(a)
        pts.append((px, py))
    # bottom edge R→L
    for x in range(x1 - corner_r, x0 + corner_r - 1, -step):
        pts.append((x, y1))
    # bottom-left corner (bottom to left)
    for a_deg in range(90, 181, 2):
        a = math.radians(a_deg)
        px = x0 + corner_r + corner_r * math.cos(a)
        py = y1 - corner_r + corner_r * math.sin(a)
        pts.append((px, py))
    # left edge B→T
    for y in range(y1 - corner_r, y0 + corner_r - 1, -step):
        pts.append((x0, y))
    # top-left corner (left to top)
    for a_deg in range(180, 271, 2):
        a = math.radians(a_deg)
        px = x0 + corner_r + corner_r * math.cos(a)
        py = y0 + corner_r + corner_r * math.sin(a)
        pts.append((px, py))
    return pts


def _inked_rounded_rect(
    layer: Image.Image,
    cx: int, cy: int, w: int, h: int,
    stroke_thick: int,
    color: tuple[int, int, int],
    seed: int = 41,
    gap_region: tuple[int, int, int, int] | None = None,
):
    """Draw a hand-inked rounded rectangle using jittered polyline segments.

    gap_region: optional (x0, y0, x1, y1) box — segments whose midpoint falls inside are skipped,
                creating a visible gap in the ring (for the bracket arm passing through).
    """
    rng = random.Random(seed)
    d = ImageDraw.Draw(layer)
    corner_r = int(min(w, h) * 0.2)
    pts = _phone_perimeter_points(cx, cy, w, h, corner_r, step=2)

    def in_gap(mx: float, my: float) -> bool:
        if gap_region is None:
            return False
        gx0, gy0, gx1, gy1 = gap_region
        return gx0 <= mx <= gx1 and gy0 <= my <= gy1

    for i in range(len(pts) - 1):
        jx1 = rng.randint(-2, 2) * SCALE
        jy1 = rng.randint(-2, 2) * SCALE
        jx2 = rng.randint(-2, 2) * SCALE
        jy2 = rng.randint(-2, 2) * SCALE
        tt = stroke_thick + rng.randint(-2, 2) * SCALE
        p1 = (pts[i][0] + jx1, pts[i][1] + jy1)
        p2 = (pts[i + 1][0] + jx2, pts[i + 1][1] + jy2)
        mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        if in_gap(mid[0], mid[1]):
            continue
        d.line([p1, p2], fill=color, width=max(2 * SCALE, tt))

    # ink-bleed dots scattered around perimeter
    for _ in range(220):
        idx = rng.randint(0, len(pts) - 1)
        px, py = pts[idx]
        # outward offset for bleed feel
        dx = px - cx
        dy = py - cy
        dist = math.hypot(dx, dy)
        if dist > 0:
            nx, ny = dx / dist, dy / dist
            off = rng.uniform(0, 8) * SCALE
            px += nx * off
            py += ny * off
        if in_gap(px, py):
            continue
        dot_r = rng.randint(1, 3) * SCALE
        alpha = rng.randint(50, 140)
        d.ellipse([px - dot_r, py - dot_r, px + dot_r, py + dot_r], fill=(*color, alpha))


def _curved_text_rounded_rect(
    layer: Image.Image,
    cx: int, cy: int, w: int, h: int, margin: int,
    text: str,
    f: ImageFont.FreeTypeFont,
    color: tuple[int, int, int],
):
    """Lay text along the inside perimeter of a rounded rectangle, starting centered at top."""
    tmp = ImageDraw.Draw(layer)
    # construct inner perimeter points
    iw = w - 2 * margin
    ih = h - 2 * margin
    corner_r = int(min(iw, ih) * 0.14)
    pts = _phone_perimeter_points(cx, cy, iw, ih, corner_r, step=1)

    # rotate pts so index 0 is the center of the top edge
    # find the index with minimum y and closest to cx
    top_candidates = [(i, p) for i, p in enumerate(pts) if p[1] == min(p[1] for p in pts)]
    if top_candidates:
        # pick the one closest to cx
        top_idx = min(top_candidates, key=lambda ip: abs(ip[1][0] - cx))[0]
    else:
        top_idx = 0
    pts = pts[top_idx:] + pts[:top_idx]

    # cumulative arc length along perimeter
    cum = [0.0]
    for i in range(1, len(pts)):
        cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    total_len = cum[-1]

    total_text_w = tmp.textlength(text, font=f)
    # start so text is centered around the top of the perimeter
    start_s = -total_text_w / 2

    def point_at_s(s: float) -> tuple[float, float, float]:
        """Return (x, y, tangent_angle_deg) at arc length s along the perimeter (wraps around)."""
        s_wrapped = s % total_len
        # binary search for index
        lo, hi = 0, len(cum) - 1
        while lo < hi:
            mid_i = (lo + hi) // 2
            if cum[mid_i] < s_wrapped:
                lo = mid_i + 1
            else:
                hi = mid_i
        i = max(1, lo)
        p0 = pts[i - 1]
        p1 = pts[i]
        seg_len = cum[i] - cum[i - 1]
        if seg_len == 0:
            frac = 0
        else:
            frac = (s_wrapped - cum[i - 1]) / seg_len
        x = p0[0] + (p1[0] - p0[0]) * frac
        y = p0[1] + (p1[1] - p0[1]) * frac
        ang = math.degrees(math.atan2(p1[1] - p0[1], p1[0] - p0[0]))
        return x, y, ang

    cur_s = start_s
    for ch in text:
        cw = tmp.textlength(ch, font=f)
        x, y, ang = point_at_s(cur_s + cw / 2)
        ch_img = Image.new("RGBA", (int(cw * 1.8) + 20, int(f.size * 1.8)), (0, 0, 0, 0))
        cd = ImageDraw.Draw(ch_img)
        cd.text((10, 5), ch, font=f, fill=(*color, 255))
        rotated = ch_img.rotate(-ang, resample=Image.Resampling.BICUBIC, expand=True)
        layer.paste(
            rotated,
            (int(x - rotated.width / 2), int(y - rotated.height / 2)),
            rotated,
        )
        cur_s += cw


def _exit_bracket_coords(phone_cx: int, phone_cy: int, phone_w: int, phone_h: int) -> dict:
    """Geometry for the asymmetric exit bracket: short TOP arm inside, long BOTTOM arm exits right."""
    phone_right = phone_cx + phone_w // 2
    phone_left = phone_cx - phone_w // 2
    bar_thick = int(phone_w * 0.12)
    spine_x = phone_left + int(phone_w * 0.30)
    spine_top = phone_cy - int(phone_h * 0.28)
    spine_bot = phone_cy + int(phone_h * 0.28)
    short_arm_end = spine_x + int(phone_w * 0.38)
    long_arm_end = phone_right + int(phone_w * 0.35)
    return {
        "phone_right": phone_right,
        "bar_thick": bar_thick,
        "spine_x": spine_x,
        "spine_top": spine_top,
        "spine_bot": spine_bot,
        "short_arm_end": short_arm_end,
        "long_arm_end": long_arm_end,
    }


def _exit_bracket_gap(c: dict, pad_px: int = 6) -> tuple[int, int, int, int]:
    """Gap region (x0,y0,x1,y1) where the long BOTTOM arm crosses the phone's right edge."""
    gap_pad = pad_px * SCALE
    return (
        c["phone_right"] - gap_pad,
        c["spine_bot"] - c["bar_thick"] - gap_pad,
        c["phone_right"] + gap_pad,
        c["spine_bot"] + gap_pad,
    )


def _draw_exit_bracket(img: Image.Image, c: dict) -> None:
    """Spine + short TOP arm (inside) + long BOTTOM arm (exits right, rounded leading edge)."""
    d = ImageDraw.Draw(img)

    # vertical spine
    d.rectangle([c["spine_x"], c["spine_top"], c["spine_x"] + c["bar_thick"], c["spine_bot"]], fill=SODIUM)

    # short TOP arm — stays inside
    d.rectangle(
        [c["spine_x"], c["spine_top"], c["short_arm_end"], c["spine_top"] + c["bar_thick"]],
        fill=SODIUM,
    )

    # long BOTTOM arm — extends past the phone's right edge
    d.rectangle(
        [c["spine_x"], c["spine_bot"] - c["bar_thick"], c["long_arm_end"], c["spine_bot"]],
        fill=SODIUM,
    )

    # rounded cap at leading edge of the long arm
    cap_cx = c["long_arm_end"]
    cap_cy = c["spine_bot"] - c["bar_thick"] // 2
    hr = c["bar_thick"] // 2
    d.ellipse([cap_cx - hr, cap_cy - hr, cap_cx + hr, cap_cy + hr], fill=SODIUM)


def render_exit_wordmark():
    W, H = 1600, 800
    img = new_canvas(W, H)

    phone_cx = 420 * SCALE
    phone_cy = (H * SCALE) // 2
    phone_w = 260 * SCALE
    phone_h = 500 * SCALE

    coords = _exit_bracket_coords(phone_cx, phone_cy, phone_w, phone_h)
    gap = _exit_bracket_gap(coords, pad_px=6)

    # inked phone ring with gap for the exiting arm
    ring_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    _inked_rounded_rect(
        ring_layer, phone_cx, phone_cy, phone_w, phone_h,
        stroke_thick=max(6 * SCALE, phone_w // 40),
        color=SODIUM, seed=41, gap_region=gap,
    )
    ring_layer = ring_layer.filter(ImageFilter.GaussianBlur(radius=0.6 * SCALE))
    img.paste(ring_layer, (0, 0), ring_layer)

    # curved micro-text along inside perimeter
    inside_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    _curved_text_rounded_rect(
        inside_layer,
        phone_cx, phone_cy, phone_w, phone_h,
        margin=18 * SCALE,
        text="·  out the groupchat  ·  out the groupchat  ·",
        f=font("GeistMono-Bold.ttf", max(11, phone_w // 28)),
        color=SODIUM,
    )
    img.paste(inside_layer, (0, 0), inside_layer)

    _draw_exit_bracket(img, coords)

    # wordmark right — italic serif per Receipt voice
    d = ImageDraw.Draw(img)
    word = "OutTheGroupchat"
    f = font("InstrumentSerif-Italic.ttf", 130)
    x0, y0, x1, y1 = tbbox(d, word, f)
    tw, th = x1 - x0, y1 - y0
    tx = 720 * SCALE - x0
    ty = phone_cy - th // 2 - y0
    d.text((tx, ty), word, font=f, fill=TEXT_BRIGHT)

    kf = font("GeistMono-Regular.ttf", 24)
    d.text((tx, ty + th + 12 * SCALE), "off  ·  tuesday  ·  10:47 pm  ·  no. 041", font=kf, fill=TEXT_DIM)

    save(img, "hybrid-exit-wordmark.png", (W, H))


def render_exit_mark():
    S = 800
    img = new_canvas(S, S)

    phone_cx = (S * SCALE) // 2
    phone_cy = (S * SCALE) // 2
    phone_w = 360 * SCALE
    phone_h = 640 * SCALE

    coords = _exit_bracket_coords(phone_cx, phone_cy, phone_w, phone_h)
    gap = _exit_bracket_gap(coords, pad_px=8)

    ring_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    _inked_rounded_rect(
        ring_layer, phone_cx, phone_cy, phone_w, phone_h,
        stroke_thick=max(8 * SCALE, phone_w // 36),
        color=SODIUM, seed=41, gap_region=gap,
    )
    ring_layer = ring_layer.filter(ImageFilter.GaussianBlur(radius=0.6 * SCALE))
    img.paste(ring_layer, (0, 0), ring_layer)

    inside_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    _curved_text_rounded_rect(
        inside_layer,
        phone_cx, phone_cy, phone_w, phone_h,
        margin=22 * SCALE,
        text="·  out the groupchat  ·  out the groupchat  ·  out the groupchat  ·",
        f=font("GeistMono-Bold.ttf", max(14, phone_w // 26)),
        color=SODIUM,
    )
    img.paste(inside_layer, (0, 0), inside_layer)

    _draw_exit_bracket(img, coords)

    save(img, "hybrid-exit-mark.png", (S, S))


# ---------- ROUND 2 GRAND CONTACT SHEET ----------

ROUND2: list[tuple[str, str, str, str]] = [
    # (slug, title, subtitle, category)
    ("receipt-v2",      "Receipt · v2",      "polished stamp · intentional ink · ornamental kicker",        "refine"),
    ("clink-v2",        "Clink · v2",        "unequal circles · meeting dot · tighter lockup",              "refine"),
    ("bracket-v2",      "Bracket · v2",      "mirrored ] · arms escape left · stronger breakout",           "refine"),
    ("hybrid-tab",      "Hybrid · Tab",      "receipt outer + clink inner · stamp of the meeting",          "hybrid"),
    ("hybrid-stub",     "Hybrid · Stub",     "stamp-as-frame + bracket arms escape the rim",                "hybrid"),
    ("hybrid-breakout", "Hybrid · Breakout", "clink venn inside the frame · sodium bursts past the edge",   "hybrid"),
    ("hybrid-exit",     "Hybrid · Exit",     "inked phone silhouette · bracket arm breaks out through a gap", "hybrid"),
]


def round2_contact_sheet():
    W, H = 1600, 3220
    img = new_canvas(W, H)
    d = ImageDraw.Draw(img)

    hf = font("BricolageGrotesque-Bold.ttf", 44)
    d.text((60 * SCALE, 50 * SCALE), "OutTheGroupchat  ·  logo concepts  ·  round 2", font=hf, fill=TEXT_BRIGHT)
    sf = font("InstrumentSans-Regular.ttf", 22)
    d.text(
        (60 * SCALE, 115 * SCALE),
        "three refinements (receipt · clink · bracket)  +  three hybrids (tab · stub · breakout)",
        font=sf, fill=TEXT_DIM,
    )
    d.line([(60 * SCALE, 175 * SCALE), (W * SCALE - 60 * SCALE, 175 * SCALE)], fill=BORDER_COL, width=2 * SCALE)

    row_h = 420 * SCALE
    top = 210 * SCALE

    cat_color = {"refine": TILE, "hybrid": BOURBON}
    num_f = font("InstrumentSans-Bold.ttf", 32)
    name_f = font("InstrumentSans-Bold.ttf", 22)
    sub_f = font("InstrumentSans-Regular.ttf", 18)
    cat_f = font("GeistMono-Bold.ttf", 16)

    for i, (slug, title, sub, cat) in enumerate(ROUND2):
        ry = top + i * row_h
        # category chip
        d.text((60 * SCALE, ry + 10 * SCALE), cat.upper(), font=cat_f, fill=cat_color.get(cat, SODIUM))
        d.text((60 * SCALE, ry + 40 * SCALE), f"{i + 1:02d}", font=num_f, fill=SODIUM)
        d.text((60 * SCALE, ry + 85 * SCALE), title.lower(), font=name_f, fill=TEXT_BRIGHT)
        # wrap sub by truncation — we rely on keeping subtitles short
        d.text((60 * SCALE, ry + 120 * SCALE), sub, font=sub_f, fill=TEXT_DIM)

        # wordmark thumb
        wm = Image.open(OUT / f"{slug}-wordmark.png").convert("RGB")
        wt_w = int(900 * SCALE)
        wt_h = int(wt_w * (wm.height / wm.width))
        wm_s = wm.resize((wt_w, wt_h), Image.Resampling.LANCZOS)
        wx = 290 * SCALE
        wy = ry + (row_h - wt_h) // 2 - 20 * SCALE
        img.paste(wm_s, (wx, wy))

        # mark thumb
        mk = Image.open(OUT / f"{slug}-mark.png").convert("RGB")
        mt = int(280 * SCALE)
        mk_s = mk.resize((mt, mt), Image.Resampling.LANCZOS)
        mx = 1260 * SCALE
        my = ry + (row_h - mt) // 2 - 20 * SCALE
        img.paste(mk_s, (mx, my))

        if i < len(ROUND2) - 1:
            d.line(
                [(60 * SCALE, ry + row_h - 10 * SCALE), (W * SCALE - 60 * SCALE, ry + row_h - 10 * SCALE)],
                fill=BORDER_COL, width=1 * SCALE,
            )

    ff = font("GeistMono-Regular.ttf", 20)
    d.text(
        (60 * SCALE, H * SCALE - 50 * SCALE),
        "round 2  ·  refinements + hybrids  ·  2026-04-23",
        font=ff, fill=TEXT_DIM,
    )
    save(img, "round-2-contact-sheet.png", (W, H))


# ---------- run ----------

def main():
    print("round 2 · refining receipt...")
    render_receipt_v2_wordmark()
    render_receipt_v2_mark()
    print("round 2 · refining clink...")
    render_clink_v2_wordmark()
    render_clink_v2_mark()
    print("round 2 · refining bracket...")
    render_bracket_v2_wordmark()
    render_bracket_v2_mark()
    print("round 2 · hybrid tab (receipt x clink)...")
    render_tab_wordmark()
    render_tab_mark()
    print("round 2 · hybrid stub (bracket x receipt)...")
    render_stub_wordmark()
    render_stub_mark()
    print("round 2 · hybrid breakout (clink x bracket)...")
    render_breakout_wordmark()
    render_breakout_mark()
    print("round 2 · hybrid exit (receipt x bracket x phone)...")
    render_exit_wordmark()
    render_exit_mark()
    print("round 2 · grand contact sheet...")
    round2_contact_sheet()
    print("done.")


if __name__ == "__main__":
    sys.exit(main())
