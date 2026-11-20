"""
Checks that the signature block of signed documents lands on blank space on the last page of
every template, and records the result for lib/briefings/__tests__/signature-zone.test.ts:
  - safety briefing:  lib/briefings/system-briefing.ts (SIGNATURE_BLOCK_BOTTOM_PT)
  - height ban:       lib/documents/signature-block.ts (HEIGHT_BAN_BLOCK_AREA)

Owner report 2026-11-20: on the Russian briefing the signature block hid part of the SafeDoc logo;
the height-ban form had the same pattern over its page number.

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
OUT = os.path.join(ROOT, 'lib', 'briefings', 'signature-zone-check.json')
MARGIN = 30


def read(path):
    return open(os.path.join(ROOT, path), encoding='utf-8').read()


briefing_bottom = int(re.search(r'SIGNATURE_BLOCK_BOTTOM_PT = (\d+)', read('lib/briefings/system-briefing.ts')).group(1))
hb = re.search(r'HEIGHT_BAN_BLOCK_AREA: BlockArea = \{ bottom: (\d+), maxHeight: (\d+) \}', read('lib/documents/signature-block.ts'))
hb_bottom, hb_max = int(hb.group(1)), int(hb.group(2))

# (folder, key prefix, canvas size, bottom, max height or None)
SETS = [
    ('briefing-templates', '', (900, 200), briefing_bottom, None),
    ('height-ban-templates', 'height-ban/', (900, 270), hb_bottom, hb_max),
]


def place(page_w, img_w, img_h, bottom, max_h):
    """Same as placeSignatureBlock in lib/documents/signature-block.ts (the briefing uses no max)."""
    width = page_w - 2 * MARGIN
    height = width * img_h / img_w
    if max_h is not None and height > max_h:
        height = max_h
        width = height * img_w / img_h
    return (page_w - width) / 2, bottom, width, height


result = {}
for folder, prefix, (cw, ch), bottom, max_h in SETS:
    base = os.path.join(ROOT, 'public', folder)
    for f in sorted(glob.glob(os.path.join(base, '**', '*.pdf'), recursive=True)):
        name = prefix + os.path.relpath(f, base).replace(os.sep, '/')
        page = fitz.open(f)[-1]
        w, h = page.rect.width, page.rect.height
        x, y, bw, bh = place(w, cw, ch, bottom, max_h)
        zone = fitz.Rect(x, h - (y + bh), x + bw, h - y)  # top-left origin
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=zone)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        non_white = sum(1 for yy in range(img.height) for xx in range(img.width) if min(img.getpixel((xx, yy))) < 235)
        result[name] = {
            'bytes': os.path.getsize(f),
            'zoneBottomPt': bottom,
            'zoneTopPt': round(y + bh, 1),
            'zoneWidthPt': round(bw, 1),
            'nonWhitePixels': non_white,
        }
        print(f'{name:40s} zone {y:.0f}-{y + bh:.0f}pt, width {bw:.0f}pt: {"blank" if non_white == 0 else f"{non_white} non-white pixels"}')

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(result, fh, indent=2, ensure_ascii=False)
    fh.write('\n')
print('written', os.path.relpath(OUT, ROOT))
