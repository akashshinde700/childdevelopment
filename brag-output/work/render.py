#!/usr/bin/env python3
"""
/brag-style renderer for the AetherDev Solutions (childdevelopment) app.

Built with the tools on the machine (Pillow + FFmpeg), following the
`skills/brag-slim/SKILL.md` workflow from latent-spaces/brag:

  * every frame is a pure function of time
  * real product UI, copy, colours and assets are reused (no invented claims)
  * cuts land on the bundled track's 120.19 BPM beat grid (0.5s)
  * 15-25s, readable holds, sequential reveals, simulated click, count-up
  * mode=draft deliberately keeps the naive layout so the audit can find
    real overflow / collision / contrast defects; mode=final fixes them.

Usage:
  python render.py --mode draft|final --size 1920x1080 --out path.mp4
  python render.py --mode final --size 1080x1920 --out path.mp4
  python render.py --stills --mode draft|final --size 1080x1080 --outdir dir
"""
import argparse
import json
import math
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont, ImageFilter

# --------------------------------------------------------------------------
# Paths / constants
# --------------------------------------------------------------------------
ROOT = "/home/user/childdevelopment"
OUT = os.path.join(ROOT, "brag-output")
WORK = os.path.join(OUT, "work")
FONTDIR = "/home/user/_tools/fonts"
BRAG_ASSETS = "/home/user/_reference/brag/skills/brag/assets"
LOGO_PATH = os.path.join(ROOT, "public", "logo.png")
AUDIO_PATH = os.path.join(WORK, "soundtrack.wav")
FFMPEG = ("/home/user/.venv-brag/lib/python3.11/site-packages/"
          "imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2")

FPS = 30
DURATION = 22.0
ENTRANCE = 0.35
EXIT_DIP = 0.22          # final: dip through background, never double-expose
DRAFT_XFADE = 0.40       # draft: naive crossfade -> muddy double exposure
BEAT = 0.4992            # 120.19 BPM, from the bundled music cue preset

# exact brand values read from src/app/globals.css ("Harbor" theme)
TEAL = (15, 122, 135)      # #0F7A87
TEAL_DEEP = (12, 84, 96)
CORAL = (242, 103, 61)     # #F2673D
INK = (22, 43, 53)
SLATE = (100, 116, 125)
MUTED = (148, 163, 170)
WHITE = (255, 255, 255)
LIGHT = (244, 248, 248)
CARD = (255, 255, 255)
LINE = (223, 232, 233)
DARK = (10, 34, 44)
DARK2 = (6, 22, 30)
MINT = (185, 214, 216)
GREEN = (29, 145, 108)
AMBER = (196, 132, 24)

SCENES = [
    dict(id="01-hook",        name="Hook",             start=0.0,  end=3.5),
    dict(id="02-orgs",        name="Organizations",    start=3.5,  end=7.0),
    dict(id="03-create",      name="Create clinic",    start=7.0,  end=11.0),
    dict(id="04-plans",       name="Plans & limits",   start=11.0, end=14.5),
    dict(id="05-isolation",   name="Data isolation",   start=14.5, end=18.0),
    dict(id="06-outro",       name="Outro",            start=18.0, end=22.0),
]
CUTS = [s["start"] for s in SCENES[1:]]  # 3.5, 7.0, 11.0, 14.5, 18.0

FONT_FILES = {
    "i400": "inter-latin-400-normal.ttf",
    "i500": "inter-latin-500-normal.ttf",
    "i600": "inter-latin-600-normal.ttf",
    "i700": "inter-latin-700-normal.ttf",
    "i800": "inter-latin-800-normal.ttf",
    "p600": "poppins-latin-600-normal.ttf",
    "p700": "poppins-latin-700-normal.ttf",
    "p800": "poppins-latin-800-normal.ttf",
}
_FONT_CACHE = {}
_LOGO_CACHE = {}


def font(weight, size):
    key = (weight, max(6, int(size)))
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(os.path.join(FONTDIR, FONT_FILES[weight]), key[1])
    return _FONT_CACHE[key]


def logo(size):
    key = int(size)
    if key not in _LOGO_CACHE:
        im = Image.open(LOGO_PATH).convert("RGBA").resize((key, key), Image.LANCZOS)
        _LOGO_CACHE[key] = im
    return _LOGO_CACHE[key]


def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))


def ease(v):
    v = clamp(v)
    return 1.0 - (1.0 - v) ** 3


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def blend(bg, fg, a):
    """Opaque colour approximating fg at alpha a over bg."""
    return lerp(bg, fg, clamp(a))


def geom(W, H):
    """Shared scale + safe-area geometry for every aspect ratio."""
    wide = W / H >= 1.45
    S = min(W / 1920.0, H / 1080.0)
    m = int(W * (0.055 if wide else 0.075))
    return dict(wide=wide, S=S, W=W, H=H, m=m,
                X=lambda f: int(W * f), Y=lambda f: int(H * f),
                P=lambda v: max(1, int(v * S)))


# --------------------------------------------------------------------------
# Element helpers.  Each element is a plain dict so the exact same list can be
# rendered AND audited (measurement, bounds, collisions, contrast).
# --------------------------------------------------------------------------
def add_rect(els, eid, x, y, w, h, fill, radius=0, border=None, bw=1,
             delay=0.0, anim="fade_up", role="decor", bg=None):
    els.append(dict(id=eid, kind="rect", x=x, y=y, w=w, h=h, fill=fill,
                    radius=radius, border=border, bw=bw, delay=delay,
                    anim=anim, role=role, bg=bg or fill))


def add_text(els, eid, text, x, y, w, h, size, color, weight="i600",
             bg=WHITE, align="left", valign="middle", delay=0.0,
             anim="fade_up", role="readable", fit=True, wrap=True,
             draft_bump=1.0, draft_color=None, mode_color=None, spacing=1.12,
             counter=None, type_dur=0.0):
    els.append(dict(id=eid, kind="text", x=x, y=y, w=w, h=h, text=text,
                    size=size, color=color, weight=weight, bg=bg, align=align,
                    valign=valign, delay=delay, anim=anim, role=role, fit=fit,
                    wrap=wrap, draft_bump=draft_bump, draft_color=draft_color,
                    mode_color=mode_color, spacing=spacing, counter=counter,
                    type_dur=type_dur))


def add_image(els, eid, x, y, w, h, delay=0.0, anim="fade_up", role="decor"):
    els.append(dict(id=eid, kind="image", x=x, y=y, w=w, h=h, delay=delay,
                    anim=anim, role=role, bg=WHITE))


def add_cursor(els, eid, x, y, size, delay=0.0, travel=None):
    els.append(dict(id=eid, kind="cursor", x=x, y=y, w=size, h=size,
                    delay=delay, anim="none", travel=travel, role="decor", bg=WHITE))


def add_bar(els, eid, x, y, w, h, fill, track, delay, dur=0.9, radius=None):
    els.append(dict(id=eid, kind="bar", x=x, y=y, w=w, h=h, fill=fill,
                    track=track, delay=delay, dur=dur,
                    radius=radius if radius is not None else h // 2,
                    anim="none", role="decor", bg=track))


def add_pill(els, eid, text, x, y, w, h, fill, color, size, weight="i700",
             delay=0.0, bg=None, role="readable", draft_bump=1.0):
    add_rect(els, eid + ".bg", x, y, w, h, fill, radius=h // 2, delay=delay,
             anim="pop", role="decor", bg=bg or fill)
    add_text(els, eid + ".tx", text, x + 4, y, w - 8, h, size, color,
             weight=weight, bg=fill, align="center", delay=delay + 0.05,
             anim="none", role=role, fit=True, wrap=False,
             draft_bump=draft_bump)


def el_color(el, mode):
    c = el.get("color")
    if mode == "draft" and el.get("draft_color") is not None:
        return el["draft_color"]
    if isinstance(c, dict):
        return c.get(mode, c.get("final"))
    return c


# --------------------------------------------------------------------------
# Text preparation: the single source of truth for render + audit.
# --------------------------------------------------------------------------
def text_metrics(text, size, weight, spacing=1.12):
    f = font(weight, size)
    tmp = Image.new("L", (4, 4))
    d = ImageDraw.Draw(tmp)
    bb = d.textbbox((0, 0), text, font=f)
    return bb[2] - bb[0], max(1, bb[3] - bb[1]), f


def prepare_text(el, mode):
    """Return (lines, font, width, height, size) for this element."""
    size = el["size"]
    if mode == "draft":
        size = int(size * el.get("draft_bump", 1.0))
    text = str(el["text"])
    words = len(text.split())
    max_w = el["w"]
    max_h = el["h"]

    # Draft = naive layout (no wrap, no auto-shrink). Final = wrap + auto-fit.
    wrap = bool(el.get("wrap", True)) and mode == "final"

    def layout(sz):
        lines = [text]
        if wrap:
            lines = []
            cur = ""
            for word in text.split():
                trial = (cur + " " + word).strip()
                tw, _, _ = text_metrics(trial, sz, el["weight"])
                if tw <= max_w or not cur:
                    cur = trial
                else:
                    lines.append(cur)
                    cur = word
            if cur:
                lines.append(cur)
        widths, heights = [], []
        for ln in lines:
            tw, th, _ = text_metrics(ln, sz, el["weight"])
            widths.append(tw)
            heights.append(th)
        return lines, max(widths or [0]), sum(heights) * el["spacing"], sz

    lines, tw, th, sz = layout(size)
    if mode == "final" and el.get("fit", True):
        # shrink until the block fits BOTH axes (max 4 lines)
        guard = 0
        while (tw > max_w or th > max_h or len(lines) > 4) and sz > 10 and guard < 45:
            sz = max(10, int(sz * 0.93))
            lines, tw, th, sz = layout(sz)
            guard += 1
    f = font(el["weight"], sz)
    return lines, f, tw, th, sz


# --------------------------------------------------------------------------
# Scene backgrounds (static per size/scene; a soft beat-breathing glow is
# added per frame, which is the subtle audio-reactive treatment).
# --------------------------------------------------------------------------
_BG_CACHE = {}


def scene_bg(scene_id, W, H):
    key = (scene_id, W, H)
    if key in _BG_CACHE:
        return _BG_CACHE[key]
    dark = scene_id in ("01-hook", "06-outro")
    c1, c2 = (DARK2, DARK) if dark else (LIGHT, (231, 242, 242))
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp(c1, c2, y / max(1, H - 1)) + (255,))
    # Translucent decoration MUST be composited on a separate layer: drawing a
    # semi-transparent fill straight onto an RGBA image writes low alpha but
    # full RGB, which turns into a flat opaque blob when converted to RGB.
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    glow_rgb = TEAL if dark else CORAL
    r = int(min(W, H) * 0.52)
    gd.ellipse((int(W * 0.76) - r, int(H * 0.12) - r,
                int(W * 0.76) + r, int(H * 0.12) + r),
               fill=glow_rgb + (34,))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=int(min(W, H) * 0.05)))
    im = Image.alpha_composite(im, glow)
    dots = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(dots)
    step = max(34, int(min(W, H) * 0.045))
    dot = (255, 255, 255, 30) if dark else (15, 122, 135, 24)
    for yy in range(step, H, step):
        for xx in range(step, W, step):
            dd.ellipse((xx, yy, xx + 2, yy + 2), fill=dot)
    im = Image.alpha_composite(im, dots)
    _BG_CACHE[key] = im
    return im


def add_breath(img, t, W, H, dark):
    """Very subtle RMS-like breathing on the 120 BPM grid (no strobing)."""
    pulse = 0.5 + 0.5 * math.sin(2 * math.pi * t / (BEAT * 4))
    a = 0.035 + 0.035 * pulse
    r = int(min(W, H) * 0.40)
    cx, cy = int(W * 0.5), int(H * 0.52)
    layer = Image.new("RGBA", (2 * r, 2 * r), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    col = (242, 103, 61, int(255 * a)) if dark else (15, 122, 135, int(255 * a))
    for k in range(10, 0, -1):
        rr = r * k / 10
        ld.ellipse((r - rr, r - rr, r + rr, r + rr),
                   fill=(col[0], col[1], col[2], max(1, col[3] // 12)))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=int(r * 0.28)))
    img.paste(layer, (cx - r, cy - r), layer)


# --------------------------------------------------------------------------
# Real product material (fictional clinic names, real labels/copy/colours)
# --------------------------------------------------------------------------
ORG_ROWS = [
    ("Sunrise Child Clinic", "admin@sunrise.in", "Premium", "active", "42 patients", "Monthly", "Login as"),
    ("Little Steps Therapy", "owner@littlesteps.in", "Advance", "trialing", "18 patients", "12 days left", "Login as"),
    ("Bloom Kids Center", "hello@bloomkids.in", "Basic", "active", "9 patients", "Monthly", "Login as"),
]
PLANS = [
    ("Basic", "Rs. 2,999/mo", ["5 therapists", "1 branch", "3 users", "5 GB storage"], False),
    ("Advance", "Rs. 6,999/mo", ["10 therapists", "3 branches", "6 users", "25 GB storage"], True),
    ("Premium", "Rs. 14,999/mo", ["20 therapists", "999 branches", "999 users", "100 GB storage"], False),
]
SIDEBAR = ["Dashboard", "Patients", "Appointments", "Therapy Sessions",
           "Billing & Invoices", "Payroll", "Settings"]


def scene_elements(scene_id, W, H, mode):
    """Settled layout of one scene. Used by BOTH the renderer and the audit."""
    G = geom(W, H)
    S, P, X, Y = G["S"], G["P"], G["X"], G["Y"]
    wide, m = G["wide"], G["m"]
    els = []
    sid = scene_id

    def sz(v):
        return max(8, int(v * S))

    # ---------------- 01 HOOK ----------------
    if sid == "01-hook":
        add_image(els, "hook.logo", X(0.065), Y(0.072), sz(122), sz(122), delay=0.0)
        add_text(els, "hook.brand", "AETHERDEV SOLUTIONS", X(0.145), Y(0.085),
                 W * 0.45, Y(0.06), sz(25), MINT, "i700", bg=DARK2,
                 delay=0.05, valign="middle")
        add_text(els, "hook.l1", "EK APP.", X(0.065), Y(0.255), W * 0.86,
                 Y(0.17), sz(152), WHITE, "p800", bg=DARK2, delay=0.15,
                 anim="type", type_dur=0.55, wrap=False, draft_bump=1.0)
        add_text(els, "hook.l2", "KAI CLINICS.", X(0.065), Y(0.435), W * 0.86,
                 Y(0.17), sz(152), CORAL, "p800", bg=DARK2, delay=0.95,
                 wrap=False, draft_bump=1.0)
        # draft: this line is deliberately too long & too big for its box
        add_text(els, "hook.sub", "Organization = ek clinic.",
                 X(0.065), Y(0.655), W * (0.50 if wide else 0.86), Y(0.085),
                 sz(40), MINT, "i500", bg=DARK2, delay=0.95,
                 wrap=(mode == "final"), draft_bump=1.38,
                 draft_color=CORAL)
        add_pill(els, "hook.pill", "DEKHIYE", X(0.065), Y(0.83),
                 P(430), P(64), TEAL, WHITE, sz(23), delay=1.6,
                 bg=DARK2, draft_bump=1.35)

    # ---------------- 02 ORGANIZATIONS ----------------
    elif sid == "02-orgs":
        add_text(els, "orgs.kicker", "STEP 1 / PLATFORM ADMIN", X(0.06), Y(0.075),
                 W * 0.55, Y(0.045), sz(23), TEAL, "i800", bg=LIGHT, delay=0.1)
        add_text(els, "orgs.title", "Organizations", X(0.06), Y(0.13),
                 W * (0.60 if wide else 0.86), Y(0.10), sz(78), INK, "p700",
                 bg=LIGHT, delay=0.25)
        add_text(els, "orgs.sub", "Har clinic = ek Organization row.", X(0.06), Y(0.235),
                 W * (0.60 if wide else 0.86), Y(0.065), sz(34), SLATE, "i500",
                 bg=LIGHT, delay=0.55, draft_bump=1.32, draft_color=CORAL)

        # real Platform Admin UI card
        ux, uy, uw, uh = (X(0.06), Y(0.325), int(W * (0.615 if wide else 0.88)),
                          int(H * (0.49 if wide else 0.40)))
        add_rect(els, "orgs.panel", ux, uy, uw, uh, CARD, radius=P(20),
                 border=LINE, bw=P(2), delay=0.7, bg=CARD)
        add_rect(els, "orgs.panelhead", ux, uy, uw, P(62), (248, 251, 251),
                 radius=P(20), delay=0.7, bg=(248, 251, 251))
        add_text(els, "orgs.paneltitle", "Platform Admin", ux + P(24), uy + P(6),
                 uw * 0.4, P(50), sz(26), INK, "i700", bg=(248, 251, 251),
                 delay=0.78, role="decor")
        tab_x = ux + int(uw * 0.32)
        for i, tab in enumerate(["Organizations", "Plans", "Inquiries", "Blog"]):
            tw = P(150 if i == 0 else 96)
            if tab_x + tw > ux + uw - P(12):
                break
            col = TEAL if i == 0 else SLATE
            add_text(els, "orgs.tab%d" % i, tab, tab_x, uy + P(8), tw, P(46),
                     sz(19), col, "i600", bg=(248, 251, 251), align="center",
                     delay=0.8 + i * 0.06, role="decor")
            if i == 0:
                add_rect(els, "orgs.tabline", tab_x, uy + P(54), tw, P(4), TEAL,
                         delay=0.85, bg=(248, 251, 251))
            tab_x += tw + P(6)
        # table header + 3 sequentially appearing rows
        cols = ["Clinic", "Login", "Plan", "Status", "Usage", "Period / Trial", "Actions"]
        hdr_y = uy + P(74)
        colw = [0.24, 0.22, 0.12, 0.12, 0.13, 0.11, 0.06]
        cx = ux + P(20)
        avail = uw - P(40)
        for i, c in enumerate(cols):
            add_text(els, "orgs.h%d" % i, c, cx, hdr_y, int(avail * colw[i]) - P(6),
                     P(30), sz(16), MUTED, "i700", bg=CARD, delay=0.85,
                     role="decor", wrap=False)
            cx += int(avail * colw[i])
        rowh = P(66)
        for r, row in enumerate(ORG_ROWS):
            ry = hdr_y + P(40) + r * rowh
            delay = 1.05 + r * 0.5
            add_rect(els, "orgs.row%d" % r, ux + P(12), ry, uw - P(24), rowh - P(6),
                     (249, 252, 252) if r % 2 == 0 else WHITE, radius=P(10),
                     delay=delay, anim="pop", bg=(249, 252, 252))
            cx = ux + P(20)
            for i, value in enumerate(row):
                short = value if i not in (5,) else value
                col = INK if i == 0 else SLATE
                if i == 3:
                    col = GREEN if value == "active" else AMBER
                if i == 6:
                    short = "->"
                add_text(els, "orgs.r%dc%d" % (r, i), short, cx, ry + P(4),
                         int(avail * colw[i]) - P(6), rowh - P(14),
                         sz(17), col, "i600" if i == 0 else "i500",
                         bg=(249, 252, 252) if r % 2 == 0 else WHITE,
                         delay=delay + 0.04, role="decor", wrap=False,
                         fit=True)
                cx += int(avail * colw[i])

        # right callout / stacked below in narrow
        if wide:
            sx, sy, sw, sh = X(0.70), Y(0.325), int(W * 0.245), int(H * 0.49)
        else:
            sx, sy, sw, sh = (X(0.06), Y(0.745), int(W * 0.88),
                              int(H * (0.15 if mode == "draft" else 0.125)))
        add_rect(els, "orgs.callout", sx, sy, sw, sh, TEAL, radius=P(20),
                 delay=1.3, bg=LIGHT)
        add_text(els, "orgs.callout.h", "1 ORGANIZATION", sx + P(26), sy + P(24),
                 sw - P(52), P(34), sz(21), MINT, "i800", bg=TEAL,
                 delay=1.4, role="decor")
        add_text(els, "orgs.callout.t", "= 1 clinic", sx + P(26), sy + P(62),
                 sw - P(52), P(70), sz(44),
                 {"draft": CORAL, "final": WHITE}, "p700", bg=TEAL,
                 delay=1.5, draft_bump=1.25)
        if wide:
            for i, line in enumerate(["organizationId har table par",
                                     "Apne users, apna data",
                                     "Apna subscription + plan"]):
                add_text(els, "orgs.callout.b%d" % i, "- " + line,
                         sx + P(26), sy + P(160) + i * P(50), sw - P(52), P(44),
                         sz(21), WHITE, "i500", bg=TEAL, delay=1.7 + i * 0.12,
                         role="decor")
        add_text(els, "orgs.caption", "Yahan se sab control.", X(0.06),
                 Y(0.875 if wide or mode == "draft" else 0.895),
                 W * (0.60 if wide else 0.88), Y(0.065), sz(30), INK, "i600",
                 bg=LIGHT, delay=1.35)

    # ---------------- 03 CREATE CLINIC ----------------
    elif sid == "03-create":
        add_text(els, "cr.kicker", "STEP 2 / CREATE CLINIC", X(0.06), Y(0.075),
                 W * 0.55, Y(0.045), sz(23), TEAL, "i800", bg=LIGHT, delay=0.1)
        add_text(els, "cr.title", "+ Create clinic", X(0.06), Y(0.13),
                 W * (0.60 if wide else 0.86), Y(0.10), sz(76), INK, "p700",
                 bg=LIGHT, delay=0.25)
        add_text(els, "cr.sub", "Ek form. Chaar cheezein automatic.", X(0.06), Y(0.235),
                 W * (0.60 if wide else 0.86), Y(0.065), sz(34), SLATE, "i500",
                 bg=LIGHT, delay=0.55, draft_bump=1.3, draft_color=CORAL)

        # real "Create clinic" modal
        mx, my, mw, mh = (X(0.06), Y(0.325), int(W * (0.53 if wide else 0.88)),
                          int(H * (0.55 if wide else 0.44)))
        add_rect(els, "cr.modal", mx, my, mw, mh, CARD, radius=P(20),
                 border=LINE, bw=P(2), delay=0.7, bg=CARD)
        add_text(els, "cr.modal.h", "Create clinic", mx + P(28), my + P(22),
                 mw - P(56), P(48), sz(34), INK, "p700", bg=CARD, delay=0.78)
        add_text(els, "cr.modal.note",
                 "Organization, subscription, first branch and Org Admin in one step.",
                 mx + P(28), my + P(78), mw - P(56), P(62), sz(18), SLATE, "i400",
                 bg=CARD, delay=0.85, role="decor", wrap=True)
        fields = ["Clinic name", "Owner / Org Admin name", "Org Admin email",
                  "Select plan... / 7-day trial"]
        fy = my + P(158)
        for i, f in enumerate(fields):
            add_rect(els, "cr.field%d" % i, mx + P(28), fy + i * P(62),
                     mw - P(56), P(50), (250, 252, 252), radius=P(9),
                     border=LINE, bw=P(1), delay=0.9 + i * 0.12, bg=(250, 252, 252))
            add_text(els, "cr.field%d.t" % i, f, mx + P(44), fy + i * P(62) + P(4),
                     mw - P(88), P(42), sz(19), SLATE, "i400",
                     bg=(250, 252, 252), delay=0.94 + i * 0.12, role="decor")
        by = my + mh - P(78)
        add_rect(els, "cr.btn", mx + mw - P(180), by, P(150), P(52), TEAL,
                 radius=P(10), delay=1.0, bg=CARD)
        add_text(els, "cr.btn.t", "Create", mx + mw - P(180), by, P(150), P(52),
                 sz(22), WHITE, "i700", bg=TEAL, align="center", delay=1.05,
                 role="decor")
        add_cursor(els, "cr.cursor", mx + int(mw * 0.55), my + int(mh * 0.55),
                   P(34), delay=1.05,
                   travel=(mx + mw - P(105), by + P(26), 1.05, 1.65))

        # four provisioned objects + toast
        if wide:
            cx0, cy0, cw = X(0.63), Y(0.36), int(W * 0.31)
        else:
            cx0, cy0, cw = X(0.06), Y(0.79), int(W * 0.88)
        chips = ["Organization", "Subscription", "Branch", "Org Admin"]
        for i, c in enumerate(chips):
            cy = cy0 + i * P(78) if wide else cy0
            cx = cx0 if wide else cx0 + i * int(cw / 4)
            cwi = cw if wide else int(cw / 4) - P(8)
            add_pill(els, "cr.chip%d" % i, "OK  " + c, cx, cy, cwi, P(62),
                     (226, 243, 239) if mode == "final" else (250, 226, 214),
                     {"draft": CORAL, "final": (13, 120, 96)}, sz(22),
                     delay=1.8 + i * 0.20, bg=LIGHT, role="decor",
                     draft_bump=1.3)
        if wide:
            tx, ty, toast_h = X(0.63), Y(0.76), Y(0.10)
            capy = Y(0.885)
        else:
            tx, ty, toast_h = X(0.06), Y(0.89), Y(0.07)
            capy = Y(0.72 if mode == "draft" else 0.815)
        add_text(els, "cr.toast", "Password privately share karein.",
                 tx, ty, W * (0.31 if wide else 0.88), toast_h, sz(24),
                 INK, "i600", bg=LIGHT, delay=2.05, draft_bump=1.25)
        if wide:
            add_bar(els, "cr.progress", X(0.06), Y(0.955), int(W * 0.88), P(8),
                    CORAL, (226, 235, 235), delay=1.5, dur=2.2)
        add_text(els, "cr.caption", "Clinic setup.", X(0.06), capy,
                 W * (0.52 if wide else 0.88), Y(0.05), sz(27), INK, "i600",
                 bg=LIGHT, delay=2.0)

    # ---------------- 04 PLANS ----------------
    elif sid == "04-plans":
        add_text(els, "pl.kicker", "STEP 3 / PLAN & LIMITS", X(0.06), Y(0.075),
                 W * 0.55, Y(0.045), sz(23), TEAL, "i800", bg=LIGHT, delay=0.1)
        add_text(els, "pl.title", "Plan = limits + features", X(0.06), Y(0.13),
                 W * (0.70 if wide else 0.86), Y(0.10), sz(70), INK, "p700",
                 bg=LIGHT, delay=0.25, draft_bump=1.22)
        add_text(els, "pl.sub", "Trial: 7 ya 14 din.",
                 X(0.06), Y(0.235), W * (0.70 if wide else 0.86), Y(0.07),
                 sz(31), SLATE, "i500", bg=LIGHT, delay=0.55,
                 draft_bump=1.35, draft_color=CORAL)
        top = Y(0.345)
        cardh = int(H * (0.42 if wide else (0.20 if mode == "draft" else 0.155)))
        cardw = int(W * (0.275 if wide else 0.88))
        for i, (name, price, bullets, popular) in enumerate(PLANS):
            if wide:
                cx = X(0.06) + i * int(W * 0.295)
                cy = top
            else:
                cx = X(0.06)
                cy = top + i * int(cardh * 1.06)
            delay = 0.75 + i * 0.5
            fill = TEAL if popular else CARD
            txt = WHITE if popular else INK
            sub = MINT if popular else SLATE
            add_rect(els, "pl.card%d" % i, cx, cy, cardw, cardh, fill,
                     radius=P(20), border=None if popular else LINE,
                     bw=P(2), delay=delay, bg=LIGHT)
            add_text(els, "pl.name%d" % i, name, cx + P(26), cy + P(22),
                     cardw - P(52), P(48), sz(34), txt, "p700", bg=fill,
                     delay=delay + 0.05)
            add_text(els, "pl.price%d" % i, price, cx + P(26), cy + P(78),
                     cardw - P(52), P(48), sz(28),
                     {"draft": CORAL, "final": ((164, 55, 28) if not popular else WHITE)},
                     "i700", bg=fill, delay=delay + 0.1)
            if popular:
                add_pill(els, "pl.pop", "EXAMPLE PLAN", cx + cardw - P(210), cy + P(24),
                         P(186), P(40), CORAL, DARK2, sz(17), delay=delay + 0.15,
                         bg=fill, role="decor")
            for j, b in enumerate(bullets[:3 if not wide else 4]):
                add_text(els, "pl.b%di%d" % (i, j), "- " + b,
                         cx + P(26), cy + P(142) + j * P(40), cardw - P(52), P(34),
                         sz(20), sub, "i500", bg=fill, delay=delay + 0.18,
                         role="decor")
        add_text(els, "pl.caption", "Plan values: seed examples.",
                 X(0.06), Y(0.875), W * 0.86, Y(0.06), sz(27), INK, "i600",
                 bg=LIGHT, delay=1.45)

    # ---------------- 05 DATA ISOLATION ----------------
    elif sid == "05-isolation":
        add_text(els, "iso.kicker", "STEP 4 / DATA ISOLATION", X(0.06), Y(0.075),
                 W * 0.55, Y(0.045), sz(23), TEAL, "i800", bg=LIGHT, delay=0.1)
        add_text(els, "iso.title", "Har clinic ka data alag", X(0.06), Y(0.13),
                 W * (0.70 if wide else 0.86), Y(0.10), sz(70), INK, "p700",
                 bg=LIGHT, delay=0.25, draft_bump=1.28)
        add_text(els, "iso.sub", "organizationId se clinic scope kiya jata hai.",
                 X(0.06), Y(0.235), W * (0.70 if wide else 0.86), Y(0.07),
                 sz(31), SLATE, "i500", bg=LIGHT, delay=0.55,
                 draft_bump=1.3, draft_color=CORAL)
        if wide:
            win_w, win_h = int(W * 0.375), int(H * 0.45)
            win_y = Y(0.34)
            wins = [(X(0.06), win_y), (X(0.545), win_y)]
        else:
            win_w, win_h = int(W * 0.88), int(H * 0.20)
            wins = [(X(0.06), Y(0.34)), (X(0.06), Y(0.56))]
        for k, (wx, wy) in enumerate(wins):
            name = "Sunrise Child Clinic" if k == 0 else "Bloom Kids Center"
            count = 42 if k == 0 else 9
            delay = 0.75 + k * 0.55
            add_rect(els, "iso.win%d" % k, wx, wy, win_w, win_h, CARD,
                     radius=P(16), border=LINE, bw=P(2), delay=delay, bg=LIGHT)
            add_rect(els, "iso.bar%d" % k, wx, wy, win_w, P(44), (238, 244, 244),
                     radius=P(16), delay=delay, bg=(238, 244, 244))
            add_text(els, "iso.name%d" % k, name, wx + P(18), wy + P(2),
                     win_w - P(36), P(40), sz(21), INK, "i700",
                     bg=(238, 244, 244), delay=delay + 0.05, role="decor")
            # real sidebar labels
            for i, lab in enumerate(SIDEBAR[:4 if not wide else 6]):
                add_text(els, "iso.s%d_%d" % (k, i), lab,
                         wx + P(18), wy + P(62) + i * P(34), int(win_w * 0.42), P(30),
                         sz(16), SLATE, "i500", bg=CARD,
                         delay=delay + 0.1, role="decor")
            add_text(els, "iso.count%d" % k, "Patients: %d" % count,
                     wx + int(win_w * 0.50), wy + P(76), int(win_w * 0.45), P(56),
                     sz(28), TEAL, "i700", bg=CARD, delay=delay + 0.15,
                     role="decor", counter=(count, delay + 0.15, 0.8))
            add_rect(els, "iso.stat%d" % k, wx + int(win_w * 0.50), wy + P(150),
                     int(win_w * 0.40), P(50), (240, 247, 247), radius=P(10),
                     delay=delay + 0.2, bg=(240, 247, 247))
        if mode == "draft":
            bx, by = (X(0.455), Y(0.53)) if wide else (X(0.30), Y(0.775))
            code_y, cap_y = Y(0.875), (Y(0.815) if not wide else Y(0.925))
        else:
            bx, by = (X(0.42), Y(0.805)) if wide else (X(0.30), Y(0.775))
            code_y, cap_y = (Y(0.885) if wide else Y(0.845)), (Y(0.935) if wide else Y(0.905))
        add_pill(els, "iso.badge", "organizationId", bx, by,
                 P(300) if wide else P(400), P(60), TEAL_DEEP, WHITE, sz(23),
                 delay=1.5, bg=LIGHT, role="decor", draft_bump=1.25)
        add_text(els, "iso.code", "Clinic-specific scope", X(0.06), code_y,
                 W * 0.86, Y(0.06), sz(26), INK, "i600", bg=LIGHT, delay=1.5)
        add_text(els, "iso.caption", "Isolation verify karein.",
                 X(0.06), cap_y, W * 0.86, Y(0.045), sz(22), SLATE, "i500",
                 bg=LIGHT, delay=1.55)

    # ---------------- 06 OUTRO ----------------
    elif sid == "06-outro":
        add_text(els, "out.l1", "AB TRY KARO.", X(0.065), Y(0.13),
                 W * 0.86, Y(0.16), sz(132), WHITE, "p800", bg=DARK2,
                 delay=0.15, wrap=False)
        add_text(els, "out.l2", "Ek codebase. Kai clinics.", X(0.065), Y(0.30),
                 W * 0.86, Y(0.10), sz(54),
                 {"draft": CORAL, "final": CORAL}, "p600", bg=DARK2,
                 delay=0.6, draft_bump=1.2)
        steps = ["1   Platform Admin login",
                 "2   Create clinic -> plan chuno",
                 "3   Org Admin login"]
        for i, s in enumerate(steps):
            add_text(els, "out.step%d" % i, s, X(0.07), Y(0.45) + i * Y(0.09),
                     W * (0.58 if wide else 0.86), Y(0.075), sz(32), MINT, "i500",
                     bg=DARK2, delay=0.95 + i * 0.5, draft_bump=1.28)
        add_image(els, "out.logo", X(0.72) if wide else X(0.36), Y(0.43),
                  sz(210), sz(210), delay=1.3)
        add_text(els, "out.brand", "AetherDev Solutions", X(0.06), Y(0.845),
                 W * 0.55, Y(0.06), sz(30), WHITE, "i700", bg=DARK2, delay=1.9)
        add_text(els, "out.foot", "Illustrative UI  -  22s  -  Guide: BASIC-GUIDE-HINDI.md",
                 X(0.06), Y(0.915), W * 0.88, Y(0.045), sz(20), MINT, "i400",
                 bg=DARK2, delay=2.1, role="decor")
    return els


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------
def element_alpha(el, lt, dur, mode):
    if lt < el.get("delay", 0):
        return 0.0
    a = 1.0
    if el.get("anim", "fade_up") != "none":
        a = ease((lt - el.get("delay", 0)) / ENTRANCE)
    if mode == "final":
        if lt < EXIT_DIP:
            a *= clamp(lt / EXIT_DIP)
        if lt > dur - EXIT_DIP:
            a *= clamp((dur - lt) / EXIT_DIP)
    return clamp(a)


def draw_element(img, el, lt, dur, mode, G):
    a = element_alpha(el, lt, dur, mode)
    if a <= 0.004:
        return
    P = G["P"]
    x, y, w, h = el["x"], el["y"], el["w"], el["h"]
    if el["kind"] == "cursor" and el.get("travel"):
        tx, ty, t0, t1 = el["travel"]
        p = ease((lt - t0) / max(0.001, t1 - t0))
        x += int((tx - x) * p)
        y += int((ty - y) * p)
    pad = max(3, P(8))
    off = 0
    if el.get("anim") == "fade_up":
        off = int((1 - a) * P(28))
    elif el.get("anim") == "pop":
        off = int((1 - a) * P(12))
    LW, LH = max(1, int(w) + 2 * pad), max(1, int(h) + 2 * pad)
    layer = Image.new("RGBA", (LW, LH), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    kind = el["kind"]

    if kind == "rect":
        fill = el["fill"]
        col = blend(el.get("bg", LIGHT), fill, a)
        box = (pad, pad, pad + w, pad + h)
        r = min(el.get("radius", 0), min(w, h) // 2)
        if r > 0:
            ld.rounded_rectangle(box, radius=r, fill=col + (255,))
        else:
            ld.rectangle(box, fill=col + (255,))
        if el.get("border"):
            bc = blend(el.get("bg", LIGHT), el["border"], a)
            if r > 0:
                ld.rounded_rectangle(box, radius=r, outline=bc + (255,), width=max(1, el.get("bw", 1)))
            else:
                ld.rectangle(box, outline=bc + (255,), width=max(1, el.get("bw", 1)))

    elif kind == "text":
        lines, f, tw, th, sz = prepare_text(el, mode)
        text = "\n".join(lines)
        # typing animation reveals characters of the (single) headline
        if el.get("anim") == "type" and el.get("type_dur"):
            full = str(el["text"])
            n = int(len(full) * clamp((lt - el["delay"]) / el["type_dur"]))
            shown = full[:n]
            lines = [shown]
            f = font(el["weight"], sz)
            tw, th, _ = text_metrics(shown or " ", sz, el["weight"])
        color = blend(el.get("bg", WHITE), el_color(el, mode), a)
        c = color + (255,)
        line_h = max(1, int(sz * el.get("spacing", 1.12)))
        total_h = line_h * len(lines)
        if el["valign"] == "middle":
            ty = pad + max(0, (h - total_h) // 2)
        elif el["valign"] == "bottom":
            ty = pad + max(0, h - total_h)
        else:
            ty = pad
        for i, ln in enumerate(lines):
            lw = text_metrics(ln or " ", sz, el["weight"])[0]
            if el["align"] == "center":
                tx = pad + max(0, (w - lw) // 2)
            elif el["align"] == "right":
                tx = pad + max(0, w - lw)
            else:
                tx = pad
            ld.text((tx, ty + i * line_h), ln, font=f, fill=c)

    elif kind == "image":
        # The source PNG has a TRANSPARENT background whose RGB is black.
        # Composite it onto a white rounded card before pasting, otherwise
        # forcing the alpha channel turns that black into a black square.
        base = Image.new("RGBA", (w, h), (255, 255, 255, 0))
        ImageDraw.Draw(base).rounded_rectangle(
            (0, 0, w - 1, h - 1), radius=max(4, int(w * 0.16)),
            fill=(255, 255, 255, 255))
        base.alpha_composite(logo(w).copy())
        if a < 1:
            base.putalpha(base.getchannel("A").point(lambda v: int(v * a)))
        layer.alpha_composite(base, (pad, pad))

    elif kind == "cursor":
        c = (22, 43, 53, int(255 * a))
        poly = [(pad, pad), (pad, pad + h), (pad + int(w * 0.32), pad + int(h * 0.72)),
                (pad + int(w * 0.52), pad + int(h * 0.98)), (pad + int(w * 0.66), pad + int(h * 0.90)),
                (pad + int(w * 0.44), pad + int(h * 0.64)), (pad + w, pad + int(h * 0.62))]
        ld.polygon(poly, fill=c)

    elif kind == "bar":
        p = clamp((lt - el["delay"]) / el.get("dur", 0.9))
        col = blend(el.get("track", LIGHT), el["track"], a)
        ld.rounded_rectangle((pad, pad, pad + w, pad + h), radius=h // 2, fill=col + (255,))
        fc = blend(el.get("track", LIGHT), el["fill"], a)
        fw = max(1, int(w * p))
        ld.rounded_rectangle((pad, pad, pad + fw, pad + h), radius=h // 2, fill=fc + (255,))

    img.paste(layer, (int(x) - pad, int(y) - pad + off), layer)


def render_scene(scene_id, lt, W, H, mode, alpha_scale=1.0):
    G = geom(W, H)
    dur = next(s["end"] - s["start"] for s in SCENES if s["id"] == scene_id)
    img = scene_bg(scene_id, W, H).copy()
    add_breath(img, lt + next(s["start"] for s in SCENES if s["id"] == scene_id), W, H,
               scene_id in ("01-hook", "06-outro"))
    # counter animation is handled here by patching the text value in-place
    els = scene_elements(scene_id, W, H, mode)
    for el in els:
        if el.get("counter"):
            target, t0, durc = el["counter"]
            p = ease((lt - t0) / durc)
            cur = int(target * p)
            el["text"] = "Patients: %d" % cur
        draw_element(img, el, lt, dur, mode, G)
    if alpha_scale < 1.0:
        img.putalpha(int(255 * alpha_scale))
    return img.convert("RGB")


def scene_at(t):
    for s in SCENES:
        if s["start"] <= t < s["end"]:
            return s, t - s["start"]
    s = SCENES[-1]
    return s, s["end"] - s["start"] - 0.001


def render_frame(t, W, H, mode, poster=False):
    if poster:
        return render_scene("01-hook", 2.6, W, H, "final")
    s, lt = scene_at(t)
    if mode == "draft":
        # naive crossfade: both busy layouts visible -> real double exposure
        near = None
        for c in CUTS:
            if abs(t - c) < DRAFT_XFADE / 2:
                near = c
                break
        if near is not None:
            p = clamp((t - (near - DRAFT_XFADE / 2)) / DRAFT_XFADE)
            prev = SCENES[[i for i, s2 in enumerate(SCENES) if s2["start"] == near][0] - 1]
            a = render_scene(prev["id"], prev["end"] - prev["start"] - 0.01, W, H, mode)
            next_scene = next(z for z in SCENES if z["start"] == near)
            b = render_scene(next_scene["id"], max(0, t - near), W, H, mode)
            return Image.blend(a, b, 0.15 + 0.7 * p)
    return render_scene(s["id"], lt, W, H, mode)


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------
def render_video(out_path, W, H, mode, audio=True):
    cmd = [FFMPEG, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", "%dx%d" % (W, H),
           "-r", str(FPS), "-i", "-"]
    has_audio = audio and os.path.exists(AUDIO_PATH)
    if has_audio:
        cmd += ["-i", AUDIO_PATH, "-map", "0:v", "-map", "1:a",
                "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest"]
    else:
        cmd += ["-map", "0:v", "-an"]
    cmd += ["-c:v", "libx264", "-preset", "medium", "-crf", "19",
            "-pix_fmt", "yuv420p", "-r", str(FPS),
            "-movflags", "+faststart", out_path]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n = int(DURATION * FPS)
    for i in range(n):
        t = i / FPS
        img = render_frame(t, W, H, mode, poster=(i == 0 and mode == "final"))
        proc.stdin.write(img.tobytes())
    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError("ffmpeg exited %s" % rc)
    return out_path


def render_stills(outdir, W, H, mode):
    os.makedirs(outdir, exist_ok=True)
    times = [0.0, 1.2, 2.6, 3.5, 5.2, 7.0, 9.4, 11.0, 13.0,
             14.5, 16.4, 18.0, 20.6]
    for t in times:
        im = render_frame(t, W, H, mode, poster=False)
        im.save(os.path.join(outdir, "%s_%05.1fs.jpg" % (mode, t)), quality=88)
    return times


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="final", choices=["draft", "final"])
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--out", default=None)
    ap.add_argument("--stills", action="store_true")
    ap.add_argument("--outdir", default=None)
    ap.add_argument("--no-audio", action="store_true")
    args = ap.parse_args()
    W, H = [int(v) for v in args.size.split("x")]
    if args.stills:
        times = render_stills(args.outdir or os.path.join(OUT, "audit", "stills"), W, H, args.mode)
        print(json.dumps({"stills": len(times), "size": [W, H], "mode": args.mode}))
        return
    out = args.out or os.path.join(OUT, "brag-%s.mp4" % args.mode)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    render_video(out, W, H, args.mode, audio=not args.no_audio)
    print(json.dumps({"out": out, "size": [W, H], "mode": args.mode,
                      "frames": int(DURATION * FPS), "duration": DURATION}))


if __name__ == "__main__":
    main()
