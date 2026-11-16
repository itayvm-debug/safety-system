/**
 * SafeDoc Motion Film — Render Pipeline
 * Puppeteer → 960 PNG frames → FFmpeg MP4
 * 1440×1440 · 60fps · 16s
 */

const puppeteer  = require('puppeteer');
const ffmpegPath = require('ffmpeg-static');
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const SRC_HTML  = path.resolve(__dirname, 'src/index.html');
const FRAMES_DIR = path.resolve(__dirname, 'output/frames');
const OUTPUT_MP4 = path.resolve(__dirname, 'output/safedoc-motion-film.mp4');

const FPS      = 60;
const DURATION = 16;         // seconds
const WIDTH    = 1440;
const HEIGHT   = 1440;
const N_FRAMES = FPS * DURATION;   // 960

async function render() {
  // ── Prep output directory ─────────────────────────
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  // ── Launch Puppeteer ──────────────────────────────
  console.log('Launching headless Chrome…');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--window-size=${WIDTH},${HEIGHT}`,
      '--force-device-scale-factor=1',
      '--disable-web-security',
      '--allow-file-access-from-files',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

  // Load the animation page
  console.log(`Loading ${SRC_HTML}…`);
  await page.goto(`file:///${SRC_HTML.replace(/\\/g, '/')}`, {
    waitUntil: 'networkidle0',
    timeout: 30000,
  });

  // Wait for fonts to render
  await page.evaluate(() => document.fonts.ready);

  // Hide controls
  await page.evaluate(() => {
    const c = document.getElementById('controls');
    if (c) c.style.display = 'none';
    // Scale stage to exactly 1440×1440 (fill the viewport)
    const sw = document.getElementById('stage-wrap');
    if (sw) sw.style.transform = 'scale(1)';
    document.body.style.background = '#F9FAFB';
  });

  // ── Capture frames ────────────────────────────────
  console.log(`Capturing ${N_FRAMES} frames…`);
  const t0 = Date.now();

  for (let f = 0; f < N_FRAMES; f++) {
    const t = f / FPS;
    const framePath = path.join(FRAMES_DIR, `frame_${String(f).padStart(4, '0')}.png`);

    await page.evaluate((time) => window.seek(time), t);

    // Clip to the stage only (top-left of the page)
    await page.screenshot({
      path: framePath,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      type: 'png',
    });

    if (f % 60 === 0) {
      const pct  = ((f / N_FRAMES) * 100).toFixed(0);
      const beat = Math.floor(t / 0.5) + 1;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`  ${pct}% — frame ${f}/${N_FRAMES} (B${String(beat).padStart(2,'0')} · ${t.toFixed(2)}s) [${secs}s elapsed]\n`);
    }
  }

  await browser.close();
  console.log(`All ${N_FRAMES} frames captured in ${((Date.now()-t0)/1000).toFixed(1)}s`);

  // ── Encode MP4 with FFmpeg ────────────────────────
  console.log('\nEncoding MP4…');
  console.log(`FFmpeg path: ${ffmpegPath}`);

  const ffArgs = [
    '-y',
    '-framerate', String(FPS),
    '-i', path.join(FRAMES_DIR, 'frame_%04d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '16',
    '-preset', 'slow',
    '-vf', 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',
    '-movflags', '+faststart',
    OUTPUT_MP4,
  ];

  const result = spawnSync(ffmpegPath, ffArgs, { stdio: 'inherit' });

  if (result.status !== 0) {
    // Retry without motion interpolation (minterpolate can be slow)
    console.log('\nRetrying without minterpolate…');
    const ffArgs2 = [
      '-y',
      '-framerate', String(FPS),
      '-i', path.join(FRAMES_DIR, 'frame_%04d.png'),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-crf', '16',
      '-preset', 'slow',
      '-movflags', '+faststart',
      OUTPUT_MP4,
    ];
    const r2 = spawnSync(ffmpegPath, ffArgs2, { stdio: 'inherit' });
    if (r2.status !== 0) {
      throw new Error(`FFmpeg encode failed with exit code ${r2.status}`);
    }
  }

  const size = (fs.statSync(OUTPUT_MP4).size / 1024 / 1024).toFixed(1);
  console.log(`\nDone! Output: ${OUTPUT_MP4} (${size} MB)`);
}

render().catch(err => {
  console.error('Render failed:', err);
  process.exit(1);
});
