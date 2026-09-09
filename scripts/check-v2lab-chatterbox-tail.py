import ast
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "src" / "tts_lab_worker.py"
source = WORKER.read_text(encoding="utf-8")
tree = ast.parse(source)
fn = next((n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "cleanup_chatterbox_tail"), None)
if fn is None:
    raise AssertionError("No existe cleanup_chatterbox_tail")
module = ast.Module(body=[fn], type_ignores=[])
ast.fix_missing_locations(module)
env = {"np": np, "math": math}
exec(compile(module, str(WORKER), "exec"), env)
cleanup = env["cleanup_chatterbox_tail"]

sr = 24000

def tone(seconds, amp=0.12, hz=180.0):
    n = int(round(seconds * sr))
    t = np.arange(n, dtype=np.float64) / sr
    return (np.sin(2 * np.pi * hz * t) * amp).astype(np.float32)

def noise(seconds, amp, seed):
    n = int(round(seconds * sr))
    rng = np.random.default_rng(seed)
    return (rng.standard_normal(n) * amp).astype(np.float32)

# Production-like failure: normal voice, a quiet valley, then a short low-level
# breath/noise burst, followed by a low tail. The burst must be removed.
sample = np.concatenate([
    tone(1.0),
    noise(0.12, 0.0007, 1),
    noise(0.08, 0.0100, 2),
    noise(0.18, 0.0005, 3),
])
cleaned, diag = cleanup(sample, sr, True)
assert diag["tail_cleanup_applied"] is True, diag
assert diag["tail_cleanup_reason"] == "post_silence_residual", diag
assert 100 <= diag["tail_cleanup_ms"] <= 360, diag
assert len(cleaned) < len(sample)
assert abs(float(cleaned[-1])) < 1e-7, "El fade debe terminar en cero"

# A short natural ending must not be clipped.
clean = np.concatenate([tone(1.2), noise(0.06, 0.0030, 4)])
cleaned2, diag2 = cleanup(clean, sr, True)
assert diag2["tail_cleanup_applied"] is False, diag2
assert len(cleaned2) == len(clean)

# A long very-low tail can be shortened conservatively.
low_tail = np.concatenate([tone(1.0), noise(0.24, 0.0004, 5)])
cleaned3, diag3 = cleanup(low_tail, sr, True)
assert diag3["tail_cleanup_applied"] is True, diag3
assert diag3["tail_cleanup_reason"] == "low_level_tail", diag3
assert 60 <= diag3["tail_cleanup_ms"] <= 360, diag3

# Safety switch: disabled means bit-for-bit length and samples are preserved.
disabled, diag4 = cleanup(sample, sr, False)
assert diag4["tail_cleanup_applied"] is False
assert np.array_equal(disabled, sample)

print("check-v2lab-chatterbox-tail: OK · residual post-pausa eliminado · voz útil preservada · fade seguro")
