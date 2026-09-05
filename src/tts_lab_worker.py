import hashlib
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
MODEL_KEY = ""
VOICE_PROMPTS = {}
CHATTERBOX_BUILTIN = None
CHATTERBOX_ACTIVE_KEY = ""


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


def _device_name():
    return "cuda" if MODEL_DEVICE.startswith("cuda") else "cpu"


def load_model(model_path=""):
    global MODEL, MODEL_DEVICE, MODEL_KEY, VOICE_PROMPTS, CHATTERBOX_BUILTIN, CHATTERBOX_ACTIVE_KEY
    import torch

    use_cuda = bool(torch.cuda.is_available())
    requested = ""
    if ENGINE == "qwen3tts":
        requested = os.path.abspath(model_path) if model_path else "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
    else:
        requested = "chatterbox-v3"
    key = f"{ENGINE}:{requested}"
    if MODEL is not None and MODEL_KEY == key:
        return MODEL

    MODEL = None
    VOICE_PROMPTS = {}
    CHATTERBOX_ACTIVE_KEY = ""
    MODEL_DEVICE = "cuda" if use_cuda else "cpu"

    if ENGINE == "chatterbox":
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        try:
            MODEL = ChatterboxMultilingualTTS.from_pretrained(
                device=MODEL_DEVICE, t3_model="v3"
            )
        except TypeError:
            MODEL = ChatterboxMultilingualTTS.from_pretrained(device=MODEL_DEVICE)
        CHATTERBOX_BUILTIN = MODEL.conds
    elif ENGINE == "qwen3tts":
        from qwen_tts import Qwen3TTSModel

        kwargs = {
            "device_map": "cuda:0" if use_cuda else "cpu",
            "dtype": torch.bfloat16 if use_cuda else torch.float32,
        }
        MODEL = Qwen3TTSModel.from_pretrained(requested, **kwargs)
    else:
        raise RuntimeError(f"Motor no soportado: {ENGINE}")

    MODEL_KEY = key
    return MODEL


def chatterbox_conditionals(ref_audio="", cache_path="", exaggeration=0.5):
    global CHATTERBOX_ACTIVE_KEY
    model = load_model()

    if not ref_audio:
        if CHATTERBOX_BUILTIN is None:
            raise RuntimeError("Chatterbox no tiene una voz predeterminada disponible")
        model.conds = CHATTERBOX_BUILTIN
        CHATTERBOX_ACTIVE_KEY = "__builtin__"
        return

    if not os.path.isfile(ref_audio):
        raise RuntimeError("La voz de referencia seleccionada ya no existe")

    key = os.path.abspath(cache_path or ref_audio)
    if CHATTERBOX_ACTIVE_KEY == key and model.conds is not None:
        return

    loaded = False
    if cache_path and os.path.isfile(cache_path):
        try:
            from chatterbox.mtl_tts import Conditionals

            model.conds = Conditionals.load(cache_path, map_location="cpu").to(model.device)
            loaded = True
        except Exception:
            try:
                os.remove(cache_path)
            except Exception:
                pass

    if not loaded:
        model.prepare_conditionals(ref_audio, exaggeration=0.5)
        if cache_path:
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            model.conds.save(cache_path)

    CHATTERBOX_ACTIVE_KEY = key


def _pack_qwen_prompt(items):
    return {
        "ref_code": [it.ref_code for it in items],
        "ref_spk_embedding": [it.ref_spk_embedding for it in items],
        "x_vector_only_mode": [it.x_vector_only_mode for it in items],
        "icl_mode": [it.icl_mode for it in items],
    }


def qwen_prompt(ref_audio, ref_text, cache_path=""):
    import torch

    if not ref_audio or not os.path.isfile(ref_audio):
        raise RuntimeError("Selecciona una voz de referencia antes de usar Qwen3-TTS")
    ref_text = str(ref_text or "").strip()
    if not ref_text:
        raise RuntimeError("Qwen3-TTS necesita la transcripción exacta del audio de referencia")

    key = hashlib.sha1(
        (os.path.abspath(ref_audio) + "\n" + ref_text).encode("utf-8")
    ).hexdigest()
    if key in VOICE_PROMPTS:
        return VOICE_PROMPTS[key]

    packed = None
    if cache_path and os.path.isfile(cache_path):
        try:
            packed = torch.load(
                cache_path,
                map_location=MODEL_DEVICE,
                weights_only=True,
            )
        except Exception:
            packed = None
            try:
                os.remove(cache_path)
            except Exception:
                pass

    if packed is None:
        items = load_model().create_voice_clone_prompt(
            ref_audio=ref_audio,
            ref_text=ref_text,
            x_vector_only_mode=False,
        )
        packed = _pack_qwen_prompt(items)
        if cache_path:
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            torch.save(packed, cache_path)

    VOICE_PROMPTS[key] = packed
    return packed


def prepare_reference(payload):
    ref_audio = str(payload.get("reference") or "").strip()
    ref_text = str(payload.get("reference_text") or "").strip()
    cache_path = str(payload.get("cache_path") or "").strip()

    if ENGINE == "chatterbox":
        chatterbox_conditionals(ref_audio, cache_path, 0.5)
        return {
            "prepared_reference": True,
            "engine": ENGINE,
            "device": MODEL_DEVICE,
            "cache_path": cache_path,
        }

    if ENGINE == "qwen3tts":
        load_model()
        qwen_prompt(ref_audio, ref_text, cache_path)
        return {
            "prepared_reference": True,
            "engine": ENGINE,
            "device": MODEL_DEVICE,
            "cache_path": cache_path,
        }

    raise RuntimeError("Motor no soportado")


def generate_piece(text, ref_audio, ref_text, cache_path, style, params, qwen_mode, model_path, speaker):
    if ENGINE == "chatterbox":
        model = load_model()
        exaggeration = float(params.get("exaggeration", 0.42))
        cfg = float(params.get("cfgWeight", 0.35))
        temperature = float(params.get("temperature", 0.8))
        if style == "neutral":
            exaggeration, cfg = 0.50, 0.50
        elif style == "expressive":
            exaggeration, cfg = 0.62, 0.30

        chatterbox_conditionals(ref_audio, cache_path, exaggeration)
        wav = model.generate(
            text,
            language_id="es",
            audio_prompt_path=None,
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

        if qwen_mode == "finetuned":
            if not model_path or not os.path.isdir(model_path):
                raise RuntimeError("Selecciona un modelo Qwen3-TTS entrenado")
            if not speaker:
                raise RuntimeError("El modelo entrenado no declara un speaker válido")
            model = load_model(model_path)
            wavs, sr = model.generate_custom_voice(
                text=text,
                language="Spanish",
                speaker=speaker,
                max_new_tokens=2048,
                do_sample=True,
                top_k=50,
                top_p=1.0,
                temperature=temperature,
                repetition_penalty=1.05,
            )
        else:
            model = load_model()
            wavs, sr = model.generate_voice_clone(
                text=text,
                language="Spanish",
                voice_clone_prompt=qwen_prompt(ref_audio, ref_text, cache_path),
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
    ref_text = str(payload.get("reference_text") or "").strip()
    cache_path = str(payload.get("cache_path") or "").strip()
    output = str(payload.get("output") or "").strip()
    style = str(payload.get("style") or "news")
    params = payload.get("params") or {}
    qwen_mode = str(payload.get("qwen_mode") or "reference")
    model_path = str(payload.get("model_path") or "").strip()
    speaker = str(payload.get("speaker") or "").strip()

    if not text:
        raise RuntimeError("No hay texto para locutar")
    if ENGINE == "qwen3tts" and qwen_mode != "finetuned":
        if not ref_audio or not os.path.isfile(ref_audio):
            raise RuntimeError("Selecciona una voz de referencia antes de usar Qwen3-TTS")
        if not ref_text:
            raise RuntimeError("Qwen3-TTS necesita la transcripción exacta del audio de referencia")
    if ENGINE == "chatterbox" and ref_audio and not os.path.isfile(ref_audio):
        raise RuntimeError("La voz de referencia seleccionada ya no existe")
    if not output:
        raise RuntimeError("Ruta de salida inválida")

    started = time.perf_counter()
    pieces, sample_rate = [], 0
    text_chunks = chunks(text)
    for part in text_chunks:
        audio, sr = generate_piece(
            part,
            ref_audio,
            ref_text,
            cache_path,
            style,
            params,
            qwen_mode,
            model_path,
            speaker,
        )
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
        "chunks": len(text_chunks),
        "qwen_mode": qwen_mode if ENGINE == "qwen3tts" else "",
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
    if cmd == "prepare_reference":
        return prepare_reference(payload)
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
