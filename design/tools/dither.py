"""Render Logical-style dithered pixel shapes as transparent PNGs (no dependencies).

Usage: python3 tools/dither.py <output-dir>
"""
import math
import random
import struct
import sys
import zlib
from pathlib import Path

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

OCEAN = ["#7ee2a0", "#5ec6d6", "#3b74ea", "#2462ea"]
LIME = ["#7ee2a0", "#b9ec8c", "#eef58f"]
SUNSET = ["#7b4fe0", "#d4508a", "#ec6f6a", "#f2a066"]
AURORA = ["#eef58f", "#7ee2a0", "#5ec6d6", "#2462ea"]


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def ramp(stops, t):
    t = min(max(t, 0.0), 1.0) * (len(stops) - 1)
    i = min(int(t), len(stops) - 2)
    f = t - i
    a, b = hex_rgb(stops[i]), hex_rgb(stops[i + 1])
    return tuple(round(a[k] + (b[k] - a[k]) * f) for k in range(3))


def write_png(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(px[y * w * 4:(y + 1) * w * 4]) for y in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    Path(path).write_bytes(png)


def render(path, w, h, cell, field, stops, scale=2, seed=7):
    """field(u, v) -> (density 0..1, gradient t 0..1); u, v are cell centers in logical px."""
    rnd = random.Random(seed)
    W, H = w * scale, h * scale
    px = bytearray(W * H * 4)
    dot = max(1, round(cell * scale * 0.74))
    for j in range(h // cell):
        for i in range(w // cell):
            u, v = (i + 0.5) * cell, (j + 0.5) * cell
            d, t = field(u, v)
            threshold = (BAYER[j % 4][i % 4] + 0.5) / 16 * 0.85 + rnd.random() * 0.15
            if d <= threshold:
                continue
            t += (rnd.random() - 0.5) * 0.12
            r, g, b = ramp(stops, t)
            x0, y0 = round(i * cell * scale), round(j * cell * scale)
            for y in range(y0, min(y0 + dot, H)):
                row = y * W * 4
                for x in range(x0, min(x0 + dot, W)):
                    o = row + x * 4
                    px[o:o + 4] = bytes((r, g, b, 255))
    write_png(path, W, H, px)


def arc(w, h, thickness):
    cx, cy, R = w / 2, h, min(w / 2, h) - thickness * 0.9

    def f(u, v):
        r = math.hypot(u - cx, v - cy)
        ang = math.atan2(cy - v, u - cx)  # 0 right .. pi left
        d = math.exp(-(((r - R) / thickness) ** 2) * 1.6)
        return d * (0.75 + 0.25 * math.sin(ang * 3 + 1.3) ** 2), 1 - ang / math.pi

    return f


def orb(w, h):
    cx, cy, R = w / 2, h / 2, min(w, h) / 2

    def f(u, v):
        r = math.hypot(u - cx, v - cy) / R
        return max(0.0, 1 - r ** 2.2) * 1.15, v / h

    return f


def diamond(w, h):
    cx, cy = w / 2, h / 2

    def f(u, v):
        r = abs(u - cx) / (w / 2) + abs(v - cy) / (h / 2)
        return max(0.0, 1 - r ** 1.8) * 1.2, v / h

    return f


def bar(w, h):
    def f(u, v):
        ex = min(u, w - u) / (h * 0.9)
        ey = min(v, h - v) / (h * 0.32)
        return min(1.0, ex) * min(1.0, ey) * 1.1, u / w

    return f


def burst(w, h, rays=8):
    cx, cy, R = w / 2, h / 2, min(w, h) / 2

    def f(u, v):
        r = math.hypot(u - cx, v - cy) / R
        a = math.atan2(v - cy, u - cx)
        spike = 0.55 + 0.45 * abs(math.cos(a * rays / 2)) ** 3
        return max(0.0, 1 - r / spike) * 1.3, u / w

    return f


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "images")
    out.mkdir(parents=True, exist_ok=True)
    render(out / "dither-arc.png", 880, 470, 9, arc(880, 470, 70), ["#7ee2a0", "#5ec6d6", "#3b74ea", "#2462ea"])
    render(out / "dither-orb-ocean.png", 220, 220, 6, orb(220, 220), list(reversed(OCEAN)))
    render(out / "dither-orb-sunset.png", 220, 220, 6, orb(220, 220), SUNSET, seed=3)
    render(out / "dither-diamond-sunset.png", 220, 220, 6, diamond(220, 220), SUNSET, seed=11)
    render(out / "dither-diamond-ocean.png", 220, 220, 6, diamond(220, 220), list(reversed(OCEAN)), seed=5)
    render(out / "dither-bar-ocean.png", 640, 72, 6, bar(640, 72), list(reversed(OCEAN)), seed=9)
    render(out / "dither-bar-lime.png", 640, 72, 6, bar(640, 72), LIME, seed=4)
    render(out / "dither-burst.png", 360, 360, 7, burst(360, 360), AURORA, seed=2)
    render(out / "dither-diamond-sm.png", 56, 56, 4, diamond(56, 56), SUNSET, seed=11)
    render(out / "dither-orb-sm.png", 56, 56, 4, orb(56, 56), list(reversed(OCEAN)), seed=5)
    render(out / "dither-burst-sm.png", 64, 64, 4, burst(64, 64), AURORA, seed=2)
