import ast
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "src" / "tts_lab_worker.py"
source = WORKER.read_text(encoding="utf-8")
tree = ast.parse(source)

def extract(name):
    fn = next((n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == name), None)
    if fn is None:
        raise AssertionError(f"No existe {name}")
    module = ast.Module(body=[fn], type_ignores=[])
    ast.fix_missing_locations(module)
    env = {"np": np, "math": math}
    exec(compile(module, str(WORKER), "exec"), env)
    return env[name]

cleanup_tail = extract("cleanup_chatterbox_tail")
cleanup_pauses = extract("cleanup_chatterbox_pause_residuals")

sr = 24000

def tone(seconds, amp=0.12, hz=180.0):
    n = int(round(seconds * sr))
    t = np.arange(n, dtype=np.float64) / sr
    return (np.sin(2 * np.pi * hz * t) * amp).astype(np.float32)

def noise(seconds, amp, seed):
    n = int(round(seconds * sr))
    rng = np.random.default_rng(seed)
    return (rng.standard_normal(n) * amp).astype(np.float32)

# Existing production-like tail failure: normal voice, quiet valley, then a
# short low-level breath/noise burst at the end of a chunk.
sample = np.concatenate([
    tone(1.0),
    noise(0.12, 0.0007, 1),
    noise(0.08, 0.0100, 2),
    noise(0.18, 0.0005, 3),
])
cleaned, diag = cleanup_tail(sample, sr, True)
assert diag["tail_cleanup_applied"] is True, diag
assert diag["tail_cleanup_reason"] == "post_silence_residual", diag
assert 100 <= diag["tail_cleanup_ms"] <= 360, diag
assert len(cleaned) < len(sample)
assert abs(float(cleaned[-1])) < 1e-7, "El fade debe terminar en cero"

# A short natural ending must not be clipped.
clean = np.concatenate([tone(1.2), noise(0.06, 0.0030, 4)])
cleaned2, diag2 = cleanup_tail(clean, sr, True)
assert diag2["tail_cleanup_applied"] is False, diag2
assert len(cleaned2) == len(clean)

# A long very-low tail can be shortened conservatively.
low_tail = np.concatenate([tone(1.0), noise(0.24, 0.0004, 5)])
cleaned3, diag3 = cleanup_tail(low_tail, sr, True)
assert diag3["tail_cleanup_applied"] is True, diag3
assert diag3["tail_cleanup_reason"] == "low_level_tail", diag3
assert 60 <= diag3["tail_cleanup_ms"] <= 360, diag3

# New regression from the user WAVs: voice -> long silence -> short loud,
# noise-like burst -> short silence -> real speech. The burst must be muted,
# while total duration and following speech remain unchanged.
strong_burst = np.concatenate([
    tone(0.85, amp=0.13, hz=175),
    noise(0.48, 0.00012, 10),
    noise(0.16, 0.12, 11),
    noise(0.07, 0.00012, 12),
    tone(0.90, amp=0.14, hz=205),
])
# Make the synthetic artifact resemble the real case: very high zero-crossing
# activity in the last part of the burst, while speech remains periodic.
burst_start = int((0.85 + 0.48) * sr)
burst_end = burst_start + int(0.16 * sr)
raw_burst_rms = float(np.sqrt(np.mean(np.square(strong_burst[burst_start:burst_end].astype(np.float64)))))
processed, pause_diag = cleanup_pauses(strong_burst, sr, True)
assert len(processed) == len(strong_burst), "La limpieza interna debe preservar duración y sincronía"
assert pause_diag["pause_cleanup_applied"] is True, pause_diag
assert pause_diag["pause_cleanup_events"] >= 1, pause_diag
clean_burst_rms = float(np.sqrt(np.mean(np.square(processed[burst_start:burst_end].astype(np.float64)))))
assert clean_burst_rms < raw_burst_rms * 0.08, (raw_burst_rms, clean_burst_rms, pause_diag)
# The following real voice must remain essentially untouched.
voice_after = int((0.85 + 0.48 + 0.16 + 0.07) * sr)
assert np.max(np.abs(processed[voice_after:] - strong_burst[voice_after:])) < 1e-6

# Safety: a short natural consonant/noise inside continuous speech must not be
# removed when it is not isolated by silence on both sides.
natural = np.concatenate([
    tone(0.70, amp=0.12, hz=180),
    noise(0.06, 0.06, 21),
    tone(0.75, amp=0.12, hz=190),
])
natural_out, natural_diag = cleanup_pauses(natural, sr, True)
assert natural_diag["pause_cleanup_applied"] is False, natural_diag
assert np.array_equal(natural_out, natural)

# Safety switch: disabled means bit-for-bit length and samples are preserved.
disabled, diag4 = cleanup_tail(sample, sr, False)
assert diag4["tail_cleanup_applied"] is False
assert np.array_equal(disabled, sample)
disabled_pause, diag5 = cleanup_pauses(strong_burst, sr, False)
assert diag5["pause_cleanup_applied"] is False
assert np.array_equal(disabled_pause, strong_burst)

print("check-v2lab-chatterbox-tail: OK · cola + residuos internos eliminados · duración y voz útil preservadas")
