/**
 * Render cover images from the animation at the brand seal beat.
 * Outputs: safedoc-cover-1080x1920.png + safedoc-cover-1080x1350.png
 */

const puppeteer  = require('puppeteer');
const ffmpegPath = require('ffmpeg-static');
const { spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const SRC_HTML = path.resolve(__dirname, 'src/index.html');
const OUTPUT   = path.resolve(__dirname, 'output');
fs.mkdirSync(OUTPUT, { recursive: true });

// Use B29 = sealHero(1,0) at t=14.25s (mid-beat, clean brand state)
// The seal hero shows: SafeDoc logo + "כל הבטיחות. במקום אחד."
const COVER_T = 14.75;   // sealHero(2,0) — fuller brand state

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1440,2560',
      '--force-device-scale-factor=1',
      '--disable-web-security',
      '--allow-file-access-from-files',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 2560, deviceScaleFactor: 1 });
  await page.goto(`file:///${SRC_HTML.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);

  await page.evaluate(() => {
    const c = document.getElementById('controls');
    if (c) c.style.display = 'none';
    const sw = document.getElementById('stage-wrap');
    if (sw) sw.style.transform = 'scale(1)';
    document.body.style.background = '#F9FAFB';
    document.body.style.alignItems = 'flex-start';
    document.body.style.justifyContent = 'flex-start';
  });

  await page.evaluate((t) => window.seek(t), COVER_T);
  // Extra settle for fonts/layout
  await new Promise(r => setTimeout(r, 200));

  // Capture full 1440×2560
  const RAW = path.join(OUTPUT, 'cover-raw-1440x2560.png');
  await page.screenshot({ path: RAW, clip: { x: 0, y: 0, width: 1440, height: 2560 }, type: 'png' });
  console.log(`Captured raw cover at t=${COVER_T}s`);

  await browser.close();

  // ── scale to 1080×1920 ──────────────────────────────────────────────────
  const OUT_1920 = path.join(OUTPUT, 'safedoc-cover-1080x1920.png');
  const r1 = spawnSync(ffmpegPath, [
    '-y', '-i', RAW,
    '-vf', 'scale=1080:1920:flags=lanczos',
    OUT_1920,
  ], { encoding: 'utf8' });
  if (r1.status === 0) {
    const kb = (fs.statSync(OUT_1920).size / 1024).toFixed(0);
    console.log(`✓ safedoc-cover-1080x1920.png  (${kb} KB)`);
  } else {
    console.error('✗ 1920 scale failed:', r1.stderr?.slice(-300));
  }

  // ── crop + scale to 1080×1350 (4:5 feed ratio) ─────────────────────────
  // Center crop from the 1440×2560 source: take center 1440×1800 → scale to 1080×1350
  const OUT_1350 = path.join(OUTPUT, 'safedoc-cover-1080x1350.png');
  const r2 = spawnSync(ffmpegPath, [
    '-y', '-i', RAW,
    '-vf', 'crop=1440:1800:0:380,scale=1080:1350:flags=lanczos',
    OUT_1350,
  ], { encoding: 'utf8' });
  if (r2.status === 0) {
    const kb = (fs.statSync(OUT_1350).size / 1024).toFixed(0);
    console.log(`✓ safedoc-cover-1080x1350.png  (${kb} KB)`);
  } else {
    console.error('✗ 1350 crop failed:', r2.stderr?.slice(-300));
  }

  // Clean up raw
  fs.unlinkSync(RAW);
  console.log('\nCover images ready:');
  console.log(`  output/safedoc-cover-1080x1920.png`);
  console.log(`  output/safedoc-cover-1080x1350.png`);
}

run().catch(err => { console.error('Cover render failed:', err); process.exit(1); });
