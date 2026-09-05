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



def heart(cx=0.5, cy=0.46, s=0.33):
    """
    The implicit heart curve, rather than circles glued to a triangle.

    Fitting lobes to a triangle by eye leaves the joins visible and the point too wide; the curve
    is correct at every size for free.
    """
    def inside(px, py):
        x = (px - cx) / s
        y = -(py - cy) / s

        v = x * x + y * y - 1

        return v * v * v - x * x * y * y * y <= 0
    return inside


def bookmark(cx=0.5, cy=0.5, w=0.28, h=0.42, notch=0.13):
    """The marker the toolkit uses for the quick album."""
    x0, x1 = cx - w, cx + w
    y0, y1 = cy - h, cy + h

    def inside(x, y):
        if not (x0 <= x <= x1 and y0 <= y <= y1):
            return False
        # Cut a V out of the bottom edge
        depth = notch * (1.0 - abs(x - cx) / w)
        return y <= y1 - depth
    return inside


def eye(cx=0.5, cy=0.5, w=0.42, h=0.24):
    """A lens shape - two arcs meeting at the corners - with a pupil."""
    outer = lens(cx, cy, w, h)
    pupil = disc(cx, cy, h * 0.52)

    def inside(x, y):
        return outer(x, y) and not pupil(x, y)
    return inside


def eye_closed(cx=0.5, cy=0.5, w=0.42, h=0.24):
    """The same lens struck through, for hidden."""
    outer = eye(cx, cy, w, h)
    slash = segment((cx - w * 0.86, cy + h * 1.5), (cx + w * 0.86, cy - h * 1.5), 0.085)

    def inside(x, y):
        return outer(x, y) or slash(x, y)
    return inside


def lens(cx, cy, w, h):
    """Intersection of two discs, giving the almond outline of an eye."""
    r = (w * w + h * h) / (2.0 * h) / 1.0
    top = disc(cx, cy + (r - h), r)
    bottom = disc(cx, cy - (r - h), r)

    def inside(x, y):
        return top(x, y) and bottom(x, y)
    return inside


def bin_(cx=0.5, cy=0.54, w=0.26, h=0.30):
    """A waste basket: lid, handle, body."""
    lid = rect(cx - w * 1.25, cy - h - 0.10, cx + w * 1.25, cy - h - 0.02)
    handle = rect(cx - w * 0.42, cy - h - 0.17, cx + w * 0.42, cy - h - 0.10)
    body = polygon([
        (cx - w, cy - h),
        (cx + w, cy - h),
        (cx + w * 0.74, cy + h),
        (cx - w * 0.74, cy + h),
    ])

    def inside(x, y):
        return lid(x, y) or handle(x, y) or body(x, y)
    return inside


def folder(cx=0.5, cy=0.52, w=0.36, h=0.26):
    tab = rect(cx - w, cy - h - 0.08, cx - w * 0.24, cy - h)
    body = rect(cx - w, cy - h, cx + w, cy + h)

    def inside(x, y):
        return tab(x, y) or body(x, y)
    return inside


def picture(cx=0.5, cy=0.5, w=0.36, h=0.28):
    """A frame with a hill and a sun in it."""
    frame = rect(cx - w, cy - h, cx + w, cy + h)
    inner = rect(cx - w + 0.055, cy - h + 0.055, cx + w - 0.055, cy + h - 0.055)
    hill = polygon([
        (cx - w + 0.055, cy + h - 0.055),
        (cx - w * 0.12, cy - h * 0.10),
        (cx + w * 0.55, cy + h - 0.055),
    ])
    sun = disc(cx + w * 0.48, cy - h * 0.42, 0.045)

    def inside(x, y):
        if frame(x, y) and not inner(x, y):
            return True
        return hill(x, y) or sun(x, y)
    return inside


def magnifier(cx=0.47, cy=0.46, r=0.22):
    ring_outer = disc(cx, cy, r)
    ring_inner = disc(cx, cy, r - 0.075)
    handle = segment((cx + r * 0.70, cy + r * 0.70), (cx + r * 1.55, cy + r * 1.55), 0.10)

    def inside(x, y):
        return (ring_outer(x, y) and not ring_inner(x, y)) or handle(x, y)
    return inside


def arc(cx, cy, r, thickness, start_deg, end_deg):
    """A band of an annulus between two angles, measured clockwise from due east."""
    inner = r - thickness / 2.0
    outer = r + thickness / 2.0

    def inside(x, y):
        dx, dy = x - cx, y - cy

        distance = math.hypot(dx, dy)

        if not (inner <= distance <= outer):
            return False

        angle = math.degrees(math.atan2(dy, dx)) % 360

        return (angle - start_deg) % 360 <= (end_deg - start_deg) % 360
    return inside


def arrows_cycle(cx=0.5, cy=0.5, r=0.28, thickness=0.10):
    """
    One arc with a head on it, for refresh.

    An earlier version cut two gaps out of a ring and put a triangle at each: at key size that read
    as a broken ring with tabs, not as something circling. The head has to be wider than the band
    and stick out along the tangent, or it just looks like a thicker end.
    """
    end = 320.0

    band = arc(cx, cy, r, thickness, 30, end)

    theta = math.radians(end)

    # Where the arc stops, and the two directions at that point
    px, py = cx + r * math.cos(theta), cy + r * math.sin(theta)
    tx, ty = -math.sin(theta), math.cos(theta)
    nx, ny = math.cos(theta), math.sin(theta)

    length, width = 0.17, 0.105

    head = polygon([
        (px + tx * length, py + ty * length),
        (px + nx * width, py + ny * width),
        (px - nx * width, py - ny * width),
    ])

    def inside(x, y):
        return band(x, y) or head(x, y)
    return inside


def funnel(cx=0.5, top=0.24, half=0.32, waist=0.075, bottom=0.80):
    """The usual filter shape: a wide mouth narrowing into a stem."""
    mid = top + (bottom - top) * 0.44

    return polygon([
        (cx - half, top),
        (cx + half, top),
        (cx + waist, mid),
        (cx + waist, bottom),
        (cx - waist, bottom - 0.09),
        (cx - waist, mid),
    ])


def rect(x0, y0, x1, y1):
    def inside(x, y):
        return x0 <= x <= x1 and y0 <= y <= y1
    return inside


def slash(cx=0.5, cy=0.5, extent=0.34, thickness=0.085):
    """Struck through, for the "clear" variants."""
    return segment((cx - extent, cy + extent), (cx + extent, cy - extent), thickness)


def combine(*shapes):
    def inside(x, y):
        return any(s(x, y) for s in shapes)
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


# The four action tiles, as they appear in Stream Deck's actions list
GLYPHS = {
    "rate": [(star(), ACCENT)],
    "command": [(chevron(), ACCENT)],
    "toggle": toggle_on(),
    "status": [(bars(), ACCENT)],
}


def ring(outer_shape, inner_shape):
    """Anything minus a smaller copy of itself, giving an outline."""
    def inside(x, y):
        return outer_shape(x, y) and not inner_shape(x, y)
    return inside


def star_outline(cx=0.5, cy=0.52, outer=0.44, inner=0.18, weight=0.74):
    return ring(star(cx, cy, outer, inner), star(cx, cy, outer * weight, inner * weight))


def mirrored(shape):
    """Same glyph facing the other way, so previous is not a next pointing the wrong direction."""
    def inside(x, y):
        return shape(1.0 - x, y)
    return inside


def double(shape, offset=0.16):
    """Two of the same glyph side by side, for the page rather than image variants."""
    def inside(x, y):
        return shape(x + offset, y) or shape(x - offset, y)
    return inside


NEXT = chevron(cx=0.56, cy=0.5, size=0.30, thickness=0.13)
PREV = mirrored(NEXT)

# One glyph per command. A key showing a generic mark tells you nothing about what it will do, and
# a "previous" key pointing right is actively misleading - which is what the shared chevron did.
COMMAND_GLYPHS = {
    "nav.next": NEXT,
    "nav.prev": PREV,
    "page.next": double(chevron(cx=0.56, cy=0.5, size=0.22, thickness=0.11), 0.13),
    "page.prev": mirrored(double(chevron(cx=0.56, cy=0.5, size=0.22, thickness=0.11), 0.13)),

    "favorite": heart(),
    "nsfw": eye_closed(),
    "delete": bin_(),
    "quickalbum.toggle": bookmark(),

    "view.images": picture(),
    "view.folders": folder(),
    "view.favorites": heart(s=0.30),
    "view.deleted": bin_(),
    "quickalbum.open": bookmark(w=0.24, h=0.36),

    "filter.clear": combine(funnel(), slash(extent=0.36, thickness=0.075)),
    "refresh": arrows_cycle(),
    "explorer.show": magnifier(),
    "info.toggle": eye(),
}

# Commands the toolkit reports state for. These get a dim variant as well, so the key can show
# that the current image is already a favourite rather than only offering to make it one.
STATEFUL_COMMANDS = {
    "favorite", "nsfw", "delete", "quickalbum.toggle", "info.toggle",
    "view.images", "view.folders", "view.favorites", "view.deleted", "filter.clear",
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

    # Rating keys: a filled star for a rating the selected image has reached, an outline for one it
    # has not, and a struck star for the key that clears the rating
    written += write_pair("imgs/rating/star-on", 72, [(star(), ACCENT)])
    written += write_pair("imgs/rating/star-off", 72, [(star_outline(), DIM)])
    written += write_pair("imgs/rating/clear-on", 72, [(combine(star_outline(), slash(extent=0.40, thickness=0.075)), ACCENT)])
    written += write_pair("imgs/rating/clear-off", 72, [(combine(star_outline(), slash(extent=0.40, thickness=0.075)), DIM)])

    # One key image per command, and a lit one for those the toolkit reports state for
    for command, shape in COMMAND_GLYPHS.items():
        slug = command.replace(".", "-")

        if command in STATEFUL_COMMANDS:
            written += write_pair(f"imgs/commands/{slug}-off", 72, [(shape, DIM)])
            written += write_pair(f"imgs/commands/{slug}-on", 72, [(shape, ACCENT)])
        else:
            written += write_pair(f"imgs/commands/{slug}", 72, [(shape, ACCENT)])

    print(f"wrote icons under {PLUGIN_DIR} ({written} bytes)")


if __name__ == "__main__":
    main()
