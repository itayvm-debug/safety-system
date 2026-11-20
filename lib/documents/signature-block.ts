/**
 * Where a signed-document block (worker details + signature, rendered as an image) goes on the
 * template's last page. Owner report 2026-11-20: the block was drawn 30pt from the bottom with a
 * white background and hid the template's page footer (logo / page number).
 *
 * The block sits `bottom` points from the bottom of the page and is scaled down proportionally
 * (never stretched) when it would be taller than `maxHeight`, so it stays in the blank space
 * between the page footer and the body text. Centred horizontally.
 */
export interface BlockArea {
  bottom: number;
  maxHeight: number;
  margin?: number;
}

export interface BlockPlacement { x: number; y: number; width: number; height: number }

export function placeSignatureBlock(pageWidth: number, imageW: number, imageH: number, area: BlockArea): BlockPlacement {
  const margin = area.margin ?? 30;
  let width = pageWidth - margin * 2;
  let height = width * (imageH / imageW);
  if (height > area.maxHeight) {
    height = area.maxHeight;
    width = height * (imageW / imageH);
  }
  return { x: (pageWidth - width) / 2, y: area.bottom, width, height };
}

/**
 * Height-ban templates (public/height-ban-templates, one page): page number up to 45pt from the
 * bottom, body text ends 196pt or more from the bottom (Thai). Checked for every template by
 * scripts/check-briefing-signature-zone.py.
 */
export const HEIGHT_BAN_BLOCK_AREA: BlockArea = { bottom: 52, maxHeight: 138 };
