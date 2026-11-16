"""Measure integrated LUFS and true peak of the mix using ITU-R BS.1770-4."""
import numpy as np
from scipy.io import wavfile
from scipy.signal import lfilter

SR_TARGET = 48000
WAV_PATH = __file__.replace('measure_lufs.py', 'mix_master.wav')

sr, data = wavfile.read(WAV_PATH)
if data.ndim == 1:
    data = np.stack([data, data], axis=1)
sig = data.astype(np.float64) / 32768.0

# ── K-weighting (BS.1770 stage 1: pre-filter, stage 2: RLB shelving) ──
# Stage 1: high-shelf pre-filter (head acoustic effect)
# Stage 2: high-pass filter (removes sub-bass)

def k_weight(x, sr):
    # Pre-filter coefficients (48 kHz)
    # High-shelf: Gain=+4dB, Fc=1500 Hz
    b1 = np.array([1.53512485958697, -2.69169618940638, 1.19839281085285])
    a1 = np.array([1.0,              -1.69065929318241, 0.73248077421585])
    # High-pass: Fc=38.135 Hz, Q=0.5
    b2 = np.array([1.0, -2.0, 1.0])
    a2 = np.array([1.0, -1.99004745483398, 0.99007225036621])
    y = lfilter(b1, a1, x)
    y = lfilter(b2, a2, y)
    return y

left  = k_weight(sig[:, 0], sr)
right = k_weight(sig[:, 1], sr)

# Mean square
ms_l = np.mean(left  ** 2)
ms_r = np.mean(right ** 2)
# Integrated loudness (stereo: sum channel means equally weighted)
z = 0.5 * (ms_l + ms_r)
lufs = -0.691 + 10 * np.log10(z) if z > 0 else -np.inf

# True peak: oversample by 4 using zero-insertion interpolation
def true_peak(x):
    # Simple 4× oversample via FFT interpolation
    N = len(x)
    X = np.fft.rfft(x)
    X_up = np.zeros(4 * (N // 2 + 1), dtype=complex)
    X_up[:len(X)] = X
    x_up = np.fft.irfft(X_up, n=4 * N) * 4
    return np.abs(x_up).max()

tp_l = true_peak(sig[:, 0])
tp_r = true_peak(sig[:, 1])
tp   = max(tp_l, tp_r)
tp_dbtp = 20 * np.log10(tp) if tp > 0 else -np.inf

print(f"Integrated LUFS : {lufs:.1f} LUFS")
print(f"True peak       : {tp_dbtp:.1f} dBTP")
print(f"Peak (sample)   : {20*np.log10(max(np.abs(sig).max(), 1e-9)):.1f} dBFS")
print(f"Duration        : {len(sig)/sr:.2f}s")
print(f"Channels        : {data.shape[1] if data.ndim>1 else 1}")
print(f"Sample rate     : {sr} Hz")
