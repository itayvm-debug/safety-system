"""
Checks that the briefing signature block (lib/briefings/system-briefing.ts) lands on blank space
on the last page of every briefing template, and records the result for the unit test
lib/briefings/__tests__/signature-zone.test.ts.

Owner report 2026-11-20: on the Russian template the signature block hid part of the SafeDoc logo.

Run after adding or changing a template (like scripts/render-template-pages.py):
    python -I scripts/check-briefing-signature-zone.py
"""
import glob
import json
import os
import re

import fitz  # PyMuPDF
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATES = os.path.join(ROOT, 'public', 'briefing-templates')
OUT = os.path.join(ROOT, 'lib', 'briefings', 'signature-zone-check.json')
TS = os.path.join(ROOT, 'lib', 'briefings', 'system-briefing.ts')

# Same geometry as generateBriefingPDF: margin 30pt each side, canvas 900x200 scaled to the width
MARGIN = 30
CANVAS_W, CANVAS_H = 900, 200
bottom_pt = int(re.search(r'SIGNATURE_BLOCK_BOTTOM_PT = (\d+)', open(TS, encoding='utf-8').read()).group(1))

result = {}
for f in sorted(glob.glob(os.path.join(TEMPLATES, '**', '*.pdf'), recursive=True)):
    name = os.path.relpath(f, TEMPLATES).replace(os.sep, '/')
    page = fitz.open(f)[-1]
    w, h = page.rect.width, page.rect.height
    draw_h = (w - 2 * MARGIN) * CANVAS_H / CANVAS_W
    zone = fitz.Rect(MARGIN, h - (bottom_pt + draw_h), w - MARGIN, h - bottom_pt)  # top-left origin
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=zone)
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    non_white = sum(1 for y in range(img.height) for x in range(img.width) if min(img.getpixel((x, y))) < 235)
    result[name] = {
        'bytes': os.path.getsize(f),
        'zoneBottomPt': bottom_pt,
        'zoneTopPt': round(bottom_pt + draw_h, 1),
        'nonWhitePixels': non_white,
    }
    print(f'{name:40s} zone {bottom_pt}-{bottom_pt + draw_h:.0f}pt from bottom: {"blank" if non_white == 0 else f"{non_white} non-white pixels"}')

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(result, fh, indent=2, ensure_ascii=False)
    fh.write('\n')
print('written', os.path.relpath(OUT, ROOT))
