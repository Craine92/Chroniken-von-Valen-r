"""Ermittelt die innere Öffnung der Kartenrahmen direkt aus den Rahmenbildern und erzeugt daraus

  * eine Rahmen-Deckschicht mit ausgeschnittener Öffnung (liegt auf der Karte ganz oben),
  * eine Maske der Öffnung (schneidet Bild und Pergament auf genau diese Form zu),
  * apps/client/src/game/assets/card-frame-openings.ts mit Lage der Öffnung und sicherer Textfläche.

Das Pergament im Rahmen ist hell und blass, Gold und Ornamente sind gesättigt oder dunkel. Ausgehend von der Mitte wird
die zusammenhängende Pergamentfläche gefüllt; Löcher (Flecken im Pergament) werden geschlossen, dünne Ausreißer in
blasse Goldstellen entfernt und die Fläche leicht nach innen gezogen, damit die goldene Innenlinie stehen bleibt.

Aufruf (aus dem Projektordner, benötigt Pillow):  python scripts/card-frame-openings.py
"""
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "apps/client/public/assets/cards"
OUTPUT_TS = ROOT / "apps/client/src/game/assets/card-frame-openings.ts"
FRAMES = {"adventure": "CardAbenteuer", "fate": "CardSchicksal"}
# Abstand zur goldenen Innenlinie in Bildpixeln (Rahmen 1058 × 1487).
SAFETY_PX = 6
# Weiche Kante der Maske in Bildpixeln.
FEATHER_PX = 2
# Pergament ist blass; zum Rand hin wird es dunkler und etwas kräftiger, bleibt aber unter dem Gold.
PARCHMENT_MAX_SATURATION = .5
# Kleine Einbuchtungen der Fläche (abgedunkelte Pergamentränder) werden bis zu dieser Breite geschlossen.
CLOSE_PX = 31
# Text nur dort, wo die Öffnung mindestens so breit ist (Anteil der vollen Breite): unten ragen Medaillon und Ecken hinein.
TEXT_MIN_WIDTH = .93


def is_parchment(pixel):
    red, green, blue, alpha = pixel
    if alpha < 200:
        return False
    high, low = max(red, green, blue), min(red, green, blue)
    return high >= 140 and (high - low) / high <= PARCHMENT_MAX_SATURATION


def flood(width, height, allowed, start):
    seen = bytearray(width * height)
    queue = deque([start])
    seen[start[1] * width + start[0]] = 1
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            index = ny * width + nx
            if 0 <= nx < width and 0 <= ny < height and not seen[index] and allowed(nx, ny):
                seen[index] = 1
                queue.append((nx, ny))
    return seen


def opening_mask(frame):
    width, height = frame.size
    pixels = frame.load()
    filled = flood(width, height, lambda x, y: is_parchment(pixels[x, y]), (width // 2, height // 2))
    # Löcher schließen: Was von außen nicht erreichbar ist, gehört zur Öffnung.
    outside = flood(width, height, lambda x, y: not filled[y * width + x], (0, 0))
    mask = Image.frombytes("L", (width, height), bytes(0 if outside[i] else 255 for i in range(width * height)))
    # Dünne Ausreißer in blasse Goldstellen entfernen (Öffnen), kleine Einbuchtungen schließen, dann Abstand zur Goldlinie.
    mask = mask.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    mask = mask.filter(ImageFilter.MaxFilter(CLOSE_PX)).filter(ImageFilter.MinFilter(CLOSE_PX))
    mask = mask.filter(ImageFilter.MinFilter(2 * SAFETY_PX + 1))
    return mask.filter(ImageFilter.GaussianBlur(FEATHER_PX))


def measure(mask):
    width, height = mask.size
    pixels = mask.load()
    rows = []
    for y in range(height):
        xs = [x for x in range(width) if pixels[x, y] >= 128]
        rows.append((min(xs), max(xs)) if xs else None)
    ys = [y for y, row in enumerate(rows) if row]
    top, bottom = ys[0], ys[-1] + 1
    left = min(row[0] for row in rows if row)
    right = max(row[1] for row in rows if row) + 1
    box_width, box_height = right - left, bottom - top
    # Sichere Textfläche: von unten die erste Zeile, in der die Öffnung fast ihre volle Breite hat.
    text_bottom = next(y for y in range(bottom - 1, top, -1) if rows[y] and rows[y][1] - rows[y][0] >= TEXT_MIN_WIDTH * box_width)
    lower = [rows[y] for y in range(top + box_height // 2, text_bottom) if rows[y]]
    side = max(max(row[0] - left, right - 1 - row[1]) for row in lower)
    return {
        "box": (left, top, right, bottom),
        "inset": {"top": top / height, "right": 1 - right / width, "bottom": 1 - bottom / height, "left": left / width},
        "textBottom": (bottom - text_bottom) / box_height,
        "textSide": side / box_width,
    }


def main():
    entries = []
    for deck, name in FRAMES.items():
        frame = Image.open(CARDS / f"{name}.png").convert("RGBA")
        mask = opening_mask(frame)
        info = measure(mask)
        # Deckschicht: Rahmen ohne die Öffnung.
        overlay = frame.copy()
        overlay.putalpha(Image.composite(Image.new("L", frame.size, 0), frame.getchannel("A"), mask))
        overlay_path = CARDS / f"{name}-overlay.webp"
        overlay.save(overlay_path, "WEBP", quality=90, method=6)
        # Maske, auf die Öffnung zugeschnitten (weiß, Deckkraft = Öffnung), in halber Auflösung: die Kante ist weich.
        left, top, right, bottom = info["box"]
        crop = mask.crop((left, top, right, bottom))
        shape = Image.new("RGBA", crop.size, (255, 255, 255, 0))
        shape.putalpha(crop)
        mask_path = CARDS / f"{name}-opening.png"
        shape.resize((crop.width // 2, crop.height // 2), Image.LANCZOS).save(mask_path, optimize=True)
        print(f"{deck}: Öffnung {info['box']}, Text unten {info['textBottom']:.3f}, seitlich {info['textSide']:.3f}, "
              f"Deckschicht {overlay_path.stat().st_size // 1024} KB, Maske {mask_path.stat().st_size // 1024} KB")
        inset = info["inset"]
        entries.append(f'''  {deck}: {{
    overlay: "/assets/cards/{name}-overlay.webp",
    mask: "/assets/cards/{name}-opening.png",
    inset: {{ top: {inset["top"]:.4f}, right: {inset["right"]:.4f}, bottom: {inset["bottom"]:.4f}, left: {inset["left"]:.4f} }},
    textBottom: {info["textBottom"]:.4f},
    textSide: {info["textSide"]:.4f}
  }}''')
    OUTPUT_TS.write_text(
        "// Erzeugt von scripts/card-frame-openings.py aus den Rahmenbildern – nicht von Hand ändern.\n\n"
        "/**\n * Innere Öffnung der Kartenrahmen: Lage als Anteil des Rahmenbildes (oben, rechts, unten, links) und die sichere\n"
        " * Textfläche als Anteil der Öffnung (Abstand unten zur Höhe, seitlich zur Breite), damit Medaillon und Ecken unten\n"
        " * keinen Text verdecken. `overlay` ist der Rahmen mit ausgeschnittener Öffnung, `mask` die Form der Öffnung.\n */\n"
        "export interface CardFrameOpening {\n  overlay: string;\n  mask: string;\n"
        "  inset: { top: number; right: number; bottom: number; left: number };\n  textBottom: number;\n  textSide: number;\n}\n\n"
        "export const CARD_FRAME_OPENINGS: Readonly<Record<\"adventure\" | \"fate\", CardFrameOpening>> = {\n"
        + ",\n".join(entries) + "\n};\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
