import importlib.util
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "src" / "chatterbox_pause_cleanup_lab29.py"
if not MODULE.exists():
    raise AssertionError("Falta chatterbox_pause_cleanup_lab29.py")
spec = importlib.util.spec_from_file_location("gec_chatterbox_cleanup", MODULE)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
clean_samples = mod.clean_samples

sr = 24000

def tone(seconds, amp=5000, hz=180.0):
    n = int(round(seconds * sr))
    return [int(round(math.sin(2 * math.pi * hz * (i / sr)) * amp)) for i in range(n)]

def silence(seconds):
    return [0] * int(round(seconds * sr))

def noise(seconds, amp, seed):
    n = int(round(seconds * sr)); rng = random.Random(seed); out = []
    for _ in range(n):
        out.append(max(-32767, min(32767, int(round(rng.gauss(0, amp))))))
    return out

def rms(block):
    return math.sqrt(sum(float(x) * float(x) for x in block) / max(1, len(block)))

# Regression principal: equivalente al burst fuerte escuchado después de
# "en Lurín...": voz -> silencio largo -> ruido corto fuerte -> silencio -> voz.
strong = tone(.85, 5200, 175) + silence(.48) + noise(.16, 10500, 11) + silence(.08) + tone(.90, 5400, 205)
burst_start = int((.85 + .48) * sr); burst_end = burst_start + int(.16 * sr)
raw_rms = rms(strong[burst_start:burst_end])
processed, diag = clean_samples(strong, sr, True)
assert len(processed) == len(strong), "La limpieza debe preservar duración/sincronía"
assert diag["pause_cleanup_applied"] is True, diag
assert diag["pause_cleanup_strong_events"] >= 1, diag
assert rms(processed[burst_start:burst_end]) < raw_rms * .08, (raw_rms, rms(processed[burst_start:burst_end]), diag)
voice_after = int((.85 + .48 + .16 + .08) * sr)
assert processed[voice_after:] == strong[voice_after:], "La frase posterior no debe modificarse"

# Residuo débil interno entre frases: también debe desaparecer sin recortar.
weak = tone(.75, 5000, 180) + silence(.18) + noise(.08, 190, 22) + silence(.10) + tone(.80, 5000, 195)
weak_start = int((.75 + .18) * sr); weak_end = weak_start + int(.08 * sr)
weak_out, weak_diag = clean_samples(weak, sr, True)
assert len(weak_out) == len(weak)
assert weak_diag["pause_cleanup_applied"] is True, weak_diag
assert weak_diag["pause_cleanup_weak_events"] >= 1, weak_diag
assert rms(weak_out[weak_start:weak_end]) < rms(weak[weak_start:weak_end]) * .08

# Seguridad: una consonante/ruido corto dentro de voz continua no está aislada
# por silencio a ambos lados y no debe eliminarse.
natural = tone(.70, 5000, 180) + noise(.06, 1800, 31) + tone(.75, 5000, 190)
natural_out, natural_diag = clean_samples(natural, sr, True)
assert natural_diag["pause_cleanup_applied"] is False, natural_diag
assert natural_out == natural

# Switch de seguridad.
disabled, disabled_diag = clean_samples(strong, sr, False)
assert disabled_diag["pause_cleanup_applied"] is False
assert disabled == strong

print("check-v2lab-chatterbox-tail: OK · burst fuerte + residuo interno eliminados · duración y voz útil preservadas")
