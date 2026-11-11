"""Génère les icônes provisoires de Lecture sucrée (assets/*.png).

Usage : python scripts/make-icons.py
Dessin 100 % local (Pillow), aucune ressource externe : un livre ouvert stylisé
couleur caramel sur fond nuit. Icône définitive prévue au lot UI.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

BG = (11, 10, 15, 255)
ACCENT = (224, 164, 88, 255)
CREAM = (244, 238, 228, 255)
OUT = Path(__file__).resolve().parent.parent / "assets"


def book(size: int, transparent_bg: bool, scale: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0) if transparent_bg else BG)
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    c = size / 2
    r = size * 0.30 * scale
    gd.ellipse([c - r, c - r, c + r, c + r], fill=(224, 164, 88, 70))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(size * 0.06)))

    d = ImageDraw.Draw(img)
    w = size * 0.56 * scale
    h = size * 0.36 * scale
    top = c - h / 2
    left = c - w / 2
    spine = size * 0.012 * scale
    # Deux pages incurvées
    for side in (-1, 1):
        x0 = c + side * spine
        x1 = c + side * (w / 2)
        pts = [
            (x0, top + h * 0.10),
            ((x0 + x1) / 2, top),
            (x1, top + h * 0.06),
            (x1, top + h),
            ((x0 + x1) / 2, top + h * 0.92),
            (x0, top + h * 1.02),
        ]
        d.polygon(pts, fill=CREAM)
        # Lignes de texte
        for i in range(4):
            y = top + h * (0.30 + i * 0.16)
            xa = x0 + side * w * 0.07
            xb = x1 - side * w * 0.07
            d.line([(min(xa, xb), y), (max(xa, xb), y)], fill=(201, 192, 179, 255), width=max(2, int(size * 0.008)))
    # Marque-page caramel
    bx = c + w * 0.22
    d.polygon(
        [(bx, top + h * 0.02), (bx + w * 0.08, top + h * 0.02), (bx + w * 0.08, top + h * 0.62), (bx + w * 0.04, top + h * 0.52), (bx, top + h * 0.62)],
        fill=ACCENT,
    )
    d.line([(c, top + h * 0.08), (c, top + h * 1.02)], fill=ACCENT, width=max(2, int(spine * 2)))
    _ = left
    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    book(1024, False, 1.0).convert("RGB").save(OUT / "icon.png", optimize=True)
    book(1024, True, 0.78).save(OUT / "adaptive-icon.png", optimize=True)
    print("icônes écrites dans", OUT)


if __name__ == "__main__":
    main()
