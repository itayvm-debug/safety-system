// generate-icons.mjs — PWA icon generator using sharp
// Run: node scripts/generate-icons.mjs

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SRC = path.join(root, 'COMPANY LOGO - VALDMAN.png');
const OUT = path.join(root, 'public', 'icons');

const ORANGE = { r: 234, g: 88, b: 12, alpha: 1 }; // #ea580c

async function make({ size, file, padding = 0, bg = { r: 255, g: 255, b: 255, alpha: 1 } }) {
  const inner = Math.round(size * (1 - padding * 2));

  const resized = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: bg },
  })
    .composite([{ input: resized, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, file));

  console.log(`✓ ${file} (${size}×${size})`);
}

await make({ size: 192,  file: 'icon-192.png',          padding: 0.08, bg: { r: 255, g: 255, b: 255, alpha: 1 } });
await make({ size: 512,  file: 'icon-512.png',          padding: 0.08, bg: { r: 255, g: 255, b: 255, alpha: 1 } });
await make({ size: 512,  file: 'icon-512-maskable.png', padding: 0.16, bg: ORANGE });
await make({ size: 180,  file: 'apple-touch-icon.png',  padding: 0.08, bg: { r: 255, g: 255, b: 255, alpha: 1 } });

console.log('\nכל האייקונים נוצרו בהצלחה ב-public/icons/');
