#!/usr/bin/env python3
"""Five centuries of making, as a pixel time-lapse.

One street corner by a river, watched from 1450 to 2026. Workshops become mills, mills become
terraces, terraces become towers; carts give way to trains, cars and drones. A dot-matrix year
counter and an era timeline run along the frame. It ends with a drone flying into a doorway of
light, which brings the loop back to 1450.

    python3 scripts/art/story.py                        writes assets/story-day.webp and story-night.webp
    python3 scripts/art/story.py --only day --sheet F   also writes a contact sheet of key frames to F
    GATE_SCALE=1 python3 scripts/art/story.py           native 320x160, for quick looks

Needs Pillow and numpy. Deterministic and seamless.
"""
import math
import os
import sys

import numpy as np
from PIL import Image

W, H = 320, 160
FPS = 12.5
ERA_S = 3.0
SCALE = int(os.environ.get('GATE_SCALE', 5))
TAU = 2 * math.pi
STREET = 120      # buildings stand on this line
WALK = 127        # people's feet
RAIL = 133        # rail top
RIVER = 139       # water's edge
YY, XX = np.mgrid[0:H, 0:W]
CROP = 30         # rows of empty sky trimmed off the top of the final frame


def rgb(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.uint8)


def rng(seed):
    a = seed & 0xFFFFFFFF

    def r():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        x = ((a ^ (a >> 15)) * (1 | a)) & 0xFFFFFFFF
        x = (x + (((x ^ (x >> 7)) * (61 | x)) & 0xFFFFFFFF)) ^ x
        return ((x ^ (x >> 14)) & 0xFFFFFFFF) / 4294967296

    return r


def mix(a, b, k):
    return (np.asarray(a, float) * (1 - k) + np.asarray(b, float) * k).astype(np.uint8)


def smooth(p):
    p = min(max(p, 0.0), 1.0)
    return p * p * (3 - 2 * p)


class Canvas:
    def __init__(self, c):
        self.c = c

    def px(self, x, y, col):
        x, y = int(round(x)), int(round(y))
        h, w = self.c.shape[:2]
        if col is not None and 0 <= x < w and 0 <= y < h:
            self.c[y, x] = col

    def rect(self, x, y, w, h, col):
        x0, y0 = max(0, int(round(x))), max(0, int(round(y)))
        x1, y1 = min(self.c.shape[1], int(round(x + w))), min(self.c.shape[0], int(round(y + h)))
        if x1 > x0 and y1 > y0 and col is not None:
            self.c[y0:y1, x0:x1] = col

    def hline(self, x0, x1, y, col):
        self.rect(x0, y, x1 - x0 + 1, 1, col)

    def vline(self, x, y0, y1, col):
        self.rect(x, y0, 1, y1 - y0 + 1, col)

    def line(self, x0, y0, x1, y1, col):
        x0, y0, x1, y1 = (int(round(v)) for v in (x0, y0, x1, y1))
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.px(x0, y0, col)
            if x0 == x1 and y0 == y1:
                return
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def glow(self, x, y, col, r=2, k=0.35):
        """A soft halo for a light source: blended, not dithered."""
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                d = math.hypot(dx, dy)
                if 0 < d <= r + 0.3:
                    xx, yy = int(round(x + dx)), int(round(y + dy))
                    if 0 <= xx < self.c.shape[1] and 0 <= yy < self.c.shape[0]:
                        self.c[yy, xx] = mix(self.c[yy, xx], col, k * (1 - d / (r + 1)))


# ---------------------------------------------------------------- palettes

ACCENTS = {
    # name: (label, night, day, second night, second day)
    'amber': ('Amber LED', '#ffb547', '#a35f00', '#5fd4c4', '#0d7a70'),
    'phosphor': ('Phosphor', '#7dffb2', '#0b7d4c', '#ffd166', '#946b00'),
    'cobalt': ('Cobalt and brass', '#8fb0ff', '#2443c4', '#f2c86b', '#8a6200'),
    'ice': ('Ice and rose', '#8ee6ff', '#006f97', '#ff9cba', '#ad2f5b'),
}


def palette(night):
    if night:
        p = dict(
            sky=['#070a1d', '#0a0e26', '#0f1430', '#151b3b', '#1d2347', '#272c52'],
            star='#cfd8ff', star_dim='#6d77a6', orb='#eef1ff', orb_glow='#1d2452',
            cloud=['#141a3b', '#1f2650', '#2c3463'],
            hill_far='#141834', hill_near='#0f1229', tree='#0b0e22',
            wall=['#1a1a2a', '#252536', '#323246'], timber='#2b2230', plaster='#2b2d40', plaster_hi='#36384d',
            roof=['#1d1828', '#2a2236', '#372c45'], brick=['#2a1a22', '#3a242c', '#4a2e36'],
            stone=['#1f2131', '#2b2e42', '#383c54'], concrete=['#20222f', '#2c2f3e', '#393d4f'],
            glass=['#0f1a33', '#18284a', '#25406a'], glass_hi='#3c5f92', metal=['#1a1c26', '#2a2d3a', '#3d4152'],
            window_off='#151826', street=['#12131c', '#191a26', '#22232f'], cobble='#1d1e2b', asphalt='#15161f',
            line='#4a4a5a', rail='#4b4f64', sleeper='#1c1612', water=['#0a0f2a', '#0f1736', '#172246'],
            glint='#8fa2e6', grass=['#0c1a16', '#132620'], leaf=['#0b1712', '#10221a', '#163024'],
            smoke=['#2a2c3c', '#363849'], skin=['#c28a68', '#8a5a40', '#5a3a2a', '#e0b090'],
            ink='#05060c', shadow='#05060c',
        )
    else:
        p = dict(
            sky=['#4d8fd6', '#5c9cdd', '#6eaae3', '#82b9e9', '#99c8ee', '#b4d8f1'],
            star=None, star_dim=None, orb='#fff6d5', orb_glow='#cfe6f6',
            cloud=['#b9cde4', '#e1ecf6', '#ffffff'],
            hill_far='#86a9c6', hill_near='#6b9a86', tree='#3f7a5c',
            wall=['#a8a196', '#c4bdb0', '#ddd6c8'], timber='#5a3d2b', plaster='#e6dcc6', plaster_hi='#f5eedc',
            roof=['#6a3b2c', '#8a4a33', '#a85d3c'], brick=['#7a3a2c', '#95493a', '#b05c48'],
            stone=['#8a8a92', '#a6a6ad', '#c2c2c8'], concrete=['#9a9ca4', '#b6b8be', '#d0d2d6'],
            glass=['#4f7fae', '#6fa1cb', '#9fc8e6'], glass_hi='#e4f3fb', metal=['#5a5f6c', '#7d8291', '#a7acb8'],
            window_off='#3d4a5c', street=['#7e7a74', '#96918a', '#aca79f'], cobble='#8c8780', asphalt='#55575e',
            line='#f2efe6', rail='#5a5e6a', sleeper='#5a3d2b', water=['#2f6fae', '#3f82bf', '#5a9ccf'],
            glint='#ffffff', grass=['#4f8f3c', '#6aac4a'], leaf=['#2f6a35', '#468a3f', '#62a84a'],
            smoke=['#9c9a96', '#bdbab4'], skin=['#e2b08c', '#a8724f', '#6a432c', '#f2caa6'],
            ink='#1c1a22', shadow='#5a6a54',
        )
    out = {}
    for k, v in p.items():
        out[k] = None if v is None else [rgb(x) for x in v] if isinstance(v, list) else rgb(v)
    out['night'] = night
    out['ember'] = rgb('#ffb067')       # firelight and candles
    out['gas'] = rgb('#ffd27a')
    out['bulb'] = rgb('#fff0b8')
    out['led'] = rgb('#e8f4ff')
    # The accent: the colour of the year, the timeline and a few painted details. Chosen per theme
    # so it holds contrast on a night sky and on a day sky.
    a = ACCENTS[os.environ.get('STORY_ACCENT', 'cobalt')]
    out['accent'] = rgb(a[1] if night else a[2])
    out['accent2'] = rgb(a[3] if night else a[4])
    out['accent_dk'] = mix(out['accent'], rgb('#000000'), 0.25)
    return out


# ---------------------------------------------------------------- the story

ERAS = [
    (1450, 1599, 'THE PRINTING PRESS'),
    (1600, 1711, 'WIND AND CLOCKWORK'),
    (1712, 1769, 'THE STEAM ENGINE'),
    (1770, 1824, 'THE MILLS'),
    (1825, 1843, 'THE RAILWAY'),
    (1844, 1899, 'WIRES AND LIGHT'),
    (1900, 1945, 'CARS AND FLIGHT'),
    (1946, 1970, 'THE SPACE AGE'),
    (1971, 2006, 'THE DIGITAL AGE'),
    (2007, 2026, 'TODAY'),
]
N_ERAS = len(ERAS)
D = N_ERAS * ERA_S
N = int(round(D * FPS))


ERAS_GLOBAL = list(ERAS)
ERAS_NAIROBI = ERAS_GLOBAL[:5] + [
    (1899, 1919, 'NAIROBI IS BORN'),
    (1920, 1962, 'CARS AND FLIGHT'),
    (1963, 1972, 'INDEPENDENCE'),
    (1973, 2006, 'THE DIGITAL AGE'),
    (2007, 2026, 'NAIROBI TODAY'),
]
VARIANT = 'global'
JOURNEY = False
OVERRIDE = None   # (era, progress): draw that era whatever the clock says (journey segments, wipes)
NO_BUILD = False  # skip the rise-in-scaffolding transitions


def set_variant(v, journey=False):
    global VARIANT, ERAS, JOURNEY
    VARIANT, JOURNEY = v, journey
    ERAS = ERAS_NAIROBI if v == 'nairobi' else ERAS_GLOBAL


def in_nairobi(e):
    return VARIANT == 'nairobi' and e >= 5


def era_at(tt):
    if OVERRIDE is not None:
        return OVERRIDE
    e = min(N_ERAS - 1, int(tt // ERA_S))
    return e, (tt - e * ERA_S) / ERA_S


def year_at(tt):
    e, p = era_at(tt)
    a, b, _ = ERAS[e]
    return int(a + (b - a) * min(1.0, p / 0.85))


# ---------------------------------------------------------------- 5x7 dot font

FONT = {
    'A': ' ### |#   #|#   #|#####|#   #|#   #|#   #', 'B': '#### |#   #|#   #|#### |#   #|#   #|#### ',
    'C': ' ####|#    |#    |#    |#    |#    | ####', 'D': '#### |#   #|#   #|#   #|#   #|#   #|#### ',
    'E': '#####|#    |#    |#### |#    |#    |#####', 'F': '#####|#    |#    |#### |#    |#    |#    ',
    'G': ' ####|#    |#    |#  ##|#   #|#   #| ####', 'H': '#   #|#   #|#   #|#####|#   #|#   #|#   #',
    'I': '#####|  #  |  #  |  #  |  #  |  #  |#####', 'J': '  ###|   # |   # |   # |   # |#  # | ##  ',
    'K': '#   #|#  # |# #  |##   |# #  |#  # |#   #', 'L': '#    |#    |#    |#    |#    |#    |#####',
    'M': '#   #|## ##|# # #|# # #|#   #|#   #|#   #', 'N': '#   #|##  #|# # #|#  ##|#   #|#   #|#   #',
    'O': ' ### |#   #|#   #|#   #|#   #|#   #| ### ', 'P': '#### |#   #|#   #|#### |#    |#    |#    ',
    'Q': ' ### |#   #|#   #|#   #|# # #|#  # | ## #', 'R': '#### |#   #|#   #|#### |# #  |#  # |#   #',
    'S': ' ####|#    |#    | ### |    #|    #|#### ', 'T': '#####|  #  |  #  |  #  |  #  |  #  |  #  ',
    'U': '#   #|#   #|#   #|#   #|#   #|#   #| ### ', 'V': '#   #|#   #|#   #|#   #|#   #| # # |  #  ',
    'W': '#   #|#   #|#   #|# # #|# # #|## ##|#   #', 'X': '#   #|#   #| # # |  #  | # # |#   #|#   #',
    'Y': '#   #|#   #| # # |  #  |  #  |  #  |  #  ', 'Z': '#####|    #|   # |  #  | #   |#    |#####',
    '0': ' ### |#   #|#  ##|# # #|##  #|#   #| ### ', '1': '  #  | ##  |  #  |  #  |  #  |  #  | ### ',
    '2': ' ### |#   #|    #|   # |  #  | #   |#####', '3': '#####|   # |  #  |   # |    #|#   #| ### ',
    '4': '   # |  ## | # # |#  # |#####|   # |   # ', '5': '#####|#    |#### |    #|    #|#   #| ### ',
    '6': '  ## | #   |#    |#### |#   #|#   #| ### ', '7': '#####|    #|   # |  #  | #   | #   | #   ',
    '8': ' ### |#   #|#   #| ### |#   #|#   #| ### ', '9': ' ### |#   #|#   #| ####|    #|   # | ##  ',
    ' ': '     |     |     |     |     |     |     ', '-': '     |     |     |#####|     |     |     ',
}


def dot_text(cv, s, x, y, col, pitch=1, shadow=None):
    """Dot-matrix text. pitch 2 leaves a gap between dots, like Doto."""
    for ch in s:
        rows = FONT.get(ch, FONT[' ']).split('|')
        for j, row in enumerate(rows):
            for i, v in enumerate(row):
                if v == '#':
                    if shadow is not None:
                        cv.px(x + i * pitch + 1, y + j * pitch + 1, shadow)
                    cv.px(x + i * pitch, y + j * pitch, col)
        x += 6 * pitch
    return x


def big_dots(cv, s, x, y, col, shadow):
    """The year: 2x2 dots on a 3 px pitch, like a dot-matrix sign."""
    for ch in s:
        rows = FONT.get(ch, FONT[' ']).split('|')
        for j, row in enumerate(rows):
            for i, v in enumerate(row):
                if v == '#':
                    if shadow is not None:
                        cv.rect(x + i * 3 + 1, y + j * 3 + 1, 2, 2, shadow)
                    cv.rect(x + i * 3, y + j * 3, 2, 2, col)
        x += 17
    return x


def text_width(s, pitch=1):
    return len(s) * 6 * pitch - pitch


# ---------------------------------------------------------------- sky and land

def sky(cv, P, tt):
    e, _ = era_at(tt)
    bands = [0, 14, 30, 48, 68, 88, 112]
    smog = 0.0
    if not P['night']:
        smog = [0, 0, 0.12, 0.28, 0.36, 0.42, 0.34, 0.2, 0.08, 0][e]
    for i in range(len(bands) - 1):
        col = P['sky'][i]
        if smog:
            col = mix(col, rgb('#b8ad97'), smog * (i / 5))
        cv.rect(0, bands[i], W, bands[i + 1] - bands[i], col)
        if i:
            for x in range(0, W, 4):
                cv.px(x + (i % 2) * 2, bands[i], P['sky'][i - 1] if not smog else mix(P['sky'][i - 1], rgb('#b8ad97'), smog * ((i - 1) / 5)))
    # The glow of the town on the night sky grows with every era.
    if P['night']:
        city = [0.02, 0.03, 0.05, 0.08, 0.1, 0.16, 0.24, 0.32, 0.4, 0.46][e]
        warm = rgb('#6b4a5a') if e < 9 else rgb('#4a5a7a')
        for y in range(60, 112):
            k = city * ((y - 60) / 52) ** 1.5
            cv.c[y, :] = mix(cv.c[y, :], warm, k)


STARS = [(int(rng(4 + i)() * W), int(CROP + rng(99 + i)() * 48), rng(7 + i)()) for i in range(70)]


def stars(cv, P, tt):
    if not P['night']:
        return
    e, _ = era_at(tt)
    keep = 1 - [0, 0, 0.05, 0.1, 0.15, 0.25, 0.35, 0.45, 0.55, 0.6][e]  # light pollution hides them
    for i, (x, y, ph) in enumerate(STARS):
        if ph > keep:
            continue
        tw = math.sin(TAU * (2 * tt / D * (1 + i % 3) + ph))
        if tw > -0.4:
            cv.px(x, y, P['star'] if ph < 0.3 else P['star_dim'])


def orb(cv, P):
    ox, oy, r = 268, 46, 8 if P['night'] else 9
    d = np.hypot(XX - ox, YY - oy)
    cv.c[(d <= r + 5) & (YY < 100)] = mix(cv.c[(d <= r + 5) & (YY < 100)], P['orb_glow'], 0.6)
    cv.c[d <= r] = P['orb']
    if P['night']:
        cv.c[(d <= r) & (np.hypot(XX - ox + 3, YY - oy + 1) <= r - 1)] = mix(P['orb'], P['sky'][1], 0.75)


def cloud(cv, P, cx, cy, puffs):
    lo, mid, hi = P['cloud']
    for dx, dy, rr in puffs:
        m = (np.hypot(XX - cx - dx, (YY - cy - dy) * 1.3) <= rr) & (YY <= cy + 2)
        cv.c[m] = mid
    for dx, dy, rr in puffs:
        m = (np.hypot(XX - cx - dx + 1, (YY - cy - dy + 1.5) * 1.3) <= rr - 1.3) & (YY <= cy)
        cv.c[m] = hi
    m = (YY >= cy + 1) & (YY <= cy + 2) & (np.abs(XX - cx) < max(abs(p[0]) for p in puffs) + 2)
    cv.c[m & (cv.c == mid).all(axis=2)] = lo


def hills(cv, P, e=0):
    if in_nairobi(e):
        return ngong(cv, P)
    for x in range(W):
        far = int(96 + 6 * math.sin(x / 31 + 1.2) + 3 * math.sin(x / 13) + 1.4 * math.sin(x / 5.1))
        near = int(106 + 3 * math.sin(x / 22 + 3) + 1.5 * math.sin(x / 7))
        cv.c[far:STREET, x] = P['hill_far']
        cv.c[near:STREET, x] = P['hill_near']
    r = rng(12)
    x = 0
    while x < W:
        h = int(4 + r() * 5)
        base = int(106 + 3 * math.sin(x / 22 + 3) + 1.5 * math.sin(x / 7)) + 1
        for j in range(h):
            half = int((j / h) * 2.2 + 0.5)
            cv.hline(x - half, x + half, base - h + j, P['tree'])
        x += int(3 + r() * 6)


def ngong(cv, P):
    """The Ngong Hills, whose four summits gave them their name (knuckles), over a savanna of acacias."""
    for x in range(W):
        knuckles = sum(h * math.exp(-((x - c) / 10) ** 2) for c, h in ((196, 15), (219, 18), (241, 14), (262, 10)))
        far = int(101 - knuckles + 2 * math.sin(x / 37))
        near = int(108 + 1.5 * math.sin(x / 19))
        cv.c[far:STREET, x] = P['hill_far']
        cv.c[near:STREET, x] = P['hill_near']
    for x in (12, 47, 92, 140, 176, 232, 287, 309):
        acacia(cv, P, x, int(108 + 1.5 * math.sin(x / 19)) + 1, small=True)


def acacia(cv, P, x, base, small=False):
    h, w = (6, 9) if small else (16, 24)
    canopy = P['tree'] if small else P['leaf'][1]
    trunk = P['tree'] if small else P['timber']
    cv.vline(x, base - h, base, trunk)
    cv.line(x, base - h + 4, x - 4, base - h, trunk)
    cv.line(x, base - h + 4, x + 4, base - h, trunk)
    cv.hline(x - w // 2, x + w // 2, base - h, canopy)
    cv.hline(x - w // 2 + 2, x + w // 2 - 2, base - h - 1, canopy)
    if not small:
        cv.hline(x - w // 2 + 1, x + w // 2 - 1, base - h + 1, mix(canopy, P['ink'], 0.3))
        cv.hline(x - w // 2 + 5, x + w // 2 - 5, base - h - 2, P['leaf'][2])


def ground(cv, P, tt):
    e, _ = era_at(tt)
    # Street: dirt, then cobbles (1600s), then asphalt with a pavement (1900s on).
    if e <= 0:
        cv.rect(0, STREET, W, RAIL - STREET - 2, P['street'][1])
        r = rng(3)
        for _ in range(60):
            cv.px(r() * W, STREET + 1 + r() * 9, P['street'][0])
    elif e <= 5:
        cv.rect(0, STREET, W, RAIL - STREET - 2, P['cobble'])
        for y in range(STREET + 1, RAIL - 2, 2):
            for x in range((y // 2) % 2 * 2, W, 4):
                cv.px(x, y, P['street'][0])
    else:
        cv.rect(0, STREET, W, 3, P['street'][2])
        cv.hline(0, W, STREET + 3, P['street'][0])
        cv.rect(0, STREET + 4, W, RAIL - STREET - 6, P['asphalt'])
        if e >= 7:
            for x in range(0, W, 12):
                cv.hline(x, x + 5, STREET + 8, P['line'])
    # Embankment, then the rails from 1825.
    cv.rect(0, RAIL - 2, W, RIVER - RAIL + 2, P['grass'][0])
    cv.hline(0, W, RAIL - 2, P['grass'][1])
    if e >= 4:
        for x in range(0, W, 4):
            cv.rect(x, RAIL + 1, 2, 2, P['sleeper'])
        cv.hline(0, W, RAIL, P['rail'])
        cv.hline(0, W, RAIL + 2, mix(P['rail'], P['ink'], 0.4))


def river(cv, P, tt):
    cv.rect(0, RIVER, W, H - RIVER, P['water'][0])
    cv.rect(0, RIVER, W, 3, P['water'][2])
    cv.rect(0, RIVER + 3, W, 4, P['water'][1])
    for y in range(RIVER + 2, H, 3):
        off = int((tt / D) * 64 * (1 + y % 2)) % 32
        for x in range(-32 + off + (y * 7) % 32, W, 32):
            cv.hline(x, x + 2 + (y - RIVER) // 6, y, P['glint'] if y < RIVER + 8 else mix(P['water'][1], P['glint'], 0.4))


# ---------------------------------------------------------------- buildings

def windows(cv, P, x, y, w, h, cols, rows, lit_kind, seed, tt, size=(2, 3), gap=(3, 4)):
    """A grid of windows; at night some are lit with the era's light."""
    r = rng(seed)
    sw, sh = size
    gx, gy = gap
    light = {'candle': P['ember'], 'gas': P['gas'], 'bulb': P['bulb'], 'led': P['led']}.get(lit_kind)
    for j in range(rows):
        for i in range(cols):
            wx, wy = x + i * (sw + gx), y + j * (sh + gy)
            on = P['night'] and light is not None and r() < (0.55 if lit_kind == 'candle' else 0.75)
            if on and lit_kind == 'candle' and int(tt * FPS + i * 3 + j) % 9 == 0:
                on = False
            cv.rect(wx, wy, sw, sh, light if on else P['window_off'])
            if not P['night'] and not on:
                cv.px(wx, wy, mix(P['window_off'], P['glass_hi'] if 'glass_hi' in P else P['window_off'], 0.5))
            if on:
                cv.glow(wx + sw / 2, wy + sh / 2, light, 2, 0.25)


def gable_roof(cv, P, x, w, top, h, col, edge):
    for j in range(h):
        inset = int((h - j) * (w / 2) / h)
        cv.hline(x + inset - 1, x + w - inset, top + j, col)
        cv.px(x + inset - 1, top + j, edge)


def cottage(cv, P, x, w, tt, seed, light):
    h = 16
    top = STREET - h
    cv.rect(x, top, w, h, P['plaster'])
    cv.rect(x, top, 1, h, P['plaster_hi'])
    for bx in range(x + 3, x + w, 6):
        cv.vline(bx, top, STREET - 1, P['timber'])
    cv.hline(x, x + w - 1, top + 6, P['timber'])
    gable_roof(cv, P, x - 2, w + 4, top - 10, 10, P['roof'][1], P['roof'][2])
    cv.rect(x + w // 2 - 2, STREET - 7, 4, 7, P['timber'])
    windows(cv, P, x + 2, top + 2, w, 4, 2, 1, light, seed, tt, (3, 3), (w - 10, 4))


def press_shop(cv, P, x, tt, light):
    w, h = 44, 22
    top = STREET - h
    cv.rect(x, top, w, h, P['plaster'])
    for bx in (x, x + 14, x + 29, x + w - 1):
        cv.vline(bx, top, STREET - 1, P['timber'])
    cv.hline(x, x + w - 1, top, P['timber'])
    cv.hline(x, x + w - 1, top + 8, P['timber'])
    gable_roof(cv, P, x - 3, w + 6, top - 12, 12, P['roof'][0], P['roof'][2])
    # Open front: the press inside, the printer pulling its bar.
    ox = x + 15
    cv.rect(ox, top + 9, 13, h - 9, mix(P['timber'], P['ink'], 0.6))
    cv.rect(ox + 3, top + 10, 2, 11, P['timber'])
    cv.rect(ox + 9, top + 10, 2, 11, P['timber'])
    cv.rect(ox + 3, top + 10, 8, 2, P['timber'])
    cv.rect(ox + 4, top + 16, 6, 2, P['wall'][1])
    pull = int(tt * FPS / 3) % 2
    cv.line(ox + 10, top + 12, ox + 12, top + 9 + pull * 3, P['metal'][2])
    person(cv, P, ox + 13, STREET, dict(skin=1, hair='#2a1d14', hat='cap', coat='#6a4a8a', legs='#3a2a20'), 0, 1, arm=pull)
    # Printed sheets drying on a line.
    for i, sx in enumerate(range(x + 31, x + 42, 4)):
        cv.rect(sx, top + 10 + (i % 2), 3, 4, P['plaster_hi'] if not P['night'] else mix(P['plaster_hi'], P['ember'], 0.2))
    cv.hline(x + 30, x + 43, top + 9, P['ink'])
    if P['night']:
        cv.glow(ox + 6, top + 13, P['ember'], 4, 0.28)
        cv.px(ox + 6, top + 12, P['ember'])
    # Hanging sign.
    cv.hline(x + w, x + w + 4, top + 4, P['metal'][1])
    cv.rect(x + w + 1, top + 5, 6, 5, P['timber'])
    cv.rect(x + w + 2, top + 6, 4, 3, P['plaster_hi'])


def clock_tower(cv, P, x, tt, light):
    w, h = 16, 52
    top = STREET - h
    cv.rect(x, top, w, h, P['stone'][1])
    cv.rect(x, top, 2, h, P['stone'][2])
    cv.rect(x + w - 2, top, 2, h, P['stone'][0])
    for y in range(top + 4, STREET, 5):
        cv.hline(x + 2, x + w - 3, y, P['stone'][0])
    # Spire.
    for j in range(16):
        half = int((j / 16) * (w / 2 + 1))
        cv.hline(x + w // 2 - half, x + w // 2 + half - 1, top - 16 + j, P['roof'][0])
    # Clock face and its hands, which turn.
    cx, cy = x + w // 2, top + 10
    d = np.hypot(XX - cx + 0.5, YY - cy + 0.5)
    cv.c[d <= 5] = P['plaster_hi'] if not P['night'] else P['gas']
    cv.c[(d <= 5) & (d > 4.2)] = P['ink']
    a = TAU * tt / ERA_S
    cv.line(cx, cy, cx + round(math.sin(a) * 3.4), cy - round(math.cos(a) * 3.4), P['ink'])
    cv.line(cx, cy, cx + round(math.sin(a / 12) * 2), cy - round(math.cos(a / 12) * 2), P['ink'])
    if P['night']:
        cv.glow(cx, cy, P['gas'], 6, 0.18)
    cv.rect(x + 5, STREET - 10, 6, 10, P['timber'])
    cv.rect(x + 6, top + 22, 4, 7, P['window_off'] if not (P['night'] and light) else P['ember'])


def windmill(cv, P, x, tt, base):
    cx = x + 6
    for j in range(24):
        half = 3 + j // 6
        cv.hline(cx - half, cx + half, base - 24 + j, P['plaster'] if j % 6 else P['timber'])
    gable_roof(cv, P, cx - 5, 11, base - 30, 6, P['roof'][1], P['roof'][2])
    hub = (cx, base - 24)
    a0 = TAU * tt / 1.6
    for k in range(4):
        a = a0 + k * TAU / 4
        ex, ey = hub[0] + math.cos(a) * 15, hub[1] + math.sin(a) * 15
        cv.line(hub[0], hub[1], ex, ey, P['timber'])
        px_, py_ = -math.sin(a), math.cos(a)
        for s in range(5, 15, 2):
            mx, my = hub[0] + math.cos(a) * s, hub[1] + math.sin(a) * s
            cv.line(mx, my, mx + px_ * 3, my + py_ * 3, P['plaster_hi'] if not P['night'] else P['plaster'])
    cv.px(*hub, P['ink'])


def turbine(cv, P, x, tt, base, phase=0.0):
    cv.vline(x, base - 30, base, P['concrete'][2])
    hub = (x, base - 30)
    a0 = TAU * (tt / 2.4 + phase)
    for k in range(3):
        a = a0 + k * TAU / 3
        cv.line(hub[0], hub[1], hub[0] + math.cos(a) * 13, hub[1] + math.sin(a) * 13, P['concrete'][2])
    cv.px(*hub, P['metal'][2])
    if P['night'] and int(tt * FPS) % 10 < 5:
        cv.px(hub[0], hub[1] - 1, rgb('#ff4a3a'))


def engine_house(cv, P, x, tt):
    w, h = 22, 26
    top = STREET - h
    cv.rect(x, top, w, h, P['stone'][1])
    cv.rect(x, top, 2, h, P['stone'][2])
    for y in range(top + 3, STREET, 4):
        cv.hline(x + 2, x + w - 1, y, P['stone'][0])
    gable_roof(cv, P, x - 1, w + 2, top - 6, 6, P['roof'][0], P['roof'][1])
    # Chimney and smoke.
    cv.rect(x + w - 5, top - 22, 4, 22, P['brick'][1])
    smoke(cv, P, x + w - 3, top - 23, tt, 1.0)
    # The rocking beam on the wall, and the pump rod below it.
    pivot = (x + 4, top - 2)
    a = math.sin(TAU * tt / 1.2) * 0.22
    ex, ey = pivot[0] - math.cos(a) * 14, pivot[1] + math.sin(a) * 14
    cv.line(pivot[0] + math.cos(a) * 6, pivot[1] - math.sin(a) * 6, ex, ey, P['timber'])
    cv.line(ex, ey, ex, STREET - 1, P['metal'][2])
    cv.rect(pivot[0] - 1, pivot[1], 3, 3, P['metal'][1])
    cv.rect(x + 8, STREET - 9, 6, 9, P['timber'])
    if P['night']:
        cv.rect(x + 9, STREET - 8, 4, 4, P['ember'])
        cv.glow(x + 11, STREET - 6, P['ember'], 3, 0.25)


def smoke(cv, P, x, y, tt, amount, dark=False):
    for k in range(6):
        life = (tt / 1.8 + k / 6) % 1
        px = x + life * 10 + math.sin(life * 6 + k) * 1.5
        py = y - life * 22
        r = 1 + life * 3.5 * amount
        col = P['smoke'][0] if (dark or life > 0.5) else P['smoke'][1]
        m = np.hypot(XX - px, YY - py) <= r
        cv.c[m] = mix(cv.c[m], col, 0.85 - life * 0.55)


def mill(cv, P, x, tt, light):
    w, h = 60, 34
    top = STREET - h
    cv.rect(x, top, w, h, P['brick'][1])
    cv.rect(x, top, 2, h, P['brick'][2])
    for y in range(top + 2, STREET, 3):
        for bx in range(x + (y % 2) * 2, x + w, 4):
            cv.px(bx, y, P['brick'][0])
    cv.rect(x - 1, top - 3, w + 2, 3, P['roof'][0])
    windows(cv, P, x + 3, top + 4, w, h, 9, 4, light, 31, tt, (3, 4), (3, 3))
    cv.rect(x + w - 8, top - 30, 5, 30, P['brick'][1])
    smoke(cv, P, x + w - 6, top - 31, tt, 1.2, dark=True)
    # Waterwheel down by the river.
    wx, wy = x + 10, RIVER - 1
    a0 = TAU * tt / 2
    for k in range(8):
        a = a0 + k * TAU / 8
        cv.line(wx, wy, wx + math.cos(a) * 7, wy + math.sin(a) * 7, P['timber'])
    d = np.hypot(XX - wx, YY - wy)
    cv.c[(d <= 7.6) & (d >= 6.6)] = P['timber']


def terrace(cv, P, x, w, tt, light, seed):
    h = 26
    top = STREET - h
    cv.rect(x, top, w, h, P['brick'][1])
    for y in range(top + 2, STREET, 3):
        for bx in range(x + (y % 2) * 2, x + w, 4):
            cv.px(bx, y, P['brick'][0])
    cv.rect(x - 1, top - 4, w + 2, 4, P['roof'][0])
    for cxp in range(x + 4, x + w, 12):
        cv.rect(cxp, top - 8, 3, 4, P['brick'][2])
    windows(cv, P, x + 3, top + 4, w, h, w // 6, 2, light, seed, tt, (3, 5), (3, 4))
    for dx in range(x + 2, x + w - 3, 12):
        cv.rect(dx, STREET - 7, 3, 7, P['timber'])


def apartments(cv, P, x, w, h, tt, light, seed, aerials=True):
    top = STREET - h
    cv.rect(x, top, w, h, P['concrete'][1])
    cv.rect(x, top, 2, h, P['concrete'][2])
    cv.rect(x + w - 2, top, 2, h, P['concrete'][0])
    windows(cv, P, x + 3, top + 3, w, h, (w - 4) // 5, (h - 6) // 7, light, seed, tt, (3, 4), (2, 3))
    if aerials:
        for ax in range(x + 4, x + w - 2, 9):
            cv.vline(ax, top - 6, top - 1, P['metal'][2])
            cv.hline(ax - 2, ax + 2, top - 5, P['metal'][2])


def tower(cv, P, x, w, h, tt, light, seed, glass=False):
    top = STREET - h
    if glass:
        cv.rect(x, top, w, h, P['glass'][1])
        for i in range(0, w, 4):
            cv.vline(x + i, top, STREET - 1, P['glass'][0])
        # A slanted reflection band sliding down the glass.
        for y in range(top, STREET):
            sx = x + ((y - top) * 0.6 + tt * 6) % (w + 30) - 15
            cv.hline(sx, sx + 3, y, P['glass'][2])
        cv.rect(x, top, w, 2, P['glass_hi'])
        if P['night']:
            windows(cv, P, x + 2, top + 4, w, h, w // 4, h // 6, light, seed, tt, (2, 2), (2, 4))
    else:
        cv.rect(x, top, w, h, P['concrete'][0])
        cv.rect(x + 1, top, w - 2, h, P['concrete'][1])
        windows(cv, P, x + 2, top + 3, w, h, (w - 2) // 4, (h - 4) // 4, light, seed, tt, (2, 2), (2, 2))
    cv.vline(x + w // 2, top - 8, top - 1, P['metal'][2])
    if P['night'] and int(tt * FPS) % 12 < 6:
        cv.px(x + w // 2, top - 9, rgb('#ff4a3a'))
        cv.glow(x + w // 2, top - 9, rgb('#ff4a3a'), 2, 0.3)


def solar_house(cv, P, x, w, tt, light, seed):
    h = 18
    top = STREET - h
    cv.rect(x, top, w, h, P['plaster'])
    cv.rect(x, top, 2, h, P['plaster_hi'])
    for j in range(8):
        inset = 8 - j
        cv.hline(x + inset - 1, x + w - inset, top - 8 + j, P['glass'][0] if j % 2 else P['glass'][1])
    windows(cv, P, x + 3, top + 4, w, h, 2, 1, light, seed, tt, (6, 5), (w - 18, 4))
    cv.rect(x + w // 2 - 2, STREET - 8, 4, 8, P['timber'])


def lamp(cv, P, x, kind, tt):
    if kind is None:
        return
    top = STREET - 14
    cv.vline(x, top, STREET + 2, P['metal'][0])
    col = {'gas': P['gas'], 'bulb': P['bulb'], 'led': P['led']}[kind]
    if kind == 'led':
        cv.hline(x, x + 4, top, P['metal'][0])
        cv.hline(x + 2, x + 4, top + 1, col if P['night'] else P['metal'][2])
        if P['night']:
            cv.glow(x + 3, top + 2, col, 5, 0.22)
    else:
        cv.rect(x - 1, top - 3, 3, 3, col if P['night'] else P['metal'][2])
        cv.px(x, top - 4, P['metal'][0])
        if P['night']:
            cv.glow(x, top - 2, col, 5, 0.25)
            for y in range(STREET + 1, RAIL - 2):
                for dx in range(-3, 4):
                    cv.c[y, x + dx] = mix(cv.c[y, x + dx], col, 0.08)


def poles(cv, P, xs):
    tops = []
    for x in xs:
        cv.vline(x, STREET - 26, STREET + 2, P['timber'])
        cv.hline(x - 3, x + 3, STREET - 24, P['timber'])
        tops.append(x)
    for a, b in zip(tops, tops[1:]):
        for k in (-3, 3):
            for i in range(b - a + 1):
                sag = 3 * math.sin(math.pi * i / (b - a))
                cv.px(a + i + k * 0 + (k > 0) * 0, STREET - 25 + sag + (0 if k < 0 else 0), P['ink'])


def mast(cv, P, x, tt):
    base, top = 100, 54
    for y in range(top, base):
        half = (y - top) // 8
        cv.px(x - half, y, P['metal'][2])
        cv.px(x + half, y, P['metal'][2])
        if (y - top) % 4 == 0:
            cv.hline(x - half, x + half, y, P['metal'][1])
    if int(tt * FPS) % 10 < 5:
        cv.px(x, top - 1, rgb('#ff4a3a'))
        cv.glow(x, top - 1, rgb('#ff4a3a'), 2, 0.4)


# ---------------------------------------------------------------- people

LOOKS = {
    1450: [dict(skin=0, hair='#3a2618', hat='hood', coat='#7a5a3a', legs='#4a3a2a'),
           dict(skin=1, hair='#1a1210', hat=None, coat='#3a5a7a', legs='#3a3028', dress=True)],
    1600: [dict(skin=0, hair='#6a4a2a', hat='brim', coat='#2a3a5a', legs='#2a2a30'),
           dict(skin=3, hair='#8a5a2a', hat='bonnet', coat='#8a3a3a', legs='#3a2a28', dress=True)],
    1712: [dict(skin=2, hair='#1a1210', hat='tricorne', coat='#3a4a3a', legs='#2a2a30'),
           dict(skin=0, hair='#5a3a1a', hat='bonnet', coat='#6a5a8a', legs='#3a2a28', dress=True)],
    1825: [dict(skin=0, hair='#2a1a10', hat='top', coat='#2a2a3a', legs='#3a3a44'),
           dict(skin=1, hair='#1a1210', hat='bonnet', coat='#5a7a6a', legs='#3a2a28', dress=True)],
    1900: [dict(skin=2, hair='#1a1210', hat='bowler', coat='#4a3a30', legs='#2a2a30'),
           dict(skin=3, hair='#7a4a2a', hat='cloche', coat='#a05a5a', legs='#3a2a28', dress=True)],
    1960: [dict(skin=1, hair='#1a1210', hat=None, coat='#5a6a8a', legs='#2a2a3a'),
           dict(skin=0, hair='#c9a050', hat=None, coat='#d08a3a', legs='#3a3a5a', dress=True)],
    2000: [dict(skin=2, hair='#1a1210', hat=None, coat='#3a7a8a', legs='#2a3a5a'),
           dict(skin=3, hair='#5a3a2a', hat=None, coat='#8a3a5a', legs='#2a2a3a')],
    2026: [dict(skin=2, hair='#1a1210', hat=None, coat='#e8e4dc', legs='#2a2e3a', phone=True),
           dict(skin=1, hair='#2a1a10', hat='beanie', coat='#3f8f86', legs='#2a2a30')],
}


LOOKS_NAIROBI = {
    1899: [dict(skin=2, hair='#141010', hat='brim', coat='#b49a6a', legs='#6a5a3a'),
           dict(skin=2, hair='#141010', hat=None, coat='#8a3a2a', legs='#3a2a28', dress=True)],
    1920: [dict(skin=2, hair='#141010', hat='bowler', coat='#4a4a52', legs='#2a2a30'),
           dict(skin=1, hair='#141010', hat=None, coat='#3a6a9a', legs='#2a2a30', dress=True)],
    1963: [dict(skin=2, hair='#141010', hat=None, coat='#e8e4dc', legs='#2a2a3a'),
           dict(skin=2, hair='#141010', hat=None, coat='#c99a2a', legs='#3a2a28', dress=True)],
    1973: [dict(skin=2, hair='#141010', hat=None, coat='#3a5a8a', legs='#2a2a30'),
           dict(skin=1, hair='#141010', hat=None, coat='#9a3a5a', legs='#2a2a30', dress=True)],
    2007: [dict(skin=2, hair='#141010', hat=None, coat='#2f7a5a', legs='#22252e', phone=True),
           dict(skin=2, hair='#141010', hat=None, coat='#d9a400', legs='#2a2a30', dress=True)],
}


def looks_for(year):
    table = LOOKS_NAIROBI if (VARIANT == 'nairobi' and year >= 1899) else LOOKS
    key = max(k for k in table if k <= year)
    return table[key]


# The traveller of the journey: a pixel Elvis, dressed for each era.
YOU = [
    dict(skin=2, hair='#141010', hat='hood', coat='#5a4a3a', legs='#3a3028'),
    dict(skin=2, hair='#141010', hat='brim', coat='#3a3050', legs='#2a2a30'),
    dict(skin=2, hair='#141010', hat='tricorne', coat='#2f4a5a', legs='#2a2a30'),
    dict(skin=2, hair='#141010', hat=None, coat='#6a4a32', legs='#2a2a30'),
    dict(skin=2, hair='#141010', hat='top', coat='#202430', legs='#3a3a44'),
    dict(skin=2, hair='#141010', hat='bowler', coat='#3a3a44', legs='#2a2a30'),
    dict(skin=2, hair='#141010', hat=None, coat='#4a5a6a', legs='#2a2a30'),
    dict(skin=2, hair='#141010', hat=None, coat='#2a3a5a', legs='#22252e'),
    dict(skin=2, hair='#141010', hat=None, coat='#3a4a3a', legs='#22252e'),
    dict(skin=2, hair='#141010', hat=None, coat='#2443c4', legs='#22252e'),
]


def person(cv, P, x, base, look, f, facing, arm=None):
    """A figure about 16 px tall, outlined in a darker shade of itself."""
    spr = np.zeros((20, 12, 3), np.uint8)
    a = np.zeros((20, 12), bool)

    def s(px_, py_, col):
        if 0 <= px_ < 12 and 0 <= py_ < 20:
            spr[py_, px_] = col
            a[py_, px_] = True

    def sr(x0, y0, w, h, col):
        for yy in range(y0, y0 + h):
            for xx in range(x0, x0 + w):
                s(xx, yy, col)

    skin = P['skin'][look['skin']]
    hair, coat, legs = rgb(look['hair']), rgb(look['coat']), rgb(look['legs'])
    if P['night']:
        hair, coat, legs = (mix(v, rgb('#1a1d3a'), 0.45) for v in (hair, coat, legs))
        skin = mix(skin, rgb('#1a1d3a'), 0.35)
    step = (f // 2) % 4
    # Legs.
    if look.get('dress'):
        sr(3, 11, 6, 6, coat)
        sr(4, 17, 1, 2, legs) if step % 2 else sr(5, 17, 1, 2, legs)
        sr(7, 17, 1, 2, legs) if step % 2 else sr(6, 17, 1, 2, legs)
    else:
        swing = [0, 1, 0, -1][step]
        sr(4 + swing, 13, 2, 6, legs)
        sr(6 - swing, 13, 2, 6, legs)
    # Body and arms.
    sr(3, 7, 6, 7, coat)
    sr(3, 7, 1, 7, mix(coat, rgb('#ffffff'), 0.15))
    if arm is None:
        sw = [0, 1, 0, -1][step]
        sr(2, 8 + max(0, sw), 1, 4, coat)
        sr(9, 8 + max(0, -sw), 1, 4, coat)
        s(2, 12 + max(0, sw), skin)
        s(9, 12 + max(0, -sw), skin)
    else:
        sr(9, 7 + arm * 2, 2, 1, coat)
        s(11, 7 + arm * 2, skin)
    if look.get('phone'):
        s(8, 9, rgb('#20242e'))
        s(8, 8, P['led'] if P['night'] else rgb('#9fd8ff'))
    # Head.
    sr(4, 2, 4, 5, skin)
    s(7 if facing > 0 else 4, 4, rgb('#1a1210'))
    sr(4, 2, 4, 1, hair)
    s(4 if facing > 0 else 7, 3, hair)
    hat = look.get('hat')
    if hat == 'hood':
        sr(3, 1, 6, 2, coat); s(3, 3, coat); s(8, 3, coat)
    elif hat == 'brim':
        sr(2, 2, 8, 1, rgb('#2a2026')); sr(4, 0, 4, 2, rgb('#2a2026'))
    elif hat == 'tricorne':
        sr(3, 1, 6, 2, rgb('#1d1a22')); s(2, 2, rgb('#1d1a22')); s(9, 2, rgb('#1d1a22'))
    elif hat == 'top':
        sr(3, 2, 6, 1, rgb('#14121a')); sr(4, -2, 4, 4, rgb('#14121a'))
    elif hat == 'bowler':
        sr(3, 2, 6, 1, rgb('#1d1a22')); sr(4, 0, 4, 2, rgb('#1d1a22'))
    elif hat in ('bonnet', 'cloche'):
        sr(3, 1, 6, 3, rgb('#e6dcc6') if hat == 'bonnet' else coat)
    elif hat == 'beanie':
        sr(4, 1, 4, 2, rgb('#2a3a5a'))
    else:
        sr(4, 1, 4, 1, hair)
    # Outline in a deep shade of each neighbour.
    edge = np.zeros_like(a)
    edge[1:] |= a[:-1]; edge[:-1] |= a[1:]; edge[:, 1:] |= a[:, :-1]; edge[:, :-1] |= a[:, 1:]
    edge &= ~a
    out = P['ink']
    ox, oy = int(round(x)) - 6, int(base) - 19
    for (yy, xx) in zip(*np.nonzero(edge)):
        cv.px(ox + (11 - xx if facing < 0 else xx), oy + yy, out)
    for (yy, xx) in zip(*np.nonzero(a)):
        cv.px(ox + (11 - xx if facing < 0 else xx), oy + yy, spr[yy, xx])


def walkers(cv, P, tt, f):
    e, _ = era_at(tt)
    looks = looks_for(year_at(tt))
    for i, look in enumerate(looks):
        speed = 14 + i * 5
        direction = 1 if i % 2 == 0 else -1
        span = W + 40
        pos = ((tt * speed + i * 137) % span) - 20
        x = pos if direction > 0 else W - pos
        person(cv, P, x, WALK - (i % 2), look, f + i * 3, direction)


# ---------------------------------------------------------------- vehicles

def lane_x(tt, speed, phase, span_extra=60, direction=1):
    span = W + span_extra
    p = ((tt * speed + phase) % span) - span_extra / 2
    return p if direction > 0 else W - p


def cart(cv, P, x, kind, f):
    x = int(round(x))
    y = WALK
    if kind == 'ox':
        cv.rect(x, y - 9, 16, 5, P['timber'])
        cv.rect(x + 1, y - 12, 14, 3, rgb('#c9a24a') if not P['night'] else rgb('#4a4030'))
        for wx in (x + 3, x + 12):
            d = np.hypot(XX - wx, YY - (y - 3))
            cv.c[(d <= 3.2) & (d >= 2.2)] = P['timber']
        ox = x + 18
        cv.rect(ox, y - 9, 10, 6, rgb('#8a6a4a') if not P['night'] else rgb('#3a3036'))
        cv.rect(ox + 9, y - 10, 3, 4, rgb('#8a6a4a') if not P['night'] else rgb('#3a3036'))
        leg = (f // 3) % 2
        for lx in (ox + 1 + leg, ox + 7 - leg):
            cv.vline(lx, y - 3, y, P['ink'])
    elif kind == 'carriage':
        cv.rect(x, y - 14, 14, 9, rgb('#2a2a3a'))
        cv.rect(x + 2, y - 12, 4, 4, P['window_off'] if not P['night'] else P['gas'])
        for wx in (x + 3, x + 11):
            d = np.hypot(XX - wx, YY - (y - 3))
            cv.c[(d <= 3.2) & (d >= 2.2)] = P['ink']
        hx = x + 16
        cv.rect(hx, y - 10, 9, 5, rgb('#5a3a2a'))
        cv.rect(hx + 7, y - 13, 3, 5, rgb('#5a3a2a'))
        leg = (f // 2) % 2
        for lx in (hx + 1 + leg, hx + 6 - leg):
            cv.vline(lx, y - 5, y, rgb('#3a2a20'))


def car(cv, P, x, kind, f, direction=1):
    x = int(round(x))
    y = WALK + 3
    body = {'t': rgb('#1d1d24'), '50s': rgb('#7fb6b0'), '90s': rgb('#a33a3a'), 'ev': rgb('#e8e8ee')}[kind]
    if P['night']:
        body = mix(body, rgb('#151830'), 0.4)
    if kind == 't':
        cv.rect(x, y - 9, 12, 5, body)
        cv.rect(x + 3, y - 13, 6, 4, body)
        cv.rect(x + 4, y - 12, 4, 2, P['window_off'])
    elif kind == '50s':
        cv.rect(x, y - 8, 20, 5, body)
        cv.rect(x + 5, y - 12, 10, 4, body)
        cv.rect(x + 6, y - 11, 8, 2, P['glass'][1])
        cv.hline(x, x + 19, y - 6, mix(body, rgb('#ffffff'), 0.4))
    else:
        cv.rect(x, y - 8, 20, 5, body)
        for j in range(4):
            cv.hline(x + 4 - j + (j > 2), x + 15 + (j if kind == 'ev' else 0) // 2, y - 9 - j, body)
        cv.rect(x + 6, y - 11, 8, 2, P['glass'][1])
    for wx in ((x + 3, x + 9) if kind == 't' else (x + 4, x + 16)):
        d = np.hypot(XX - wx, YY - (y - 3))
        cv.c[d <= 2.4] = P['ink']
        cv.px(wx, y - 3, P['metal'][2])
    front = x + (20 if kind != 't' else 12) if direction > 0 else x - 1
    if P['night']:
        cv.px(front, y - 7, P['bulb'] if kind != 'ev' else P['led'])
        cv.glow(front + 2 * direction, y - 7, P['bulb'], 4, 0.25)


def train(cv, P, x, kind, tt):
    x = int(round(x))
    y = RAIL
    if kind == 'rocket':
        cv.rect(x, y - 8, 12, 6, rgb('#d8b03a') if not P['night'] else rgb('#6a5a2a'))
        cv.rect(x + 10, y - 16, 2, 9, P['ink'])
        cv.rect(x - 4, y - 9, 4, 7, rgb('#3a6a3a'))
        for wx, r in ((x + 3, 3.5), (x + 9, 2.5)):
            d = np.hypot(XX - wx, YY - (y - 3))
            cv.c[(d <= r) & (d >= r - 1)] = P['ink']
        smoke(cv, P, x + 11, y - 17, tt * 2, 0.8, dark=True)
        cars = [(x - 18, rgb('#c9a24a'))]
    elif kind in ('steam', 'uganda'):
        cv.rect(x, y - 10, 22, 8, rgb('#1d1d24'))
        cv.rect(x + 2, y - 15, 6, 6, rgb('#1d1d24'))
        cv.rect(x + 17, y - 16, 3, 7, rgb('#1d1d24'))
        cv.hline(x, x + 21, y - 10, rgb('#8a2a2a'))
        for wx in (x + 4, x + 10, x + 16):
            d = np.hypot(XX - wx, YY - (y - 3))
            cv.c[(d <= 3) & (d >= 2)] = rgb('#8a2a2a')
        smoke(cv, P, x + 18, y - 17, tt * 2, 0.9, dark=True)
        if P['night']:
            cv.glow(x + 22, y - 7, P['gas'], 6, 0.3)
        cars = [(x - 26 - i * 26, rgb('#6a3a2a')) for i in range(3)]
    elif kind == 'diesel':
        cv.rect(x, y - 12, 30, 10, rgb('#2f5a8a'))
        cv.hline(x, x + 29, y - 8, rgb('#e8c84a'))
        cv.rect(x + 25, y - 11, 4, 3, P['glass'][1])
        cars = [(x - 32 - i * 32, rgb('#3a5a7a')) for i in range(3)]
    else:  # modern
        for j in range(12):
            cv.hline(x + j // 2, x + 34, y - 3 - j, rgb('#eceef2') if not P['night'] else rgb('#3a3e52'))
        cv.hline(x + 6, x + 34, y - 8, P['accent'])
        cv.rect(x + 4, y - 12, 6, 3, P['glass'][1])
        cars = [(x + 36 + i * 36, rgb('#eceef2') if not P['night'] else rgb('#3a3e52')) for i in range(3)]
    for cx, col in cars:
        w = 24 if kind not in ('diesel', 'modern') else 30 if kind == 'diesel' else 34
        cv.rect(cx, y - 11, w, 9, col)
        for i in range(cx + 3, cx + w - 3, 5):
            cv.rect(i, y - 9, 3, 3, P['window_off'] if not P['night'] else (P['bulb'] if kind != 'modern' else P['led']))
        if kind in ('rocket', 'steam', 'uganda'):
            for wx in (cx + 4, cx + w - 5):
                d = np.hypot(XX - wx, YY - (y - 2))
                cv.c[d <= 2] = P['ink']


def boat(cv, P, x, kind, tt):
    x = int(round(x))
    y = RIVER + 7
    bob = round(math.sin(tt * 3) * 0.6)
    if kind == 'sail':
        for j in range(5):
            cv.hline(x + j, x + 24 - j, y + j + bob, P['timber'])
        cv.vline(x + 12, y - 18 + bob, y + bob, P['timber'])
        for j in range(14):
            cv.hline(x + 13, x + 13 + int(j * 0.7), y - 16 + j + bob, P['plaster_hi'])
    elif kind == 'paddle':
        cv.rect(x, y + bob, 28, 4, rgb('#2a2a34'))
        cv.rect(x + 4, y - 5 + bob, 18, 5, P['plaster'])
        cv.rect(x + 12, y - 14 + bob, 3, 9, rgb('#1d1d24'))
        smoke(cv, P, x + 13, y - 15 + bob, tt, 0.7, dark=True)
        d = np.hypot(XX - x - 9, YY - y - 1 - bob)
        cv.c[(d <= 4) & (d >= 3) & (YY < H)] = P['timber']
    elif kind == 'ship':
        cv.rect(x, y + bob, 46, 5, rgb('#2a3a5a'))
        cv.hline(x, x + 45, y + bob, P['accent_dk'])
        for i, col in enumerate(('#b84a3a', '#4a7aa8', '#e8c84a', '#5a9a6a', '#b84a3a')):
            cv.rect(x + 4 + i * 7, y - 5 + bob, 6, 5, rgb(col) if not P['night'] else mix(rgb(col), rgb('#151830'), 0.5))
        cv.rect(x + 38, y - 10 + bob, 6, 10, P['plaster_hi'])
    if P['night'] and kind != 'sail':
        cv.px(x + 2, y - 2 + bob, P['bulb'])
        cv.glow(x + 2, y - 2 + bob, P['bulb'], 3, 0.3)


def sky_traffic(cv, P, tt, e, f):
    # Birds in every age.
    if not P['night']:
        for i in range(3):
            x = lane_x(tt, 22 + i * 3, i * 40)
            y = 52 + i * 4 + math.sin(tt * 2 + i) * 2
            up = (f // 2 + i) % 2
            col = rgb('#2a3f5f')
            cv.px(x, y, col)
            cv.px(x - 1, y - up, col); cv.px(x + 1, y - up, col)
            cv.px(x - 2, y - up * 2 + (1 - up), col); cv.px(x + 2, y - up * 2 + (1 - up), col)
    if e == 3:  # Montgolfier balloon, 1783
        x = lane_x(tt, 8, 60)
        y = 56 + math.sin(tt) * 3
        d = np.hypot(XX - x, (YY - y) * 0.9)
        cv.c[d <= 7] = rgb('#c84a3a') if not P['night'] else rgb('#6a2a2a')
        cv.c[(d <= 7) & (np.abs(XX - x) < 2)] = rgb('#e8c84a') if not P['night'] else rgb('#6a5a2a')
        cv.rect(x - 2, y + 9, 4, 3, P['timber'])
        if P['night']:
            cv.glow(x, y + 8, P['ember'], 3, 0.4)
    if e == 6:  # a Flyer, then a biplane
        x = lane_x(tt, 30, 0)
        y = 50 + math.sin(tt * 1.4) * 2
        cv.hline(x - 7, x + 7, y, P['plaster_hi'] if not P['night'] else P['metal'][2])
        cv.hline(x - 7, x + 7, y + 3, P['plaster_hi'] if not P['night'] else P['metal'][2])
        cv.vline(x - 5, y, y + 3, P['timber']); cv.vline(x + 5, y, y + 3, P['timber'])
        cv.hline(x - 12, x - 8, y + 2, P['timber'])
    if e >= 7:  # jets
        x = lane_x(tt, 60, 100)
        y = 40
        cv.hline(x - 6, x + 6, y, P['metal'][2])
        cv.line(x - 1, y, x - 4, y - 3, P['metal'][2])
        cv.line(x - 1, y, x - 4, y + 2, P['metal'][2])
        for i in range(1, 30):
            if not P['night']:
                cv.px(x - 6 - i, y, mix(cv.c[min(H - 1, int(y)), int(min(W - 1, max(0, x - 6 - i)))], rgb('#ffffff'), 0.5 - i / 70))
        if P['night'] and int(tt * FPS) % 6 < 3:
            cv.px(x, y + 1, rgb('#ff4a3a'))
    if e == 7:  # a rocket climbs on the horizon, 1969
        _, p = era_at(tt)
        if 0.3 < p < 0.95:
            q = (p - 0.3) / 0.65
            rx, ry = 40, 100 - q * 110
            cv.rect(rx - 1, ry - 6, 3, 7, rgb('#eeeeee'))
            for k in range(1, 9):
                cv.px(rx + (k % 2) - 0.5, ry + k, P['ember'] if k < 3 else P['smoke'][1])
            cv.glow(rx, ry + 2, P['ember'], 3, 0.5)
    if e >= 7 and P['night']:  # satellites crossing the night
        x = lane_x(tt, 12, 30)
        cv.px(x, 36, P['star'])
    if e == 9:  # delivery drones
        for i in range(2):
            x = lane_x(tt, 18 + i * 7, 80 + i * 150, direction=1 if i else -1)
            y = 50 + i * 10 + math.sin(tt * 3 + i) * 1.5
            small_drone(cv, P, x, y, f)


def small_drone(cv, P, x, y, f):
    body = rgb('#e8e8ee') if not P['night'] else rgb('#3a3e52')
    cv.rect(x - 2, y, 5, 2, body)
    for dx in (-4, 4):
        cv.px(x + dx, y - 1, P['ink'])
        cv.hline(x + dx - 2 + (f % 2), x + dx + 2 - (f % 2), y - 2, P['metal'][2])
    if P['night'] and f % 4 < 2:
        cv.px(x, y + 2, rgb('#ff4a3a'))


# ---------------------------------------------------------------- the street, era by era

# Each slot is a plot on the street. Each entry: (first era, drawer). The latest entry at or before
# the current era stands there; when it changes, the new building rises out of scaffolding.
NAIROBI_SLOTS = {
    'A': (6, [(5, 'depot'), (6, 'dukas'), (8, 'apartments_a'), (9, 'glass_tall')]),
    'B': (74, [(5, 'tents'), (6, 'colonial'), (9, 'apartments_new')]),
    'C': (128, [(5, 'acacia_big'), (7, 'flag')]),
    'D': (152, [(5, 'station'), (6, 'stone_shops'), (8, 'kicc')]),
    'E': (214, [(5, 'acacia_pair'), (6, 'bungalows'), (8, 'apartments_e'), (9, 'glass_mid_e')]),
}


def slots(P, e=0):
    if in_nairobi(e):
        return NAIROBI_SLOTS
    return {
        'A': (6, [(0, 'cottage'), (3, 'mill'), (8, 'office'), (9, 'glass_tall')]),
        'B': (74, [(0, 'press'), (5, 'terrace_b'), (7, 'apartments'), (9, 'apartments_new')]),
        'C': (128, [(0, 'cottage2'), (1, 'clock')]),
        'D': (152, [(0, 'cottage3'), (2, 'engine'), (5, 'terrace_d'), (8, 'office_d'), (9, 'glass_mid')]),
        'E': (214, [(0, 'inn'), (3, 'factory'), (6, 'store'), (9, 'solar')]),
    }


def draw_slot(cv, P, kind, x, tt, light):
    if kind in NAIROBI_KINDS:
        return NAIROBI_KINDS[kind](cv, P, x, tt, light)
    if kind == 'cottage':
        cottage(cv, P, x + 6, 26, tt, 3, light)
        cottage(cv, P, x + 36, 22, tt, 4, light)
    elif kind == 'cottage2':
        cottage(cv, P, x, 18, tt, 5, light)
    elif kind == 'cottage3':
        cottage(cv, P, x + 2, 24, tt, 6, light)
        cottage(cv, P, x + 30, 22, tt, 7, light)
    elif kind == 'inn':
        cottage(cv, P, x, 40, tt, 8, light)
        cv.rect(x + 42, STREET - 22, 2, 10, P['timber'])
        cv.rect(x + 44, STREET - 20, 7, 6, P['accent_dk'] if not P['night'] else P['ember'])
    elif kind == 'press':
        press_shop(cv, P, x, tt, light)
    elif kind == 'clock':
        clock_tower(cv, P, x + 2, tt, light)
    elif kind == 'engine':
        engine_house(cv, P, x + 4, tt)
        cottage(cv, P, x + 34, 22, tt, 7, light)
    elif kind == 'mill':
        mill(cv, P, x, tt, light)
    elif kind == 'factory':
        w, h = 52, 24
        top = STREET - h
        cv.rect(x, top, w, h, P['brick'][1])
        for i in range(4):
            for j in range(6):
                cv.hline(x + i * 13 + j, x + i * 13 + 12, top - 6 + j, P['roof'][0])
            cv.vline(x + i * 13 + 12, top - 6, top, P['glass'][0])
        windows(cv, P, x + 3, top + 6, w, h, 8, 2, light, 41, tt, (3, 4), (3, 3))
        for cx_ in (x + 8, x + 40):
            cv.rect(cx_, top - 34, 4, 34, P['brick'][2])
            smoke(cv, P, cx_ + 2, top - 35, tt + cx_, 1.3, dark=True)
    elif kind == 'terrace_b':
        terrace(cv, P, x, 48, tt, light, 51)
    elif kind == 'terrace_d':
        terrace(cv, P, x, 56, tt, light, 52)
    elif kind == 'store':
        apartments(cv, P, x, 54, 30, tt, light, 61, aerials=False)
        cv.rect(x, STREET - 12, 54, 2, P['accent_dk'] if not P['night'] else P['accent'])
    elif kind == 'apartments':
        apartments(cv, P, x, 48, 44, tt, light, 71)
    elif kind == 'apartments_new':
        apartments(cv, P, x, 48, 44, tt, light, 72, aerials=False)
        for i in range(3):
            cv.rect(x + 4 + i * 15, STREET - 30, 9, 1, P['leaf'][2])
    elif kind == 'office':
        tower(cv, P, x + 6, 44, 66, tt, light, 81)
    elif kind == 'office_d':
        tower(cv, P, x + 4, 50, 54, tt, light, 82)
    elif kind == 'glass_tall':
        tower(cv, P, x + 4, 46, 82, tt, light, 91, glass=True)
    elif kind == 'glass_mid':
        tower(cv, P, x + 2, 54, 70, tt, light, 92, glass=True)
    elif kind == 'solar':
        solar_house(cv, P, x, 30, tt, light, 93)
        solar_house(cv, P, x + 34, 28, tt, light, 94)


def street(cv, P, tt, f):
    e, p = era_at(tt)
    light = ['candle', 'candle', 'candle', 'candle', 'gas', 'bulb', 'bulb', 'bulb', 'bulb', 'led'][e]
    # The hill: a windmill until turbines replace it; a radio mast for the middle century.
    hill_base = 104
    if 1 <= e <= 6 and not in_nairobi(e):
        windmill(cv, P, 286, tt, hill_base)
    if 6 <= e <= 8 or (e == 9 and in_nairobi(e)):
        mast(cv, P, 24, tt)
    if e == 9 and not in_nairobi(e):
        for i, hx in enumerate((268, 292, 312)):
            turbine(cv, P, hx, tt, hill_base - (i % 2) * 2, i * 0.3)
    for name, (x, plan) in slots(P, e).items():
        current = [k for start, k in plan if start <= e][-1]
        previous = [k for start, k in plan if start <= e - 1]
        previous = previous[-1] if previous else None
        rise = 1.0
        if previous != current and e > 0 and not NO_BUILD and not (in_nairobi(e) and e == 5):
            rise = smooth(p / 0.22)
        if rise < 1.0:
            # Time-lapse construction: the old building drops away, the new one rises in scaffolding.
            layer = cv.c.copy()
            sub = Canvas(layer)
            draw_slot(sub, P, current, x, tt, light)
            cut = int(STREET - (STREET - 10) * rise)
            changed = (layer != cv.c).any(axis=2) & (YY >= cut) & (YY < STREET)
            if previous and rise < 0.35:
                old = cv.c.copy()
                draw_slot(Canvas(old), P, previous, x, tt, light)
                drop = int((rise / 0.35) * 40)
                shifted = np.zeros_like(old)
                shifted[drop:] = old[:H - drop]
                mask = (old != cv.c).any(axis=2)
                mask_s = np.zeros_like(mask)
                mask_s[drop:] = mask[:H - drop]
                mask_s &= YY < STREET
                cv.c[mask_s] = shifted[mask_s]
            cv.c[changed] = layer[changed]
            xs = np.nonzero(changed.any(axis=0))[0]
            if len(xs):
                x0, x1 = xs[0], xs[-1]
                for sx in range(x0, x1 + 1, 6):
                    cv.vline(sx, cut - 4, STREET - 1, P['timber'])
                cv.hline(x0, x1, cut - 1, P['timber'])
                cv.hline(x0, x1, cut + 6, P['timber'])
                person(cv, P, (x0 + x1) / 2 + math.sin(tt * 5) * 6, cut - 1, looks_for(year_at(tt))[0], f, 1, arm=int(tt * FPS / 2) % 2)
        else:
            draw_slot(cv, P, current, x, tt, light)
    # Street furniture.
    lamps = [None, None, None, None, 'gas', 'gas', 'bulb', 'bulb', 'bulb', 'led'][e]
    for lx in (64, 146, 208, 300):
        lamp(cv, P, lx, lamps, tt)
    if e >= 5 and e <= 7:
        poles(cv, P, [20, 120, 220, 318])


def traffic(cv, P, tt, f):
    e, p = era_at(tt)
    if in_nairobi(e):
        return traffic_nairobi(cv, P, tt, f, e, p)
    # Road.
    if e <= 2:
        cart(cv, P, lane_x(tt, 10, 40), 'ox', f)
    elif e <= 5:
        cart(cv, P, lane_x(tt, 22, 90, direction=-1), 'carriage', f)
    elif e == 6:
        car(cv, P, lane_x(tt, 30, 20), 't', f)
    elif e == 7:
        car(cv, P, lane_x(tt, 44, 140, direction=-1), '50s', f, -1)
    elif e == 8:
        car(cv, P, lane_x(tt, 50, 10), '90s', f)
    else:
        car(cv, P, lane_x(tt, 46, 60), 'ev', f)
        car(cv, P, lane_x(tt, 38, 220, direction=-1), 'ev', f, -1)
    # Rails: workers lay them first, then trains.
    if e == 4 and p < 0.3:
        for i in range(3):
            person(cv, P, 60 + i * 90, RAIL - 1, looks_for(1825)[0], f + i, 1, arm=int(tt * FPS / 2 + i) % 2)
    train_kind = [None, None, None, None, 'rocket', 'steam', 'steam', 'diesel', 'diesel', 'modern'][e]
    if train_kind and not (e == 4 and p < 0.3):
        speed = {'rocket': 70, 'steam': 120, 'diesel': 160, 'modern': 220}[train_kind]
        x = ((tt - e * ERA_S) * speed) % (W + 220) - 60 if train_kind != 'modern' else W + 60 - ((tt - e * ERA_S) * speed) % (W + 260)
        train(cv, P, x, train_kind, tt)
    # River.
    boat_kind = ['sail', 'sail', 'sail', 'sail', 'paddle', 'paddle', 'paddle', 'ship', 'ship', 'ship'][e]
    boat(cv, P, lane_x(tt, 9, 30, span_extra=80, direction=-1), boat_kind, tt)


DIGITS3 = {
    '0': '###|# #|# #|# #|###', '1': ' # |## | # | # |###', '2': '###|  #|###|#  |###', '3': '###|  #|###|  #|###',
    '4': '# #|# #|###|  #|  #', '5': '###|#  |###|  #|###', '6': '###|#  |###|# #|###', '7': '###|  #|  #|  #|  #',
    '8': '###|# #|###|# #|###', '9': '###|# #|###|  #|###',
}


def tiny(cv, s, x, y, col):
    for ch in s:
        for j, row in enumerate(DIGITS3[ch].split('|')):
            for i, v in enumerate(row):
                if v == '#':
                    cv.px(x + i, y + j, col)
        x += 4


class Grid(Canvas):
    """A canvas drawn in blocks of `u` output pixels, from an origin (ox, oy) in output pixels: the caption
    bar's own pixel grid, finer than the scene's."""
    def __init__(self, c, u, ox=0.0, oy=0.0):
        super().__init__(c)
        self.u, self.ox, self.oy = u, ox, oy

    def px(self, x, y, col):
        Canvas.rect(self, self.ox + int(round(x)) * self.u, self.oy + int(round(y)) * self.u, self.u, self.u, col)

    def rect(self, x, y, w, h, col):
        Canvas.rect(self, self.ox + x * self.u, self.oy + y * self.u, w * self.u, h * self.u, col)


# The caption bar is drawn at the output's resolution, not the scene's, so it can be smaller than the scene's
# pixels allow. Its pixel is 3.6 output pixels where the scene's is 5 (blocks fall on 3 or 4 whole pixels).
BAR_U = SCALE * 0.72
BAR_LINE = max(1, round(SCALE * 0.8))  # the rule between the scene and the bar, in output pixels
BAR_PAD_PX = 8 * SCALE                 # padding at the bar's edges, in output pixels
BAR_GAP_PX = 20 * SCALE                # between the year and the era's name and timeline
BLOCK_H = 24                           # the era's name, the track and the years, in bar pixels
# The year's dots: 11 px apart and 8 px wide, against 15 and 10 before, so the year is about 25% smaller.
YEAR_PITCH, YEAR_DOT = max(1, round(SCALE * 2.2)), max(1, round(SCALE * 1.6))
YEAR_ADVANCE = round(YEAR_PITCH * 17 / 3)
YEAR_H = 6 * YEAR_PITCH + YEAR_DOT
BAR_PX = round(2 * BAR_PAD_PX + max(YEAR_H, BLOCK_H * BAR_U))  # the bar's height in output pixels


def year_dots(c, s, x, y, col):
    """The year in big dots, drawn straight onto output pixels. Returns its right edge."""
    cv = Canvas(c)
    for ch in s:
        for j, row in enumerate(FONT.get(ch, FONT[' ']).split('|')):
            for i, v in enumerate(row):
                if v == '#':
                    cv.rect(x + i * YEAR_PITCH, y + j * YEAR_PITCH, YEAR_DOT, YEAR_DOT, col)
        x += YEAR_ADVANCE
    return x - YEAR_ADVANCE + 4 * YEAR_PITCH + YEAR_DOT


def caption_bar(P, tt):
    """Under the scene, like a film's lower third: the year in big dots, the era's name, and a
    timeline of every era with what has passed filled in and a marker for now."""
    e, p = era_at(tt)
    ink = rgb('#f4efe6') if P['night'] else rgb('#1c1a22')
    paper = rgb('#080a14') if P['night'] else rgb('#f4efe6')
    acc = P['accent']
    c = np.zeros((BAR_PX, W * SCALE, 3), np.uint8)
    c[:] = paper
    Canvas(c).rect(0, 0, W * SCALE, BAR_LINE, mix(ink, paper, 0.8))
    # The year and the block beside it (the era's name, the track and the years) share one centre line.
    mid = BAR_LINE + (BAR_PX - BAR_LINE) / 2
    right = year_dots(c, str(year_at(tt)), BAR_PAD_PX, round(mid - YEAR_H / 2), ink)
    g = Grid(c, BAR_U, 0, mid - BLOCK_H * BAR_U / 2)
    # The era's name stays at the left of the timeline. It, the first tick and the first year share one left
    # edge, and every later tick starts its own year: nothing is centred.
    tx0 = round((right + BAR_GAP_PX) / BAR_U)
    tx1 = int((W * SCALE - BAR_PAD_PX) / BAR_U)
    label_w = 4 * 4 - 1
    xs = [round(tx0 + (tx1 - label_w - tx0) * i / (N_ERAS - 1)) for i in range(N_ERAS)]
    dot_text(g, ERAS[e][2], tx0, 0, P['accent2'])
    # The timeline, kept quiet: a one-pixel track, the time passed drawn over it in cobalt, a small
    # tick per era, and one brass square for now. Years are soft for the past, brass for the current
    # era (matching its name above) and faint for what's to come.
    ty = 14
    span = min(1.0, p / 0.85)
    now = xs[e] + ((xs[e + 1] - xs[e]) * span if e < N_ERAS - 1 else 0)
    past, future = mix(ink, paper, 0.42), mix(ink, paper, 0.74)
    g.hline(xs[0], xs[-1], ty, future)
    g.hline(xs[0], round(now), ty, acc)
    for i, x in enumerate(xs):
        g.rect(x, ty - 1, 1, 3, acc if i <= e else future)
        tiny(g, str(ERAS[i][0]), x, ty + 5, P['accent2'] if i == e else past if i < e else future)
    g.rect(round(now), ty - 1, 3, 3, P['accent2'])
    return c


def finale(cv, P, tt, f, start=(40, STREET - 90), gate=(250, 56)):
    """The last seconds: a drone lifts off, a doorway of light opens, it flies in, flash."""
    t0 = D - 2.2
    if tt < t0:
        return 0.0
    q = (tt - t0) / 2.2
    gx, gy = gate
    open_ = smooth(q / 0.4)
    # The doorway: a pointed arch of light.
    for y in range(int(gy - 20 * open_), gy + 1):
        for x in range(gx - 8, gx + 9):
            dx = abs(x - gx)
            inside = dx <= 7 * open_ and (y >= gy - 12 * open_ or math.hypot(dx + 7, y - (gy - 12)) <= 14 * open_)
            edge = inside and not (dx <= 6 * open_ - 1 and (y >= gy - 11 * open_ or math.hypot(dx + 7, y - (gy - 12)) <= 13 * open_ - 1))
            if inside:
                cv.px(x, y, rgb('#e6f8ff') if edge else mix(rgb('#3b9ae0'), rgb('#86d4ff'), 0.5 + 0.5 * math.sin(y * 0.8 + tt * 8)))
    cv.glow(gx, gy - 8, rgb('#86d4ff'), 10, 0.18 * open_)
    # The drone: from a rooftop to the door.
    sx, sy = start
    p = smooth((q - 0.2) / 0.65)
    x = sx + (gx - sx) * p
    y = sy + (gy - 6 - sy) * p - math.sin(p * math.pi) * 14
    if q < 0.88:
        small_drone(cv, P, x, y, f)
        cv.glow(x, y, rgb('#86d4ff'), 2, 0.2)
    # Flash into the start of the loop.
    return smooth((q - 0.86) / 0.14)


# ---------------------------------------------------------------- Nairobi

def bulb_glow(cv, P, x, y, col=None, r=3):
    if P['night']:
        col = col if col is not None else P['bulb']
        cv.px(x, y, col)
        cv.glow(x, y, col, r, 0.3)


def depot(cv, P, x, tt, light):
    w, h = 50, 18
    top = STREET - h
    cv.rect(x, top, w, h, P['metal'][1])
    for i in range(x, x + w, 2):
        cv.vline(i, top, STREET - 1, P['metal'][0])
    gable_roof(cv, P, x - 2, w + 4, top - 7, 7, P['metal'][2], P['metal'][1])
    cv.rect(x + 18, STREET - 12, 14, 12, P['ink'])
    bulb_glow(cv, P, x + 25, top + 2, P['gas'])
    tx = x + 56
    for lx in (tx - 4, tx + 4):
        cv.vline(lx, STREET - 14, STREET - 1, P['timber'])
    cv.rect(tx - 5, STREET - 25, 11, 11, P['metal'][2])
    cv.hline(tx - 5, tx + 5, STREET - 21, P['metal'][0])
    cv.hline(tx - 5, tx + 5, STREET - 17, P['metal'][0])


def tents(cv, P, x, tt, light):
    for tx, tw in ((x + 4, 16), (x + 26, 20)):
        for j in range(tw // 2):
            cv.hline(tx + tw // 2 - j, tx + tw // 2 + j, STREET - tw // 2 + j, P['plaster'] if j % 3 else P['plaster_hi'])
        cv.vline(tx + tw // 2, STREET - tw // 2 - 2, STREET - 1, P['timber'])
        cv.rect(tx + tw // 2 - 1, STREET - 4, 3, 4, P['ink'])
        bulb_glow(cv, P, tx + tw // 2, STREET - 3, P['ember'])


def station(cv, P, x, tt, light):
    w, h = 50, 16
    top = STREET - h
    cv.rect(x, top, w, h, P['stone'][2])
    cv.rect(x, top, 2, h, P['plaster_hi'])
    cv.rect(x - 3, top - 3, w + 6, 3, P['roof'][1])
    windows(cv, P, x + 4, top + 4, w, h, 6, 1, light, 101, tt, (3, 5), (4, 4))
    for px_ in (x + 4, x + w - 5):
        cv.vline(px_, top - 14, top - 4, P['timber'])
    cv.rect(x + 2, top - 15, 46, 10, P['plaster_hi'] if not P['night'] else mix(P['plaster_hi'], P['gas'], 0.25))
    dot_text(cv, 'NAIROBI', x + 4, top - 13, P['ink'])


def dukas(cv, P, x, tt, light):
    for i, col in enumerate(('#2f6aa0', '#3f8a52', '#b0483a')):
        sx, top = x + i * 19, STREET - 15
        cv.rect(sx, top, 17, 15, P['plaster'])
        cv.rect(sx - 1, top - 3, 19, 3, P['metal'][2])
        shutter = rgb(col) if not P['night'] else mix(rgb(col), rgb('#151830'), 0.45)
        cv.rect(sx + 3, STREET - 10, 11, 10, shutter)
        for yy in range(STREET - 9, STREET, 2):
            cv.hline(sx + 3, sx + 13, yy, mix(shutter, P['ink'], 0.3))
        bulb_glow(cv, P, sx + 8, top + 2)


def colonial(cv, P, x, tt, light):
    w, h = 48, 22
    top = STREET - h
    cv.rect(x, top, w, h, P['stone'][2])
    gable_roof(cv, P, x - 2, w + 4, top - 8, 8, P['roof'][1], P['roof'][2])
    for ax in range(x + 2, x + w - 6, 9):
        cv.rect(ax, STREET - 11, 7, 11, mix(P['stone'][0], P['ink'], 0.4))
        cv.hline(ax + 1, ax + 5, STREET - 12, mix(P['stone'][0], P['ink'], 0.4))
    windows(cv, P, x + 4, top + 3, w, h, 5, 1, light, 102, tt, (4, 4), (5, 4))


def stone_shops(cv, P, x, tt, light):
    terrace(cv, dict(P, brick=P['stone']), x, 56, tt, light, 103)


def flag(cv, P, x, tt, light):
    acacia(cv, P, x + 30, STREET)
    px_, fy = x + 8, STREET - 40
    cv.vline(px_, fy - 1, STREET - 1, P['metal'][2])
    bands = ['#000000', '#000000', '#ffffff', '#bb0000', '#bb0000', '#bb0000', '#ffffff', '#006600', '#006600']
    for i in range(14):
        dy = round(math.sin(tt * 6 - i * 0.6) * 0.8)
        for j, col in enumerate(bands):
            c = rgb(col)
            if 5 <= i <= 8 and 1 <= j <= 7:  # the shield
                c = rgb('#000000') if i in (5, 8) else rgb('#bb0000') if j in (3, 4, 5) else rgb('#ffffff')
            cv.px(px_ + 1 + i, fy + j + dy, mix(c, rgb('#151830'), 0.4) if P['night'] else c)


def kicc(cv, P, x, tt, light):
    """Kenyatta International Convention Centre (1973): a fluted cylinder with a flared crown, beside
    its cone-roofed hall."""
    body = rgb('#a65a3c') if not P['night'] else rgb('#3a2630')
    fin = mix(body, P['ink'], 0.3)
    tx, w, h = x + 6, 14, 70
    top = STREET - h
    cv.rect(tx, top, w, h, body)
    for i in range(tx + 1, tx + w, 3):
        cv.vline(i, top + 4, STREET - 1, fin)
    cv.rect(tx - 3, top - 2, w + 6, 2, mix(body, rgb('#ffffff'), 0.25))
    cv.rect(tx - 1, top - 5, w + 2, 3, body)
    cv.vline(tx + w // 2, top - 10, top - 6, P['metal'][2])
    if P['night']:
        r = rng(104)
        for y in range(top + 6, STREET - 6, 4):
            for i in range(tx + 2, tx + w - 1, 3):
                if r() < 0.6:
                    cv.px(i, y, P['bulb'])
    cx = tx + w + 16
    for j in range(14):
        half = 3 + j * 1.1
        cv.hline(cx - half, cx + half, STREET - 14 + j, mix(body, rgb('#ffffff'), 0.12) if j % 4 else body)
    cv.vline(cx, STREET - 18, STREET - 15, P['metal'][2])


def bungalows(cv, P, x, tt, light):
    for i, bx in enumerate((x + 2, x + 32)):
        w, h = 24, 12
        top = STREET - h
        cv.rect(bx, top, w, h, P['plaster'])
        for j in range(5):
            cv.hline(bx - 2 + j, bx + w + 1 - j, top - 5 + j, P['roof'][1] if j < 4 else P['roof'][2])
        windows(cv, P, bx + 3, top + 3, w, h, 2, 1, light, 105 + i, tt, (4, 4), (10, 4))
        cv.rect(bx + 11, STREET - 7, 3, 7, P['timber'])


NAIROBI_KINDS = {
    'depot': depot,
    'tents': tents,
    'station': station,
    'dukas': dukas,
    'colonial': colonial,
    'stone_shops': stone_shops,
    'flag': flag,
    'kicc': kicc,
    'bungalows': bungalows,
    'acacia_big': lambda cv, P, x, tt, light: acacia(cv, P, x + 12, STREET),
    'acacia_pair': lambda cv, P, x, tt, light: (acacia(cv, P, x + 12, STREET), acacia(cv, P, x + 44, STREET)),
    'apartments_a': lambda cv, P, x, tt, light: apartments(cv, P, x, 52, 40, tt, light, 106),
    'apartments_e': lambda cv, P, x, tt, light: apartments(cv, P, x, 50, 36, tt, light, 107),
    'glass_mid_e': lambda cv, P, x, tt, light: tower(cv, P, x + 4, 42, 62, tt, light, 108, glass=True),
}


def matatu(cv, P, x, f, direction, livery):
    x = int(round(x))
    y = WALK + 3
    body = rgb(livery[0]) if not P['night'] else mix(rgb(livery[0]), rgb('#151830'), 0.4)
    cv.rect(x, y - 11, 24, 8, body)
    cv.rect(x + 1, y - 12, 21, 1, body)
    for i in range(x + 3, x + 21, 4):
        cv.rect(i, y - 10, 3, 3, P['glass'][1] if not P['night'] else P['bulb'])
    cv.hline(x, x + 23, y - 6, rgb(livery[1]))
    cv.hline(x + 2, x + 21, y - 5, rgb(livery[2]))
    for wx in (x + 5, x + 19):
        d = np.hypot(XX - wx, YY - (y - 3))
        cv.c[d <= 2.4] = P['ink']
    if P['night']:
        front = x + 24 if direction > 0 else x - 1
        cv.glow(front, y - 6, P['bulb'], 4, 0.3)


def expressway(cv, P, tt, f):
    """The elevated Nairobi Expressway (2022) along the street, with its own traffic up top."""
    deck = STREET - 24
    for px_ in range(18, W, 56):
        cv.rect(px_, deck + 3, 4, STREET - deck - 3, P['concrete'][1])
        cv.rect(px_ - 3, deck + 3, 10, 2, P['concrete'][0])
    cv.rect(0, deck, W, 3, P['concrete'][2])
    cv.hline(0, W - 1, deck + 3, P['concrete'][0])
    cv.hline(0, W - 1, deck - 2, P['metal'][1])
    for i in range(3):
        x = lane_x(tt, 70 + i * 12, i * 120, direction=1 if i % 2 == 0 else -1)
        col = (rgb('#e8e8ee'), rgb('#2443c4'), rgb('#3a3a40'))[i]
        cv.rect(x, deck - 5, 10, 3, col if not P['night'] else mix(col, rgb('#151830'), 0.4))
        cv.rect(x + 2, deck - 7, 6, 2, col if not P['night'] else mix(col, rgb('#151830'), 0.4))
        if P['night']:
            cv.glow(x + (10 if i % 2 == 0 else 0), deck - 4, P['led'], 3, 0.3)
    if P['night']:
        for lx in range(8, W, 24):
            cv.px(lx, deck - 3, P['led'])


def traffic_nairobi(cv, P, tt, f, e, p):
    if e == 5:
        cart(cv, P, lane_x(tt, 10, 40), 'ox', f)
    elif e == 6:
        car(cv, P, lane_x(tt, 30, 20), 't', f)
    elif e == 7:
        car(cv, P, lane_x(tt, 44, 140, direction=-1), '50s', f, -1)
    elif e == 8:
        matatu(cv, P, lane_x(tt, 40, 30), f, 1, ('#e8e4dc', '#2f6aa0', '#c99a2a'))
    else:
        expressway(cv, P, tt, f)
        matatu(cv, P, lane_x(tt, 42, 30), f, 1, ('#d9a400', '#b0483a', '#2f7a5a'))
        matatu(cv, P, lane_x(tt, 36, 200, direction=-1), f, -1, ('#2a2a34', '#7a4ad0', '#3fd0c0'))
        car(cv, P, lane_x(tt, 50, 120), 'ev', f)
    wipe = e == 5 and p < 0.3 and not JOURNEY
    kind = {5: 'uganda', 6: 'steam', 7: 'diesel', 8: 'diesel', 9: 'sgr'}[e]
    if not wipe:
        speed = {'uganda': 110, 'steam': 120, 'diesel': 160, 'sgr': 220}[kind]
        x = ((tt - e * ERA_S) * speed) % (W + 220) - 60 if kind != 'sgr' else W + 60 - ((tt - e * ERA_S) * speed) % (W + 260)
        train(cv, P, x, 'modern' if kind == 'sgr' else kind, tt)


# ---------------------------------------------------------------- frames

FINALE = {
    'global': dict(start=(40, STREET - 90), gate=(250, 56)),
    'nairobi': dict(start=(40, STREET - 90), gate=(118, 62)),
}


KEY = np.array([1, 2, 3], np.uint8)  # marks sky left empty, to be filled from a fixed sky


def sky_layer(cv, P, tt):
    sky(cv, P, tt)
    stars(cv, P, tt)
    orb(cv, P)
    if P['night']:
        cloud(cv, P, 248, 52, [(-14, 1, 3), (-5, 0, 4), (6, 0, 4), (15, 1, 3)])
    else:
        cloud(cv, P, 96, 46, [(-12, 1, 5), (-3, -2, 7), (7, 0, 6), (14, 1, 4)])
        cloud(cv, P, 182, 60, [(-8, 1, 4), (0, -2, 6), (8, 0, 4)])


def scene(f, P, base, tt, finale_args=None, with_sky=True):
    cv = Canvas(base.copy())
    e, _ = era_at(tt)
    if with_sky:
        sky_layer(cv, P, tt)
    else:
        cv.c[:] = KEY
    hills(cv, P, e)
    sky_traffic(cv, P, tt, e, f)
    ground(cv, P, tt)
    river(cv, P, tt)
    street(cv, P, tt, f)
    walkers(cv, P, tt, f)
    traffic(cv, P, tt, f)
    flash = finale(cv, P, tt, f, **finale_args) if finale_args else 0.0
    return cv.c, flash


def flash_in(c, P, f, flash, fps):
    white = rgb('#ffffff') if not P['night'] else rgb('#dff3ff')
    if flash > 0:
        c[:] = mix(c, white, flash)
    return c


def frame(f, P, base):
    global OVERRIDE
    tt = f / FPS
    e, p = era_at(tt)
    c, flash = scene(f, P, base, tt, FINALE[VARIANT])
    if in_nairobi(e) and e == 5 and p < 0.3:
        # The Uganda Railway carries us to Nairobi: the new place follows the train across the frame.
        OVERRIDE = (4, 0.99)
        old, _ = scene(f, P, base, tt)
        OVERRIDE = None
        head = (p / 0.3) * (W + 80) - 40
        c[:, int(max(0, head)):] = old[:, int(max(0, head)):]
        cv = Canvas(c)
        train(cv, P, head - 22, 'uganda', tt)
    return flash_in(c[CROP:], P, f, flash, FPS), flash_in(caption_bar(P, tt), P, f, flash, FPS)


FPS_J = 25.0
N_J = int(round(D * FPS_J))


def frame_journey(fj, P, base):
    """The camera walks with a traveller through every era, then holds for the finale."""
    global OVERRIDE, NO_BUILD
    tt = fj / FPS_J
    f = int(tt * FPS)
    hold = 2.2
    cam = min(1.0, tt / (D - hold)) * (N_ERAS - 1) * W
    k = int(cam // W)
    off = int(round(cam - k * W))
    cyc = (tt % ERA_S) / ERA_S
    NO_BUILD = True
    OVERRIDE = (k, cyc)
    left, _ = scene(f, P, base, tt, with_sky=False)
    if off and k + 1 < N_ERAS:
        OVERRIDE = (k + 1, cyc)
        right, _ = scene(f, P, base, tt, with_sky=False)
        c = np.concatenate([left[:, off:], right[:, :off]], axis=1)
    else:
        c = left
    # The sky is far away: it stays put while the town slides past, in the era at the centre.
    centre = cam + W / 2
    OVERRIDE = (min(N_ERAS - 1, int(centre // W)), cyc)
    sky_c = Canvas(base.copy())
    sky_layer(sky_c, P, tt)
    hole = (c == KEY).all(axis=2)
    c[hole] = sky_c.c[hole]
    cv = Canvas(c)
    # The traveller, dressed for the era under their feet.
    you_x = 128
    era_here = min(N_ERAS - 1, int((cam + you_x) // W))
    walking = tt < D - hold
    person(cv, P, you_x, WALK, YOU[era_here], f if walking else 0, 1, arm=None if walking else 1)
    flash = 0.0
    if not walking:
        OVERRIDE = (N_ERAS - 1, cyc)
        flash = finale(cv, P, tt, f, start=(you_x + 4, WALK - 14), gate=FINALE[VARIANT]['gate'])
    centre = cam + W / 2
    OVERRIDE = (min(N_ERAS - 1, int(centre // W)), (centre % W) / W if centre < N_ERAS * W - W / 2 else 0.99)
    bar = caption_bar(P, tt)
    OVERRIDE, NO_BUILD = None, False
    return flash_in(cv.c[CROP:], P, fj, flash, FPS_J), flash_in(bar, P, fj, flash, FPS_J)


def render(name, journey=False):
    P = palette(name == 'night')
    base = np.zeros((H, W, 3), np.uint8)
    if journey:
        return [frame_journey(f, P, base) for f in range(N_J)]
    return [frame(f, P, base) for f in range(N)]


def compose(scene, bar):
    """The scene scaled up to the output, with the caption bar (already at output size) underneath."""
    big = Image.fromarray(scene).resize((W * SCALE, (H - CROP) * SCALE), Image.NEAREST)
    return Image.fromarray(np.vstack([np.asarray(big), bar]))


def main():
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
    arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
    only, sheet = arg('--only'), arg('--sheet')
    formats = [arg('--format')] if arg('--format') else ['place', 'journey']
    variants = [arg('--variant')] if arg('--variant') else ['global', 'nairobi']
    for fmt in formats:
        for variant in variants:
            set_variant(variant, fmt == 'journey')
            fps = FPS_J if fmt == 'journey' else FPS
            for name in ('day', 'night'):
                if only and name != only:
                    continue
                frames = [compose(s, b) for s, b in render(name, fmt == 'journey')]
                fw, fh = frames[0].size
                tag = f'{fmt}-{variant}-{name}'
                if sheet:
                    picks = [int((e * ERA_S + ERA_S * 0.6) * fps) for e in range(N_ERAS)] + [len(frames) - int(8 * fps / FPS)]
                    th = round(fh * W * 2 / fw)
                    tiles = [frames[i].resize((W * 2, th), Image.LANCZOS) for i in picks]
                    rows = (len(tiles) + 1) // 2
                    sh = Image.new('RGB', (W * 4, th * rows), 'white')
                    for i, im in enumerate(tiles):
                        sh.paste(im, ((i % 2) * W * 2, (i // 2) * th))
                    sh.save(sheet.replace('.png', f'-{tag}.png'))
                imgs = frames
                out = os.path.join(root, 'assets', f'story-{tag}.webp')
                imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=int(round(1000 / fps)), loop=0, lossless=True, method=3)
                print(tag, len(frames), 'frames', os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    main()
