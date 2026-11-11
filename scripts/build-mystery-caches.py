"""Authoring-only extraction of paired cache sprites; requires Pillow.

Preserve generated pixels/alpha; register the lower body and foot baseline in
both states so opening a lid cannot resize or slide the entire box.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WORLDS = ["obsidian", "wilds", "league", "puppy", "kitten", "chaos", "jelly"]
WIDTH, HEIGHT, FOOT = 300, 336, 312


def build():
    out = ROOT / "apps/mobile/public/assets/worlds/caches"
    out.mkdir(parents=True, exist_ok=True)
    for world in WORLDS:
        source = Image.open(ROOT / f"design/mystery-caches-v1/{world}.png").convert("RGBA")
        frames = []
        for index in range(2):
            frame = source.crop((round(index * source.width / 2), 0,
                                 round((index + 1) * source.width / 2), source.height))
            alpha = frame.getchannel("A").point(lambda a: 255 if a > 160 else 0)
            bounds = alpha.getbbox()
            if not bounds:
                raise ValueError(f"Empty cache {world}/{index}")
            frames.append((frame, alpha, bounds))
        body_band = round((frames[0][2][3] - frames[0][2][1]) * .38)
        planned = []
        for frame, alpha, bounds in frames:
            body = alpha.crop((0, bounds[3] - body_band, frame.width, bounds[3])).getbbox()
            if body is None:
                raise ValueError(f"Missing cache base {world}")
            center = (body[0] + body[2]) / 2
            scale = 210 / (body[2] - body[0])
            planned.append((frame, bounds, center, scale))
        fit = min(1, *[min(280 / ((b[2]-b[0])*s), 288 / ((b[3]-b[1])*s))
                       for _, b, _, s in planned])
        pair = Image.new("RGBA", (WIDTH * 2, HEIGHT))
        for index, (frame, bounds, center, scale) in enumerate(planned):
            scale *= fit
            crop = frame.crop(bounds)
            size = (round(crop.width * scale), round(crop.height * scale))
            crop = crop.resize(size, Image.Resampling.LANCZOS)
            x = round(WIDTH / 2 + (bounds[0] - center) * scale)
            pair.alpha_composite(crop, (index * WIDTH + x, FOOT - size[1]))
        filename = out / f"{world}-v1.webp"
        temporary = filename.with_suffix(".pending")
        pair.save(temporary, "WEBP", quality=93, method=4)
        temporary.replace(filename)


if __name__ == "__main__":
    build()
