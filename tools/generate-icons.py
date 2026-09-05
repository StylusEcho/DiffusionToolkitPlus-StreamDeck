#!/usr/bin/env python3
"""
Draws every PNG the plugin needs.

Committed so the icons can be regenerated rather than being opaque binaries nobody can edit.
Needs nothing but the standard library - no PIL, no ImageMagick.

    python3 tools/generate-icons.py

Shapes are described in a 0..1 space and supersampled, so one description serves every size Stream
Deck asks for.
"""

from __future__ import annotations

import math
import os
import struct
import zlib

PLUGIN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "com.stylusecho.dtplus.sdPlugin")

# The accent teal the application itself uses for badges and markers
ACCENT = (0x00, 0xC2, 0xCB)
DIM = (0x6A, 0x77, 0x7A)
WHITE = (0xEC, 0xF2, 0xF3)

SAMPLES = 4


# --------------------------------------------------------------------------------------------
# Shapes. Each is a predicate over the unit square, so they compose and scale freely.
# --------------------------------------------------------------------------------------------


def diamond(cx=0.5, cy=0.5, r=0.42):
    """The mark the application uses - an L1 ball."""
    def inside(x, y):
        return abs(x - cx) / r + abs(y - cy) / r <= 1.0
    return inside


def star(cx=0.5, cy=0.52, outer=0.44, inner=0.18, points=5):
    verts = []
    for i in range(points * 2):
        angle = -math.pi / 2 + i * math.pi / points
        radius = outer if i % 2 == 0 else inner
        verts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle)))
    return polygon(verts)


def chevron(cx=0.54, cy=0.5, size=0.34, thickness=0.14):
    """A right-pointing arrowhead, drawn as two strokes so it reads at 20px."""
    upper = segment((cx - size, cy - size), (cx, cy), thickness)
    lower = segment((cx - size, cy + size), (cx, cy), thickness)

    def inside(x, y):
        return upper(x, y) or lower(x, y)
    return inside


def bars(count=3, widths=(0.62, 0.48, 0.34), top=0.34, gap=0.16, thickness=0.10, left=0.19):
    rects = []
    for i in range(count):
        y = top + i * gap
        rects.append((left, y - thickness / 2, left + widths[i], y + thickness / 2))

    def inside(x, y):
        return any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in rects)
    return inside


def pill(x0, y0, x1, y1):
    """Rounded rectangle whose corner radius is half its height."""
    r = (y1 - y0) / 2.0

    def inside(x, y):
        if y < y0 or y > y1:
            return False
        if x0 + r <= x <= x1 - r:
            return True
        cx = x0 + r if x < x0 + r else x1 - r
        cy = (y0 + y1) / 2.0
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    return inside


def disc(cx, cy, r):
    def inside(x, y):
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    return inside


def polygon(verts):
    def inside(x, y):
        crossings = 0
        n = len(verts)
        for i in range(n):
            x0, y0 = verts[i]
            x1, y1 = verts[(i + 1) % n]
            if (y0 > y) != (y1 > y):
                t = (y - y0) / (y1 - y0)
                if x < x0 + t * (x1 - x0):
                    crossings += 1
        return crossings % 2 == 1
    return inside


def segment(a, b, thickness):
    """A thick line with rounded ends."""
    (ax, ay), (bx, by) = a, b
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    half = thickness / 2.0

    def inside(x, y):
        if length_sq == 0:
            return (x - ax) ** 2 + (y - ay) ** 2 <= half * half
        t = max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / length_sq))
        px, py = ax + t * dx, ay + t * dy
        return (x - px) ** 2 + (y - py) ** 2 <= half * half
    return inside


# --------------------------------------------------------------------------------------------
# Rasterising
# --------------------------------------------------------------------------------------------


def render(size, layers):
    """
    layers: list of (shape, rgb). Later layers paint over earlier ones.

    Coverage is measured by supersampling, which is what keeps a 20px star from looking like
    gravel.
    """
    rows = []

    step = 1.0 / (size * SAMPLES)
    offset = step / 2.0

    for py in range(size):
        row = bytearray()
        for px in range(size):
            acc_r = acc_g = acc_b = 0.0
            acc_a = 0.0

            for sy in range(SAMPLES):
                y = (py * SAMPLES + sy) * step + offset
                for sx in range(SAMPLES):
                    x = (px * SAMPLES + sx) * step + offset

                    hit = None
                    for shape, colour in layers:
                        if shape(x, y):
                            hit = colour

                    if hit is not None:
                        acc_r += hit[0]
                        acc_g += hit[1]
                        acc_b += hit[2]
                        acc_a += 1.0

            total = SAMPLES * SAMPLES

            if acc_a == 0:
                row += bytes((0, 0, 0, 0))
            else:
                # Straight (unpremultiplied) alpha, so the colour is the average of the samples
                # that actually landed on the shape
                row += bytes((
                    int(round(acc_r / acc_a)),
                    int(round(acc_g / acc_a)),
                    int(round(acc_b / acc_a)),
                    int(round(255 * acc_a / total)),
                ))

        rows.append(bytes(row))

    return rows


def write_png(path, size, layers):
    rows = render(size, layers)

    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")

    os.makedirs(os.path.dirname(path), exist_ok=True)

    with open(path, "wb") as handle:
        handle.write(png)

    return len(png)


def write_pair(relative, base_size, layers):
    """Stream Deck wants name.png and name@2x.png, and the manifest names neither extension."""
    total = 0
    total += write_png(os.path.join(PLUGIN_DIR, relative + ".png"), base_size, layers)
    total += write_png(os.path.join(PLUGIN_DIR, relative + "@2x.png"), base_size * 2, layers)
    return total


# --------------------------------------------------------------------------------------------


def toggle_off():
    return [
        (pill(0.16, 0.38, 0.84, 0.62), DIM),
        (disc(0.28, 0.50, 0.085), WHITE),
    ]


def toggle_on():
    return [
        (pill(0.16, 0.38, 0.84, 0.62), ACCENT),
        (disc(0.72, 0.50, 0.085), WHITE),
    ]


GLYPHS = {
    "rate": [(star(), ACCENT)],
    "command": [(chevron(), ACCENT)],
    "toggle": toggle_on(),
    "status": [(bars(), ACCENT)],
}


def main():
    written = 0

    # Plugin and category marks use the application's own diamond
    written += write_pair("imgs/plugin/marketplace", 288, [(diamond(r=0.40), ACCENT)])
    written += write_pair("imgs/plugin/category", 28, [(diamond(r=0.44), ACCENT)])

    for name, layers in GLYPHS.items():
        # Shown in the actions list
        written += write_pair(f"imgs/actions/{name}/icon", 20, layers)
        # Shown on the key itself
        written += write_pair(f"imgs/actions/{name}/key", 72, layers)

    # The toggle key needs a look for each state
    written += write_pair("imgs/actions/toggle/key-off", 72, toggle_off())
    written += write_pair("imgs/actions/toggle/key-on", 72, toggle_on())

    print(f"wrote icons under {PLUGIN_DIR} ({written} bytes)")


if __name__ == "__main__":
    main()
