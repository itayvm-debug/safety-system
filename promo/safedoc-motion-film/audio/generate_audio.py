"""
SafeDoc Motion Film — Audio Generation Pipeline
Generates: reference music track + all UI SFX at 48 kHz stereo
All audio is procedurally generated — no third-party samples, no licensing concerns.
"""

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, filtfilt, sosfilt, butter as bfilter
import os, json

SR = 48000
BPM = 120
BEAT_S  = 60.0 / BPM          # 0.5 s
DURATION = 16.0
N = int(SR * DURATION)

OUT_DIR = os.path.join(os.path.dirname(__file__))
os.makedirs(OUT_DIR, exist_ok=True)

# ── helpers ────────────────────────────────────────────────────────────────

def ms(ms_):   return int(SR * ms_ / 1000)
def sec(s):    return int(SR * s)

def env(n, att=0.002, dec=0.1, sus=0.6, rel=0.15):
    """ADSR envelope, times as fraction of total length."""
    a = int(n * att); d = int(n * dec); r = int(n * rel)
    s = n - a - d - r
    e = np.concatenate([
        np.linspace(0, 1, a),
        np.linspace(1, sus, d),
        np.full(max(s, 0), sus),
        np.linspace(sus, 0, r),
    ])
    return e[:n]

def sine(freq, n, sr=SR):
    t = np.arange(n) / sr
    return np.sin(2 * np.pi * freq * t)

def fade(sig, fade_n=None):
    if fade_n is None: fade_n = min(ms(10), len(sig) // 4)
    out = sig.copy()
    out[:fade_n] *= np.linspace(0, 1, fade_n)
    out[-fade_n:] *= np.linspace(1, 0, fade_n)
    return out

def hp(sig, cutoff=80, order=2):
    sos = butter(order, cutoff / (SR / 2), btype='high', output='sos')
    return sosfilt(sos, sig)

def lp(sig, cutoff=8000, order=2):
    sos = butter(order, cutoff / (SR / 2), btype='low', output='sos')
    return sosfilt(sos, sig)

def bp(sig, lo, hi, order=2):
    sos = butter(order, [lo / (SR / 2), hi / (SR / 2)], btype='band', output='sos')
    return sosfilt(sos, sig)

def write_wav(path, sig, sr=SR):
    sig = np.clip(sig, -1, 1)
    wavfile.write(path, sr, (sig * 32767).astype(np.int16))

def stereo(mono):
    return np.stack([mono, mono], axis=1)

def write_stereo(path, sig, sr=SR):
    sig = np.clip(sig, -1, 1)
    wavfile.write(path, sr, (sig * 32767).astype(np.int16))


# ═══════════════════════════════════════════════════════════════════════════
# MUSIC — 120 BPM minimal electronic reference track
# ═══════════════════════════════════════════════════════════════════════════

def make_kick(n=ms(180)):
    """Deep punchy kick drum."""
    t = np.arange(n) / SR
    # Pitch sweep: 180→50 Hz over 80ms
    freq = 180 * np.exp(-t / 0.035) + 50
    phase = np.cumsum(2 * np.pi * freq / SR)
    body = np.sin(phase)
    # Amp envelope
    amp = np.exp(-t / 0.06)
    click_n = ms(5)
    click = np.zeros(n)
    click[:click_n] = np.random.randn(click_n) * np.linspace(0.4, 0, click_n)
    kick = (body * amp + click)
    kick = hp(kick, 40)
    kick = kick / np.abs(kick).max()
    return fade(kick)

def make_hihat(n=ms(25), closed=True):
    """Closed/open hi-hat from filtered noise."""
    noise = np.random.randn(n)
    noise = bp(noise, 6000, 14000)
    dur = ms(12) if closed else ms(60)
    amp = np.exp(-np.arange(n) / (SR * (0.012 if closed else 0.06)))
    h = noise * amp
    h = h / (np.abs(h).max() + 1e-9) * 0.3
    return fade(h)

def make_shaker(n=ms(20)):
    """Shaker transient."""
    noise = np.random.randn(n)
    noise = bp(noise, 5000, 12000)
    amp = np.exp(-np.arange(n) / (SR * 0.015))
    s = noise * amp
    s = s / (np.abs(s).max() + 1e-9) * 0.15
    return fade(s)

def make_clap(n=ms(80)):
    """Soft electronic clap."""
    noise = np.random.randn(n)
    noise = bp(noise, 800, 5000)
    t = np.arange(n) / SR
    # Double transient
    amp = np.exp(-t / 0.015) + 0.5 * np.exp(-(t - 0.012) / 0.02)
    amp = np.maximum(amp, 0)
    c = noise * amp
    c = c / (np.abs(c).max() + 1e-9) * 0.35
    return fade(c)

def make_sub_bass(freq=55.0, n=ms(300)):
    """Sustained sub bass note."""
    t = np.arange(n) / SR
    sig = 0.7 * np.sin(2 * np.pi * freq * t) + 0.15 * np.sin(2 * np.pi * freq * 2 * t)
    amp = np.exp(-t / 0.25) * (1 - np.exp(-t / 0.01))
    b = sig * amp
    b = b / (np.abs(b).max() + 1e-9) * 0.5
    return fade(b)

def make_synth_pad(freq=220, n=ms(2000)):
    """Subtle warm pad chord."""
    t = np.arange(n) / SR
    # Minor 7th chord: root, minor third, fifth, minor seventh
    ratios = [1.0, 1.189, 1.498, 1.782]
    sig = sum(np.sin(2 * np.pi * freq * r * t) * 0.25 for r in ratios)
    amp = np.ones(n)
    fade_n = ms(300)
    amp[:fade_n] *= np.linspace(0, 1, fade_n)
    amp[-fade_n:] *= np.linspace(1, 0, fade_n)
    sig = sig * amp
    sig = lp(sig, 1200)
    sig = sig / (np.abs(sig).max() + 1e-9) * 0.12
    return sig

def generate_music():
    """16-bar 120 BPM minimal electronic reference track."""
    track = np.zeros(N)
    BEAT = sec(BEAT_S)

    kick  = make_kick()
    hh    = make_hihat(closed=True)
    ohh   = make_hihat(n=ms(60), closed=False)
    shk   = make_shaker()
    clap  = make_clap()

    def place(buf, pos, gain=1.0):
        end = min(pos + len(buf), N)
        n_copy = end - pos
        if n_copy > 0 and pos >= 0:
            track[pos:end] += buf[:n_copy] * gain

    # 32 beats; 4/4 time: beat = 1,2,3,4 repeating
    for bi in range(32):
        b = bi * BEAT
        beat_in_bar = bi % 4  # 0,1,2,3

        # Kick: 1 and 3 (0-indexed: 0 and 2)
        if beat_in_bar in (0, 2):
            place(make_kick(), b, 0.85)

        # Clap: 2 and 4 (0-indexed: 1 and 3)
        if beat_in_bar in (1, 3):
            place(clap, b, 0.4)

        # Closed hi-hat: every beat
        place(hh, b, 0.5)

        # 8th note hi-hat off-beat
        place(hh, b + BEAT // 2, 0.35)

        # Shaker on 16ths (e and a of each beat)
        place(shk, b + BEAT // 4, 0.25)
        place(shk, b + 3 * BEAT // 4, 0.25)

        # Open hi-hat on beat 4 of bar (bi%4==3)
        if beat_in_bar == 3:
            place(ohh, b, 0.3)

    # Sub bass: root note every bar (every 4 beats), with variation
    bass_freqs = [55, 55, 65, 65, 55, 55, 49, 55]  # 8 bars
    for bar in range(8):
        b = bar * BEAT * 4
        freq = bass_freqs[bar]
        place(make_sub_bass(freq, ms(400)), b, 0.7)
        # Ghost note on beat 3
        place(make_sub_bass(freq * 1.5, ms(200)), b + BEAT * 2, 0.35)

    # Synth pad: long sustained, enters at bar 2, repeats
    for bar in range(1, 8):
        b = bar * BEAT * 4
        place(make_synth_pad(110, ms(2000)), b, 0.5)

    # Mix and normalize
    track = hp(track, 30)
    track = lp(track, 16000)
    peak = np.abs(track).max()
    if peak > 0:
        track = track / peak * 0.75
    return track

# ═══════════════════════════════════════════════════════════════════════════
# UI SFX
# ═══════════════════════════════════════════════════════════════════════════

def sfx_cursor_click(n=ms(35)):
    """Soft cursor click — very short percussive."""
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 1800 * t) * np.exp(-t / 0.006)
    noise = np.random.randn(n) * np.exp(-t / 0.003) * 0.3
    sig = (body + noise) * 0.55
    return fade(sig, ms(2))

def sfx_confirmation_tick(n=ms(90)):
    """Clean confirmation tick — C6 → G6 blip."""
    t = np.arange(n) / SR
    f1 = 1047  # C6
    f2 = 1568  # G6
    mid = n // 3
    sig = np.zeros(n)
    sig[:mid] = np.sin(2 * np.pi * f1 * t[:mid]) * np.exp(-t[:mid] / 0.025)
    t2 = t[mid:] - t[mid]
    sig[mid:] = np.sin(2 * np.pi * f2 * t2) * np.exp(-t2 / 0.025)
    sig = lp(sig, 4000) * 0.5
    return fade(sig)

def sfx_interface_tap(n=ms(50)):
    """Light interface tap — higher frequency."""
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.012)
    noise = np.random.randn(n) * np.exp(-t / 0.004) * 0.15
    sig = (sig + noise) * 0.45
    return fade(sig, ms(2))

def sfx_success_tick(n=ms(110)):
    """Success/valid tick — E5 → B5 two-tone positive."""
    t = np.arange(n) / SR
    f1, f2 = 659, 988   # E5, B5
    mid = n // 2
    sig = np.zeros(n)
    sig[:mid] = np.sin(2 * np.pi * f1 * t[:mid]) * np.exp(-t[:mid] / 0.030)
    t2 = t[mid:] - t[mid]
    sig[mid:] = np.sin(2 * np.pi * f2 * t2) * np.exp(-t2 / 0.035)
    sig += 0.1 * np.sin(2 * np.pi * f1 * 2 * t) * np.exp(-t / 0.020)
    sig = lp(sig, 5000) * 0.55
    return fade(sig)

def sfx_notification_tone(n=ms(160)):
    """Restrained notification chime — two soft tones."""
    t = np.arange(n) / SR
    f1, f2 = 880, 1108  # A5, C#6 (major third)
    third = n // 3
    sig = np.zeros(n)
    sig[:third] = np.sin(2 * np.pi * f1 * t[:third]) * np.exp(-t[:third] / 0.04)
    t2 = t[third:] - t[third]
    sig[third:] = np.sin(2 * np.pi * f2 * t2) * np.exp(-t2 / 0.05)
    sig = lp(sig, 4500) * 0.45
    return fade(sig)

def sfx_resolved_tick(n=ms(120)):
    """Resolved / טופל — descending minor 3rd, soft."""
    t = np.arange(n) / SR
    f1, f2 = 784, 659  # G5, E5
    mid = n // 2
    sig = np.zeros(n)
    sig[:mid] = np.sin(2 * np.pi * f1 * t[:mid]) * np.exp(-t[:mid] / 0.025)
    t2 = t[mid:] - t[mid]
    sig[mid:] = np.sin(2 * np.pi * f2 * t2) * np.exp(-t2 / 0.030)
    sig = lp(sig, 4000) * 0.4
    return fade(sig)

def sfx_rating_tap(n=ms(28)):
    """Quiet dry rating selection tap."""
    t = np.arange(n) / SR
    sig = np.sin(2 * np.pi * 1200 * t) * np.exp(-t / 0.007) * 0.3
    noise = np.random.randn(n) * np.exp(-t / 0.003) * 0.08
    return fade(sig + noise, ms(1))

def sfx_analytics_rise(n=ms(220)):
    """Subtle tonal data-rise sweep — freq glide up."""
    t = np.arange(n) / SR
    f_start, f_end = 400, 900
    freq = np.linspace(f_start, f_end, n)
    phase = np.cumsum(2 * np.pi * freq / SR)
    sig = np.sin(phase)
    amp = np.ones(n)
    fade_n = ms(40)
    amp[:fade_n] *= np.linspace(0, 1, fade_n)
    amp[-fade_n:] *= np.linspace(1, 0, fade_n)
    sig = lp(sig * amp, 2000) * 0.25
    return sig

def sfx_report_ready(n=ms(180)):
    """Clean report-ready confirmation — A5 → C#6 → E6 arpeggio."""
    t = np.arange(n) / SR
    notes = [880, 1108, 1320]  # A5, C#6, E6
    third = n // 3
    sig = np.zeros(n)
    for i, f in enumerate(notes):
        start = i * third
        end = start + third
        ts = t[start:end] - t[start]
        sig[start:end] += np.sin(2 * np.pi * f * ts) * np.exp(-ts / 0.035)
    sig = lp(sig, 5000) * 0.50
    return fade(sig)

def sfx_brand_sting(n=ms(520)):
    """Short premium logo sting — ascending Amaj7 arpeggio with decay."""
    t = np.arange(n) / SR
    # A4 → C#5 → E5 → G#5 with slight reverb tail
    notes_freq = [440, 554, 659, 831]
    notes_start = [0, ms(80), ms(160), ms(260)]
    notes_len  = [ms(400), ms(380), ms(350), ms(260)]
    sig = np.zeros(n)
    for freq, start, length in zip(notes_freq, notes_start, notes_len):
        end = min(start + length, n)
        dur = end - start
        ts = np.arange(dur) / SR
        tone = np.sin(2 * np.pi * freq * ts) + 0.3 * np.sin(2 * np.pi * freq * 2 * ts)
        tone *= np.exp(-ts / 0.15)
        sig[start:end] += tone
    sig = lp(sig, 6000) * 0.60
    return fade(sig, ms(20))


# ═══════════════════════════════════════════════════════════════════════════
# SFX TIMING MAP  (time in seconds, one-indexed beat reference)
# ═══════════════════════════════════════════════════════════════════════════

SFX_EVENTS = [
    # (t_sec,  fn,                      gain, note)
    (1.10,  sfx_cursor_click,          0.55, "login field focus"),
    (1.42,  sfx_cursor_click,          0.55, "login password field"),
    (1.78,  sfx_confirmation_tick,     0.70, "login submitted"),
    (5.05,  sfx_interface_tap,         0.60, "PDF document opens"),
    (6.25,  sfx_success_tick,          0.65, "equipment תקין"),
    (7.25,  sfx_success_tick,          0.60, "lifting equipment ok"),
    (8.10,  sfx_notification_tone,     0.65, "alert appears"),
    (8.62,  sfx_resolved_tick,         0.60, "alert resolved"),
    (10.08, sfx_rating_tap,            0.45, "review rating tap 1"),
    (10.17, sfx_rating_tap,            0.45, "review rating tap 2"),
    (10.26, sfx_rating_tap,            0.45, "review rating tap 3"),
    (10.68, sfx_confirmation_tick,     0.70, "review save"),
    (11.18, sfx_analytics_rise,        0.55, "analytics data rise"),
    (12.72, sfx_report_ready,          0.75, "report ready"),
    (14.35, sfx_brand_sting,           0.85, "brand seal sting"),
]


# ═══════════════════════════════════════════════════════════════════════════
# BUILD SFX STEM
# ═══════════════════════════════════════════════════════════════════════════

def build_sfx_stem():
    stem = np.zeros(N)
    for t_sec, fn, gain, note in SFX_EVENTS:
        sfx = fn() * gain
        pos = sec(t_sec)
        end = min(pos + len(sfx), N)
        n_copy = end - pos
        if n_copy > 0:
            stem[pos:end] += sfx[:n_copy]
        print(f"  SFX placed: {note:35s}  t={t_sec:.2f}s  gain={gain}")
    return stem


# ═══════════════════════════════════════════════════════════════════════════
# MIX + MASTER
# ═══════════════════════════════════════════════════════════════════════════

def make_music_denser(music):
    """Add a sustained drone/pad layer to lift average loudness toward -14 LUFS."""
    from scipy.ndimage import uniform_filter1d
    t = np.arange(N) / SR

    # Sustained chord drone — continuous through the track
    # Am7 voicing: A2 + C3 + E3 + G3
    drone_freqs = [110, 131, 165, 196]   # A2, C3, E3, G3
    drone = sum(
        np.sin(2 * np.pi * f * t) * 0.22 +
        np.sin(2 * np.pi * f * 2 * t) * 0.06
        for f in drone_freqs
    )
    drone = lp(drone, 800)

    # Ramp in over first bar, sustain throughout
    ramp_n = sec(2.0)
    drone[:ramp_n] *= np.linspace(0, 1, ramp_n)
    drone[-sec(1.0):] *= np.linspace(1, 0, sec(1.0))

    # Textural noise pad (bandwidth-limited white noise)
    noise_pad = np.random.randn(N)
    noise_pad = lp(noise_pad, 400)
    noise_pad *= 0.08
    noise_pad[:ramp_n] *= np.linspace(0, 1, ramp_n)
    noise_pad[-sec(1.0):] *= np.linspace(1, 0, sec(1.0))

    # Pulse on 8th notes — adds transient energy between kicks
    BEAT = sec(BEAT_S)
    pulse = np.zeros(N)
    for bi in range(32):
        for half in range(2):
            pos = bi * BEAT + half * (BEAT // 2)
            pn = min(ms(40), N - pos)
            if pn > 0:
                tp = np.arange(pn) / SR
                pulse[pos:pos+pn] += np.sin(2*np.pi*220*tp) * np.exp(-tp/0.015) * 0.15

    result = music + drone * 0.85 + noise_pad + pulse * 0.5
    return result

def brick_wall_limiter(sig, threshold=0.88, release_ms=30):
    """Simple sample-by-sample lookahead brick-wall limiter."""
    out = sig.copy()
    gain = 1.0
    release = np.exp(-1.0 / (SR * release_ms / 1000))
    for i in range(len(out)):
        level = abs(out[i])
        if level * gain > threshold:
            gain = threshold / (level + 1e-9)
        else:
            gain = min(1.0, gain / release)
        out[i] *= gain
    return out

def mix_and_master(music, sfx):
    """Combine music and SFX, compress to ~-14 LUFS, limit to -1 dBTP."""
    # Boost sustain to push LUFS up (sparse kick/hihat gives high crest factor)
    music = make_music_denser(music)

    MUSIC_GAIN = 1.8   # significant makeup gain
    SFX_GAIN   = 1.6

    mix = music * MUSIC_GAIN + sfx * SFX_GAIN

    # Normalize to headroom before limiting
    peak = np.abs(mix).max()
    if peak > 0:
        mix = mix / peak * 0.95

    # Brick-wall limit at -1 dBTP (0.891)
    mix = brick_wall_limiter(mix, threshold=0.891)

    # Final peak check
    peak = np.abs(mix).max()
    target_peak = 0.891
    if peak > 0:
        mix = mix * (target_peak / peak)
    return mix


# ═══════════════════════════════════════════════════════════════════════════
# LOOP CROSSFADE
# Build a gapless loop by equal-power crossfading the tail into the head.
# ═══════════════════════════════════════════════════════════════════════════

def make_loop_version(mix):
    """Equal-power crossfade at loop boundary.
    0.15s ≈ 30% of a beat — short enough to avoid doubled transients,
    long enough to remove audible click."""
    xfade_n = sec(0.15)   # 0.15s crossfade
    head = mix[:xfade_n].copy()
    tail = mix[-xfade_n:].copy()
    # Equal-power
    angle = np.linspace(0, np.pi / 2, xfade_n)
    cos_fade = np.cos(angle)
    sin_fade = np.sin(angle)
    loop = mix.copy()
    loop[:xfade_n]  = sin_fade * tail + cos_fade * head   # blend tail→head at start
    loop[-xfade_n:] = cos_fade * tail + sin_fade * head   # blend at end
    return loop


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    print("Generating reference music track (120 BPM minimal electronic)...")
    music = generate_music()
    write_stereo(os.path.join(OUT_DIR, "music_ref.wav"), stereo(music))
    print(f"  music_ref.wav  peak={np.abs(music).max():.3f}  rms={np.sqrt(np.mean(music**2)):.4f}")

    print("\nBuilding SFX stem...")
    sfx = build_sfx_stem()
    write_stereo(os.path.join(OUT_DIR, "sfx_stem.wav"), stereo(sfx))

    print("\nMixing...")
    mix = mix_and_master(music, sfx)
    write_stereo(os.path.join(OUT_DIR, "mix_master.wav"), stereo(mix))
    print(f"  mix peak={np.abs(mix).max():.3f}")

    print("\nBuilding loop version...")
    loop = make_loop_version(mix)
    write_stereo(os.path.join(OUT_DIR, "mix_loop.wav"), stereo(loop))

    print("\nAll audio stems written to:", OUT_DIR)
    print("  music_ref.wav")
    print("  sfx_stem.wav")
    print("  mix_master.wav")
    print("  mix_loop.wav")
    print("\nDone.")
