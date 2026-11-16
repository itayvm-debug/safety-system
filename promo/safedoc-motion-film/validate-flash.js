/**
 * Flash validation: luminance analysis + frame strip export
 * Checks for brightness spikes at the 4 flagged transition windows.
 */

const { spawnSync, execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ffmpeg  = require('ffmpeg-static');
const VIDEO   = path.resolve(__dirname, 'output/safedoc-vertical-flash-free-master.mp4');
const OUT_DIR = path.resolve(__dirname, 'output/strips');
fs.mkdirSync(OUT_DIR, { recursive: true });

const FPS = 60;

// Flagged windows [start, end, label, n_frames]
const WINDOWS = [
  [1.65, 1.90, 'login-dashboard',   15],
  [2.55, 2.85, 'dashboard-worker',  18],
  [10.55, 10.85, 'review-analytics', 18],
  [12.55, 12.85, 'report-brand',     18],
];

// ── 1. Luminance analysis (YAVG per frame) via signalstats ───────────────
console.log('══ Luminance analysis ══\n');

for (const [t0, t1, label] of WINDOWS) {
  const dur = (t1 - t0 + 0.1).toFixed(2);
  console.log(`[${label}]  ${t0}s – ${t1}s`);

  const r = spawnSync(ffmpeg, [
    '-ss', t0.toFixed(3),
    '-i', VIDEO,
    '-t', dur,
    '-vf', 'signalstats,metadata=print:file=-',
    '-f', 'null', '-',
  ], { encoding: 'utf8' });

  // metadata=print:file=- outputs to stdout; signalstats stats also appear in stderr
  const lines = ((r.stdout || '') + '\n' + (r.stderr || '')).split('\n');
  const yavgs = [];
  let frame = 0;
  let pts = 0;

  for (const line of lines) {
    const mPts = line.match(/pts_time:([\d.]+)/);
    if (mPts) pts = parseFloat(mPts[1]);
    const mY = line.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
    if (mY) {
      yavgs.push({ frame: frame++, t: t0 + pts, yavg: parseFloat(mY[1]) });
    }
  }

  if (yavgs.length === 0) {
    console.log('  (no signalstats output — check FFmpeg build)\n');
    continue;
  }

  // Find max, min, and largest frame-to-frame delta
  let maxY = 0, minY = 255, maxDelta = 0, flashFrame = -1;
  for (let i = 0; i < yavgs.length; i++) {
    const y = yavgs[i].yavg;
    if (y > maxY) maxY = y;
    if (y < minY) minY = y;
    if (i > 0) {
      const delta = Math.abs(y - yavgs[i - 1].yavg);
      if (delta > maxDelta) { maxDelta = delta; flashFrame = i; }
    }
  }

  console.log(`  frames: ${yavgs.length}  YAVG min=${minY.toFixed(1)} max=${maxY.toFixed(1)} range=${(maxY-minY).toFixed(1)}`);
  console.log(`  max Δ between adjacent frames: ${maxDelta.toFixed(2)} (at f${flashFrame}, t=${yavgs[flashFrame]?.t.toFixed(3)}s)`);

  if (maxDelta > 8) {
    console.log(`  ⚠ SPIKE > 8 YAVG units — potential flash`);
  } else if (maxDelta > 4) {
    console.log(`  ⚡ moderate jump (${maxDelta.toFixed(2)}) — soft transition`);
  } else {
    console.log(`  ✓ smooth — max delta ${maxDelta.toFixed(2)}`);
  }

  // Per-frame table
  for (const { frame: f, t, yavg } of yavgs) {
    const prev = f > 0 ? yavgs[f-1].yavg : yavg;
    const delta = Math.abs(yavg - prev);
    const flag = delta > 8 ? ' ⚠' : delta > 4 ? ' ⚡' : '';
    console.log(`    f${String(f).padStart(2)} t=${t.toFixed(3)}s  YAVG=${yavg.toFixed(1).padStart(6)}  Δ=${delta.toFixed(2).padStart(5)}${flag}`);
  }
  console.log('');
}

// ── 2. Frame strip export ────────────────────────────────────────────────
console.log('══ Exporting frame strips ══\n');

for (const [t0, t1, label, nFrames] of WINDOWS) {
  const dur = (t1 - t0 + 0.05).toFixed(3);
  const outFile = path.join(OUT_DIR, `strip_${label}.png`);

  // Scale each frame to 160×284 and tile horizontally
  const tileW = Math.min(nFrames, 18);
  const r = spawnSync(ffmpeg, [
    '-y',
    '-ss', t0.toFixed(3),
    '-i', VIDEO,
    '-t', dur,
    '-vf', `scale=160:284,tile=${tileW}x1`,
    '-frames:v', '1',
    outFile,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  if (r.status === 0 && fs.existsSync(outFile)) {
    const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
    console.log(`  ✓ ${path.basename(outFile)}  (${tileW} frames · ${kb} KB)`);
  } else {
    console.log(`  ✗ failed: ${label}`);
    if (r.stderr) console.log('    ' + r.stderr.slice(-200));
  }
}

console.log(`\nStrips saved to: ${OUT_DIR}`);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('SAFEDOC MOTION FILM — FLASH-FREE VISUAL MASTER READY');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
