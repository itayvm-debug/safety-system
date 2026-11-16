/**
 * SafeDoc Motion Film — Full Export Pipeline
 * Muxes approved visual master with generated audio mix.
 * Produces: master, 1080×1920 delivery, WhatsApp, loop, muted variants.
 */

const ffmpegPath = require('ffmpeg-static');
const { spawnSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ROOT    = path.resolve(__dirname, '..');
const AUDIO   = __dirname;
const OUTPUT  = path.resolve(ROOT, 'output');
const VIDEO_SRC = path.join(OUTPUT, 'safedoc-vertical-flash-free-master.mp4');

// Audio stems
const AUDIO_MIX  = path.join(AUDIO, 'mix_master.wav');
const AUDIO_LOOP = path.join(AUDIO, 'mix_loop.wav');

fs.mkdirSync(OUTPUT, { recursive: true });

// ── helper ────────────────────────────────────────────────────────────────

function ff(args, label) {
  console.log(`\n[${label}]`);
  console.log('  ffmpeg ' + args.join(' '));
  const r = spawnSync(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`  FAILED (exit ${r.status})`);
    console.error(r.stderr?.slice(-600));
    process.exit(1);
  }
  const outFile = args[args.length - 1];
  if (fs.existsSync(outFile)) {
    const mb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
    console.log(`  OK  →  ${path.basename(outFile)}  (${mb} MB)`);
  }
}

// ── 1. MASTER 1440×2560 with audio (high bitrate) ────────────────────────

const MASTER = path.join(OUTPUT, 'safedoc-vertical-final-master.mp4');
ff([
  '-y',
  '-i', VIDEO_SRC,
  '-i', AUDIO_MIX,
  '-c:v', 'libx264',
  '-crf', '18',
  '-preset', 'slow',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-c:a', 'aac',
  '-b:a', '256k',
  '-ar', '48000',
  '-ac', '2',
  '-shortest',
  MASTER,
], 'MASTER 1440×2560');

// ── 2. DELIVERY 1080×1920 (main distribution) ────────────────────────────

const DELIVERY = path.join(OUTPUT, 'safedoc-vertical-1080x1920.mp4');
ff([
  '-y',
  '-i', VIDEO_SRC,
  '-i', AUDIO_MIX,
  '-vf', 'scale=1080:1920:flags=lanczos',
  '-c:v', 'libx264',
  '-crf', '20',
  '-preset', 'slow',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-c:a', 'aac',
  '-b:a', '256k',
  '-ar', '48000',
  '-ac', '2',
  '-shortest',
  DELIVERY,
], 'DELIVERY 1080×1920');

// ── 3. WHATSAPP (smaller file) ────────────────────────────────────────────

const WHATSAPP = path.join(OUTPUT, 'safedoc-vertical-whatsapp.mp4');
ff([
  '-y',
  '-i', VIDEO_SRC,
  '-i', AUDIO_MIX,
  '-vf', 'scale=1080:1920:flags=lanczos',
  '-c:v', 'libx264',
  '-crf', '26',
  '-preset', 'slow',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-profile:v', 'high',
  '-level', '4.1',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-ar', '44100',
  '-ac', '2',
  '-shortest',
  WHATSAPP,
], 'WHATSAPP 1080×1920');

// ── 4. LOOP 1080×1920 with seamless audio ────────────────────────────────

const LOOP = path.join(OUTPUT, 'safedoc-vertical-loop.mp4');
ff([
  '-y',
  '-i', VIDEO_SRC,
  '-i', AUDIO_LOOP,
  '-vf', 'scale=1080:1920:flags=lanczos',
  '-c:v', 'libx264',
  '-crf', '20',
  '-preset', 'slow',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-c:a', 'aac',
  '-b:a', '256k',
  '-ar', '48000',
  '-ac', '2',
  '-shortest',
  LOOP,
], 'LOOP 1080×1920');

// ── 5. MUTED (no audio) ──────────────────────────────────────────────────

const MUTED = path.join(OUTPUT, 'safedoc-vertical-muted.mp4');
ff([
  '-y',
  '-i', VIDEO_SRC,
  '-vf', 'scale=1080:1920:flags=lanczos',
  '-c:v', 'libx264',
  '-crf', '20',
  '-preset', 'slow',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-an',
  MUTED,
], 'MUTED 1080×1920');

// ── 6. QA: ffprobe all outputs ────────────────────────────────────────────

console.log('\n\n══ QA REPORT ══\n');

const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
// ffprobe might not exist as a separate binary with ffmpeg-static; use ffmpeg -i

const files = [
  { path: MASTER,   label: 'MASTER',   expectAudio: true,  w: 1440, h: 2560 },
  { path: DELIVERY, label: 'DELIVERY', expectAudio: true,  w: 1080, h: 1920 },
  { path: WHATSAPP, label: 'WHATSAPP', expectAudio: true,  w: 1080, h: 1920 },
  { path: LOOP,     label: 'LOOP',     expectAudio: true,  w: 1080, h: 1920 },
  { path: MUTED,    label: 'MUTED',    expectAudio: false, w: 1080, h: 1920 },
];

for (const f of files) {
  if (!fs.existsSync(f.path)) {
    console.log(`  ✗ ${f.label}: FILE MISSING`);
    continue;
  }
  const size = (fs.statSync(f.path).size / 1024 / 1024).toFixed(1);
  const r = spawnSync(ffmpegPath, ['-i', f.path], { encoding: 'utf8' });
  const info = (r.stderr || '');

  const vidMatch = info.match(/(\d{3,4})x(\d{3,4})/);
  const fpsMatch = info.match(/([\d.]+) fps/);
  const durMatch = info.match(/Duration: (\d+:\d+:[\d.]+)/);
  const audMatch = info.match(/Audio: (\w+).*([\d.]+ Hz).*(stereo|mono)/);

  const w = vidMatch ? vidMatch[1] : '?';
  const h = vidMatch ? vidMatch[2] : '?';
  const fps = fpsMatch ? fpsMatch[1] : '?';
  const dur = durMatch ? durMatch[1] : '?';
  const hasAudio = info.includes('Audio:');

  const wOK  = parseInt(w) === f.w;
  const hOK  = parseInt(h) === f.h;
  const fOK  = parseFloat(fps) >= 59;
  const aOK  = f.expectAudio ? hasAudio : !hasAudio;
  const ok   = wOK && hOK && fOK && aOK;

  const audioStr = hasAudio && audMatch
    ? `${audMatch[1]} ${audMatch[2]} ${audMatch[3]}`
    : (hasAudio ? 'audio:yes' : 'no audio');

  console.log(`  ${ok ? '✓' : '✗'} ${f.label.padEnd(9)} ${w}×${h} ${fps}fps  dur:${dur}  ${audioStr}  size:${size}MB`);
  if (!wOK || !hOK) console.log(`    ⚠ expected ${f.w}×${f.h}`);
  if (!fOK)         console.log(`    ⚠ expected ≥60fps`);
  if (!aOK)         console.log(`    ⚠ audio expectation failed`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('SAFEDOC MOTION FILM — EXPORT COMPLETE');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
