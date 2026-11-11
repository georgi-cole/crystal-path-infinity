"""Authoring-only atlas extraction. Requires Pillow; no game/CI runtime dependency.

Each master is a 3-column/6-row transparent sheet. Columns are calm/happy/worried;
rows are the six gear IDs below. A common row scale preserves pose proportions,
feet align to one registration, and umbrellas get headroom without shrinking bodies.
No gear is pasted onto a character here: complete equipped bodies come from masters.
"""
from pathlib import Path
import json
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MASTERS = ROOT / "design/equipped-characters-v2"
OUTPUT = ROOT / "apps/mobile/public/assets/worlds/equipped"
GEAR = ["umbrella", "sunshades", "sun-balm", "frost-runners", "storm-boots", "trail-scarf"]
WORLDS = ["obsidian", "wilds", "league", "puppy", "kitten", "chaos", "jelly"]
CELL = 384
FOOT = round(CELL * 156 / 160)
# Authored row gutters are measured from each frozen master, not assumed equal.
ROW_CUTS = {
    "puppy": [0, 304, 562, 821, 1117, 1416, 1774],
    "obsidian": [0, 300, 586, 888, 1189, 1485, 1774],
    "jelly": [0, 316, 597, 889, 1187, 1482, 1774],
    "chaos": [0, 297, 580, 876, 1181, 1475, 1774],
    "wilds": [0, 300, 594, 891, 1188, 1484, 1774],
    "league": [0, 310, 592, 885, 1185, 1480, 1774],
    "kitten": [0, 302, 546, 791, 1049, 1298, 1536],
}


def isolate_cat_cell(cell):
    # Adjacent cat rows overlap vertically at different x coordinates. Extract
    # the connected subject instead of clipping off paws/tails at a grid line.
    width, height = cell.size
    alpha = cell.getchannel("A")
    pixels = bytearray(alpha.point(lambda a: 1 if a > 100 else 0).tobytes())
    components = []
    for origin in range(len(pixels)):
        if not pixels[origin]:
            continue
        pixels[origin] = 0
        stack, points = [origin], []
        while stack:
            pos = stack.pop()
            points.append(pos)
            x, y = pos % width, pos // width
            for nxt in ((pos - 1 if x else -1), (pos + 1 if x + 1 < width else -1),
                        pos - width, pos + width):
                if 0 <= nxt < len(pixels) and pixels[nxt]:
                    pixels[nxt] = 0
                    stack.append(nxt)
        components.append(points)
    largest = max(map(len, components))
    keep = bytearray(width * height)
    for points in components:
        if len(points) >= largest * .05:
            for pos in points:
                keep[pos] = 255
    mask = Image.frombytes("L", cell.size, bytes(keep)).filter(ImageFilter.MaxFilter(7))
    from PIL import ImageChops
    result = cell.copy()
    result.putalpha(ImageChops.multiply(alpha, mask))
    return result


def build():
    manifest = {"version": 2, "cell": CELL, "frames": 3, "foot": FOOT, "assets": []}
    for world in WORLDS:
        sheet = Image.open(MASTERS / f"{world}.png").convert("RGBA")
        width, height = sheet.size
        for row, gear in enumerate(GEAR):
            sprites = []
            for col in range(3):
                top, bottom = ROW_CUTS[world][row:row + 2]
                overlap = 12 if world == "kitten" else 0
                cell = sheet.crop((round(col * width / 3), max(0, top - overlap),
                                   round((col + 1) * width / 3), min(height, bottom + overlap)))
                if world == "kitten":
                    cell = isolate_cat_cell(cell)
                # Ignore faint edge glow solely when measuring the subject bounds.
                # Retain the original alpha inside the cropped sprite.
                bounds = cell.getchannel("A").point(lambda a: 255 if a > 160 else 0).getbbox()
                if bounds is None:
                    raise ValueError(f"Empty equipped sprite: {world}/{gear}/{col}")
                sprites.append(cell.crop(bounds))
            target_height = CELL * (128 if gear == "umbrella" else 96) / 160
            scale = min(target_height / max(s.height for s in sprites),
                        (CELL - 12) / max(s.width for s in sprites))
            strip = Image.new("RGBA", (CELL * 3, CELL))
            for col, sprite in enumerate(sprites):
                size = (max(1, round(sprite.width * scale)), max(1, round(sprite.height * scale)))
                sprite = sprite.resize(size, Image.Resampling.LANCZOS)
                strip.alpha_composite(sprite, (col * CELL + (CELL - size[0]) // 2, FOOT - size[1]))
            folder = OUTPUT / world
            folder.mkdir(parents=True, exist_ok=True)
            filename = folder / f"{gear}-v2.webp"
            temporary = filename.with_suffix(".pending")
            strip.save(temporary, "WEBP", quality=92, method=4)
            temporary.replace(filename)
            manifest["assets"].append({"world": world, "gear": gear,
                                       "path": str(filename.relative_to(ROOT / "apps/mobile/public")).replace("\\", "/")})
    (OUTPUT / "manifest-v2.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
