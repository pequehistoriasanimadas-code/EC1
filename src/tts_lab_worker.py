import json
import os
import re
import sys
import time
import traceback

import numpy as np
import soundfile as sf

ENGINE = sys.argv[1] if len(sys.argv) > 1 else ""
MODEL = None
MODEL_DEVICE = ""
VOICE_PROMPTS = {}


def emit(payload):
    print("LABJSON " + json.dumps(payload, ensure_ascii=False), flush=True)


def chunks(text, max_chars=360):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if not text:
        return []
    parts = re.split(r"(?<=[.!?;:])\s+", text)
    out, cur = [], ""
    for p in parts:
        if not p:
            continue
        if len(cur) + len(p) + 1 <= max_chars:
            cur = (cur + " " + p).strip()
        else:
            if cur:
                out.append(cur)
            while len(p) > max_chars:
                cut = p.rfind(" ", 0, max_chars)
                cut = cut if cut > 80 else max_chars
                out.append(p[:cut].strip())
                p = p[cut:].strip()
            cur = p
    if cur:
        out.append(cur)
    return out


def load_model():
    global MODEL, MODEL_DEVICE
    if MODEL is not None:
        return MODEL
    import torch
    use_cuda = bool(torch.cuda.is_available())
    MODEL_DEVICE = "cuda" if use_cuda else "cpu"
    if ENGINE == "chatterbox":
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        try:
            MODEL = ChatterboxMultilingualTTS.from_pretrained(
                device=MODEL_DEVICE, t3_model="v3"
            )
        except TypeError:
            # Some packaged Chatterbox releases select the newest multilingual
            # checkpoint internally and no longer expose t3_model.
            MODEL = ChatterboxMultilingualTTS.from_pretrained(device=MODEL_DEVICE)
    elif ENGINE == "qwen3tts":
        from qwen_tts import Qwen3TTSModel
        kwargs = {
            "device_map": "cuda:0" if use_cuda else "cpu",
            "dtype": torch.bfloat16 if use_cuda else torch.float32,
        }
        MODEL = Qwen3TTSModel.from_pretrained(
            "Qwen/Qwen3-TTS-12Hz-0.6B-Base", **kwargs
        )
    else:
        raise RuntimeError(f"Motor no soportado: {ENGINE}")
    return MODEL


def qwen_prompt(ref_audio):
    key = os.path.abspath(ref_audio)
    if key not in VOICE_PROMPTS:
        VOICE_PROMPTS[key] = load_model().create_voice_clone_prompt(
            ref_audio=ref_audio,
            ref_text=None,
            x_vector_only_mode=True,
        )
    return VOICE_PROMPTS[key]


def generate_piece(text, ref_audio, style, params):
    model = load_model()
    if ENGINE == "chatterbox":
        exaggeration = float(params.get("exaggeration", 0.42))
        cfg = float(params.get("cfgWeight", 0.35))
        temperature = float(params.get("temperature", 0.8))
        if style == "neutral":
            exaggeration, cfg = 0.50, 0.50
        elif style == "expressive":
            exaggeration, cfg = 0.62, 0.30
        wav = model.generate(
            text,
            language_id="es",
            audio_prompt_path=ref_audio or None,
            exaggeration=exaggeration,
            cfg_weight=cfg,
            temperature=temperature,
        )
        arr = wav.detach().float().cpu().numpy()
        if arr.ndim > 1:
            arr = arr[0]
        return arr.astype(np.float32), int(model.sr)
    if ENGINE == "qwen3tts":
        temperature = float(params.get("temperature", 0.78))
        if style == "neutral":
            temperature = 0.70
        elif style == "expressive":
            temperature = 0.88
        wavs, sr = model.generate_voice_clone(
            text=text,
            language="Spanish",
            voice_clone_prompt=qwen_prompt(ref_audio),
            max_new_tokens=2048,
            do_sample=True,
            top_k=50,
            top_p=1.0,
            temperature=temperature,
            repetition_penalty=1.05,
        )
        return np.asarray(wavs[0], dtype=np.float32), int(sr)
    raise RuntimeError("Motor no soportado")


def generate(payload):
    text = str(payload.get("text") or "").strip()
    ref_audio = str(payload.get("reference") or "").strip()
    output = str(payload.get("output") or "").strip()
    style = str(payload.get("style") or "news")
    params = payload.get("params") or {}
    if not text:
        raise RuntimeError("No hay texto para locutar")
    if ENGINE == "qwen3tts" and (not ref_audio or not os.path.isfile(ref_audio)):
        raise RuntimeError("Selecciona una voz de referencia antes de usar Qwen3-TTS")
    if ENGINE == "chatterbox" and ref_audio and not os.path.isfile(ref_audio):
        raise RuntimeError("La voz de referencia seleccionada ya no existe")
    if not output:
        raise RuntimeError("Ruta de salida inválida")
    started = time.perf_counter()
    pieces, sample_rate = [], 0
    for part in chunks(text):
        audio, sr = generate_piece(part, ref_audio, style, params)
        sample_rate = sr
        if pieces and sr:
            pieces.append(np.zeros(int(sr * 0.13), dtype=np.float32))
        pieces.append(audio)
    if not pieces or not sample_rate:
        raise RuntimeError("El motor no produjo audio")
    audio = np.concatenate(pieces)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    sf.write(output, audio, sample_rate)
    elapsed = time.perf_counter() - started
    duration = len(audio) / float(sample_rate)
    return {
        "output": output,
        "duration_sec": round(duration, 3),
        "elapsed_ms": round(elapsed * 1000),
        "rtf": round(elapsed / duration, 3) if duration > 0 else 0,
        "device": MODEL_DEVICE,
        "chunks": len(chunks(text)),
    }


def handle(payload):
    cmd = str(payload.get("cmd") or "")
    if cmd == "ping":
        return {
            "ready": True,
            "engine": ENGINE,
            "model_loaded": MODEL is not None,
            "device": MODEL_DEVICE,
        }
    if cmd == "prepare":
        load_model()
        return {"prepared": True, "engine": ENGINE, "device": MODEL_DEVICE}
    if cmd == "generate":
        return generate(payload)
    if cmd == "stop":
        emit({"id": payload.get("id"), "ok": True, "stopping": True})
        raise SystemExit(0)
    raise RuntimeError(f"Comando desconocido: {cmd}")


emit({"type": "ready", "ok": True, "engine": ENGINE})
for raw in sys.stdin:
    raw = raw.strip()
    if not raw:
        continue
    request_id = ""
    try:
        payload = json.loads(raw)
        request_id = str(payload.get("id") or "")
        result = handle(payload)
        emit({"id": request_id, "ok": True, **result})
    except SystemExit:
        break
    except Exception as exc:
        emit(
            {
                "id": request_id,
                "ok": False,
                "error": str(exc),
                "trace": traceback.format_exc(limit=4)[-1800:],
            }
        )
