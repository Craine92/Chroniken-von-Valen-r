"""Zeichnet das Programm-Symbol der Desktop-Version: das Valenør-Siegel.

Ein goldenes Rundsiegel mit Runenpunkten, dunkelviolettem Grund und der goldenen V-Rune aus dem Favicon. Für kleine
Größen (16–32 px) gibt es eine vereinfachte Fassung mit kräftigeren Linien, damit das Symbol in der Taskleiste lesbar
bleibt. Ergebnis: desktop/build/icon.ico (alle Windows-Größen) und desktop/build/icon.png (512 px).

Aufruf (aus dem Projektordner, benötigt Pillow):  python scripts/desktop-icon.py
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "desktop/build"
S = 1024  # Zeichenfläche; verkleinert wird mit Lanczos.
GOLD_LIGHT, GOLD, GOLD_DARK = (246, 222, 150), (216, 184, 106), (122, 84, 26)
VIOLET, NIGHT = (58, 36, 92), (10, 9, 18)


def radial(size, inner, outer, radius, center=None):
    """Kreis mit radialem Verlauf von inner (Mitte) nach outer (Rand)."""
    cx, cy = center or (size / 2, size / 2)
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for step in range(int(radius), 0, -2):
        t = step / radius
        color = tuple(round(inner[i] + (outer[i] - inner[i]) * t) for i in range(3)) + (255,)
        draw.ellipse((cx - step, cy - step, cx + step, cy + step), fill=color)
    return layer


def ring(draw, radius, width, color):
    c = S / 2
    draw.ellipse((c - radius, c - radius, c + radius, c + radius), outline=color, width=width)


def rune(draw, scale, width, color):
    """Die V-Rune des Favicons: Schild-Raute mit eingeschriebenem V und Querstrich."""
    c = S / 2
    shield = [(32, 7), (47, 20), (42, 48), (32, 58), (22, 48), (17, 20)]
    to = lambda x, y: (c + (x - 32) * scale, c + (y - 32.5) * scale)
    draw.line([to(*p) for p in shield + shield[:1]], fill=color, width=width, joint="curve")
    draw.line([to(23, 20), to(32, 47), to(41, 20)], fill=color, width=width, joint="curve")
    draw.line([to(24, 34), to(40, 34)], fill=color, width=width)
    for x, y in ((23, 20), (41, 20), (24, 34), (40, 34), (32, 47)):
        px, py = to(x, y)
        draw.ellipse((px - width / 2, py - width / 2, px + width / 2, py + width / 2), fill=color)


def detailed():
    image = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    # Goldener Außenring mit Verlauf (hell oben links, dunkel unten rechts).
    image.alpha_composite(radial(S, GOLD_LIGHT, GOLD_DARK, 640, (S * .42, S * .38)))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse((12, 12, S - 12, S - 12), fill=255)
    image.putalpha(mask)
    # Innere Scheibe: dunkles Violett zur Mitte hin heller.
    disc = radial(S, VIOLET, NIGHT, 452)
    disc_mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(disc_mask).ellipse((S / 2 - 452, S / 2 - 452, S / 2 + 452, S / 2 + 452), fill=255)
    image.paste(disc, (0, 0), disc_mask)
    draw = ImageDraw.Draw(image)
    ring(draw, 452, 10, GOLD_DARK)
    ring(draw, 405, 6, GOLD)
    # Zwölf Runenpunkte zwischen den Ringen.
    for index in range(12):
        angle = index * math.tau / 12 - math.pi / 2
        x, y = S / 2 + 430 * math.cos(angle), S / 2 + 430 * math.sin(angle)
        r = 11 if index % 3 else 17
        draw.ellipse((x - r, y - r, x + r, y + r), fill=GOLD_LIGHT if index % 3 == 0 else GOLD)
    # Leuchten hinter der Rune.
    glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rune(ImageDraw.Draw(glow), 11.5, 60, (255, 200, 110, 140))
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(28)))
    rune(draw, 11.5, 40, GOLD_DARK)
    rune(draw, 11.5, 26, GOLD_LIGHT)
    return image


def simple():
    """Für 16–32 px: nur Goldscheibe, dunkler Grund und eine dicke Rune."""
    image = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((8, 8, S - 8, S - 8), fill=GOLD)
    draw.ellipse((90, 90, S - 90, S - 90), fill=NIGHT)
    rune(draw, 12.5, 78, GOLD_LIGHT)
    return image


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    big, small = detailed(), simple()
    sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
    frames = [(small if size <= 32 else big).resize((size, size), Image.LANCZOS) for size in sizes]
    frames[-1].save(OUT / "icon.ico", format="ICO", sizes=[(size, size) for size in sizes], append_images=frames[:-1])
    big.resize((512, 512), Image.LANCZOS).save(OUT / "icon.png", optimize=True)
    print("ok:", OUT / "icon.ico", (OUT / "icon.ico").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
