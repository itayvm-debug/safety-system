/**
 * Signature geometry, shared by the signature pad and the PDF footers.
 *
 * The pad was enlarged (owner, 2026-11-19: "the signing box was too narrow"). A bigger pad has
 * more empty margin, and the footers used to stretch the whole pad into a fixed 220×80 box,
 * distorting the signature. Now the pad exports only the inked area, and the footer fits it
 * into its box keeping the aspect ratio.
 */

export interface Rect { x: number; y: number; w: number; h: number }

/** Bounding box of non-transparent pixels in RGBA data, with `pad` px margin; null when blank. */
export function inkBounds(data: Uint8ClampedArray, width: number, height: number, pad = 0): Rect | null {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const x = Math.max(0, minX - pad), y = Math.max(0, minY - pad);
  return { x, y, w: Math.min(width, maxX + pad + 1) - x, h: Math.min(height, maxY + pad + 1) - y };
}

/** Largest rect with the source's aspect ratio that fits in the box, centred in it. */
export function fitInBox(srcW: number, srcH: number, box: Rect): Rect {
  if (srcW <= 0 || srcH <= 0) return { ...box };
  const scale = Math.min(box.w / srcW, box.h / srcH);
  const w = srcW * scale, h = srcH * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}
