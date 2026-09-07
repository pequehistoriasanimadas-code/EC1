import hashlib
import json
import math
import os
import re
import sys
import time
import traceback
import subprocess
import shutil
import gc

import numpy as np
import soundfile as sf

ENGINE = sys.argv[1] if len(sys.argv) > 1 else ""
MODEL = None
MODEL_DEVICE = ""
MODEL_KEY = ""
VOICE_PROMPTS = {}
CHATTERBOX_BUILTIN = None
CHATTERBOX_ACTIVE_KEY = ""
CHATTERBOX_VARIANT = ""
QWEN_BASE_REPO = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
QWEN_SHARED_FILES = [
    "generation_config.json",
    "merges.txt",
    "preprocessor_config.json",
    "tokenizer_config.json",
    "vocab.json",
    "speech_tokenizer/config.json",
    "speech_tokenizer/configuration.json",
    "speech_tokenizer/model.safetensors",
    "speech_tokenizer/preprocessor_config.json",
]
QWEN_BASE_MODEL_FILES = ["config.json", "model.safetensors", *QWEN_SHARED_FILES]
QWEN_PERF_REVISION = 1


def qwen_runtime_params(params=None):
    params = params or {}
    dtype_mode = str(params.get("dtypeMode") or "bf16").lower()
    if dtype_mode not in ("bf16", "fp16"):
        dtype_mode = "bf16"
    attention_mode = str(params.get("attentionMode") or "auto").lower()
    if attention_mode not in ("auto", "sdpa", "eager", "flash_attention_2"):
        attention_mode = "auto"
    chunk_chars = max(240, min(900, int(params.get("chunkChars") or 360)))
    return {"dtypeMode": dtype_mode, "attentionMode": attention_mode, "chunkChars": chunk_chars}


def qwen_capabilities():
    info = torch_runtime_info()
    flash_available = False
    flash_version = ""
    try:
        import flash_attn
        flash_available = True
        flash_version = str(getattr(flash_attn, "__version__", ""))
    except Exception:
        pass
    return {
        **info,
        "flash_attention_2": flash_available,
        "flash_attention_version": flash_version,
        "sdpa": True,
        "fp16": True,
        "bf16": True,
        "performance_revision": QWEN_PERF_REVISION,
    }



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


def nvidia_gpu_name():
    try:
        proc = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if proc.returncode == 0:
            return (proc.stdout or "").strip().splitlines()[0].strip()
    except Exception:
        pass
    return ""


def torch_runtime_info():
    import torch

    available = bool(torch.cuda.is_available())
    gpu = ""
    if available:
        try:
            gpu = str(torch.cuda.get_device_name(0))
        except Exception:
            gpu = ""
    vram_mb = 0
    if available:
        try:
            vram_mb = int(torch.cuda.get_device_properties(0).total_memory / (1024 * 1024))
        except Exception:
            vram_mb = 0
    return {
        "cuda_available": available,
        "gpu_name": gpu or nvidia_gpu_name(),
        "gpu_vram_mb": vram_mb,
        "torch_version": str(getattr(torch, "__version__", "")),
        "torch_cuda": str(getattr(getattr(torch, "version", None), "cuda", "") or ""),
    }


def ensure_cuda_consistency():
    info = torch_runtime_info()
    # If Windows can see an NVIDIA GPU, silently falling back to CPU means
    # the experimental runtime loaded a CPU-only/incompatible PyTorch wheel.
    if info["gpu_name"] and not info["cuda_available"]:
        raise RuntimeError(
            "Se detectó una GPU NVIDIA (" + info["gpu_name"] + ") pero PyTorch CUDA no está disponible. "
            "Repara o reinstala el motor para instalar el runtime CUDA de GEC."
        )
    return info


def _device_name():
    return "cuda" if MODEL_DEVICE.startswith("cuda") else "cpu"


def _release_model_memory():
    global MODEL, MODEL_KEY, VOICE_PROMPTS, CHATTERBOX_BUILTIN, CHATTERBOX_ACTIVE_KEY, CHATTERBOX_VARIANT
    MODEL = None
    MODEL_KEY = ""
    VOICE_PROMPTS = {}
    CHATTERBOX_BUILTIN = None
    CHATTERBOX_ACTIVE_KEY = ""
    CHATTERBOX_VARIANT = ""
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            try:
                torch.cuda.ipc_collect()
            except Exception:
                pass
    except Exception:
        pass


def _link_or_copy(src, dst):
    if os.path.isfile(dst):
        return False
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    try:
        os.link(src, dst)
    except Exception:
        shutil.copy2(src, dst)
    return True


def _qwen_base_snapshot(include_model=False):
    from huggingface_hub import snapshot_download, hf_hub_download
    token = os.getenv("HF_TOKEN")
    required = QWEN_BASE_MODEL_FILES if include_model else QWEN_SHARED_FILES
    try:
        base = snapshot_download(
            repo_id=QWEN_BASE_REPO,
            repo_type="model",
            allow_patterns=required,
            token=token,
        )
    except Exception as exc:
        raise RuntimeError(f"Qwen3-TTS no pudo descargar sus componentes: {exc}") from exc
    missing = [rel for rel in required if not os.path.isfile(os.path.join(base, *rel.split("/")))]
    if missing:
        for rel in missing:
            try:
                hf_hub_download(repo_id=QWEN_BASE_REPO, filename=rel, token=token, force_download=True)
            except Exception as exc:
                raise RuntimeError(f"Qwen3-TTS no pudo reparar {rel}: {exc}") from exc
        base = snapshot_download(repo_id=QWEN_BASE_REPO, repo_type="model", allow_patterns=required, token=token)
    missing = [rel for rel in required if not os.path.isfile(os.path.join(base, *rel.split("/")))]
    if missing:
        raise RuntimeError("Qwen3-TTS está incompleto: faltan " + ", ".join(missing[:4]))
    return os.path.abspath(base)


def ensure_qwen_assets(model_path=""):
    base = _qwen_base_snapshot(include_model=not bool(model_path))
    if not model_path:
        return base, []
    target = os.path.abspath(model_path)
    if not os.path.isdir(target):
        raise RuntimeError("El modelo Qwen3-TTS entrenado seleccionado ya no existe")
    if not os.path.isfile(os.path.join(target, "config.json")) or not os.path.isfile(os.path.join(target, "model.safetensors")):
        raise RuntimeError("El modelo Qwen3-TTS entrenado está incompleto: faltan config.json o model.safetensors")
    repaired = []
    for rel in QWEN_SHARED_FILES:
        src = os.path.join(base, *rel.split("/"))
        dst = os.path.join(target, *rel.split("/"))
        if _link_or_copy(src, dst):
            repaired.append(rel)
    missing = [rel for rel in QWEN_SHARED_FILES if not os.path.isfile(os.path.join(target, *rel.split("/")))]
    if missing:
        raise RuntimeError("El modelo Qwen3-TTS entrenado no pudo repararse: faltan " + ", ".join(missing[:4]))
    return target, repaired


def validate_qwen_model(model_path="", speaker=""):
    resolved, repaired = ensure_qwen_assets(model_path)
    if model_path and not str(speaker or "").strip():
        raise RuntimeError("El modelo Qwen3-TTS entrenado no declara un speaker válido")
    return {"model_path": resolved, "repaired": repaired, "shared_assets_ok": True}


def load_chatterbox_latam(device):
    import torch
    from pathlib import Path
    from huggingface_hub import snapshot_download, hf_hub_download
    from safetensors.torch import load_file as load_safetensors
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    from chatterbox.models.t3 import T3
    from chatterbox.models.t3.modules.t3_config import T3Config
    from chatterbox.models.s3gen import S3Gen
    from chatterbox.models.tokenizers import MTLTokenizer
    from chatterbox.models.voice_encoder import VoiceEncoder

    repo_id = "ResembleAI/Chatterbox-Multilingual-es-mx-latam"
    base_dir = Path(
        snapshot_download(
            repo_id="ResembleAI/chatterbox",
            repo_type="model",
            revision="main",
            allow_patterns=["ve.pt"],
            token=os.getenv("HF_TOKEN"),
        )
    )
    t3_path = Path(hf_hub_download(repo_id=repo_id, filename="t3_es_mx_latam.safetensors", token=os.getenv("HF_TOKEN")))
    s3_path = Path(hf_hub_download(repo_id=repo_id, filename="s3gen_v3.pt", token=os.getenv("HF_TOKEN")))
    tok_path = Path(hf_hub_download(repo_id=repo_id, filename="grapheme_mtl_merged_expanded_v1.json", token=os.getenv("HF_TOKEN")))

    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(base_dir / "ve.pt", weights_only=True, map_location="cpu"))
    ve.to(device).eval()

    t3 = T3(T3Config.multilingual())
    t3_state = load_safetensors(t3_path)
    if "model" in t3_state.keys():
        t3_state = t3_state["model"][0]
    t3.load_state_dict(t3_state)
    t3.to(device).eval()

    s3gen = S3Gen()
    s3gen.load_state_dict(torch.load(s3_path, weights_only=True, map_location="cpu"), strict=False)
    s3gen.to(device).eval()

    tokenizer = MTLTokenizer(str(tok_path))
    return ChatterboxMultilingualTTS(t3, s3gen, ve, tokenizer, device, conds=None)


def load_model(model_path="", chatterbox_variant="latam", qwen_params=None):
    global MODEL, MODEL_DEVICE, MODEL_KEY, VOICE_PROMPTS, CHATTERBOX_BUILTIN, CHATTERBOX_ACTIVE_KEY, CHATTERBOX_VARIANT
    import torch

    runtime = ensure_cuda_consistency()
    use_cuda = bool(runtime["cuda_available"])
    if use_cuda:
        try:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            torch.backends.cudnn.benchmark = True
        except Exception:
            pass
    requested = ""
    perf = qwen_runtime_params(qwen_params) if ENGINE == "qwen3tts" else None
    if ENGINE == "qwen3tts":
        requested, _ = ensure_qwen_assets(os.path.abspath(model_path) if model_path else "")
    else:
        chatterbox_variant = "multilingual" if str(chatterbox_variant) == "multilingual" else "latam"
        requested = "chatterbox-" + chatterbox_variant
    key = f"{ENGINE}:{requested}:{perf['dtypeMode']}:{perf['attentionMode']}" if ENGINE == "qwen3tts" else f"{ENGINE}:{requested}"
    if MODEL is not None and MODEL_KEY == key:
        return MODEL

    _release_model_memory()
    MODEL_DEVICE = "cuda" if use_cuda else "cpu"

    if ENGINE == "chatterbox":
        # Perth exposes PerthImplicitWatermarker=None when one of its optional
        # Windows/runtime imports fails. Chatterbox calls it unconditionally
        # in its constructor, which otherwise raises: 'NoneType' object is not callable.
        # Use Perth's own compatibility watermarker so synthesis can continue.
        import perth
        if not callable(getattr(perth, "PerthImplicitWatermarker", None)):
            from perth import DummyWatermarker
            perth.PerthImplicitWatermarker = DummyWatermarker

        from chatterbox.mtl_tts import ChatterboxMultilingualTTS

        try:
            if chatterbox_variant == "latam":
                MODEL = load_chatterbox_latam(MODEL_DEVICE)
            else:
                try:
                    MODEL = ChatterboxMultilingualTTS.from_pretrained(
                        device=MODEL_DEVICE, t3_model="v3"
                    )
                except TypeError as exc:
                    if "t3_model" not in str(exc):
                        raise
                    MODEL = ChatterboxMultilingualTTS.from_pretrained(device=MODEL_DEVICE)
        except Exception as exc:
            raise RuntimeError(f"Chatterbox no pudo cargar el modelo {chatterbox_variant}: {exc}") from exc
        CHATTERBOX_BUILTIN = MODEL.conds
        CHATTERBOX_VARIANT = chatterbox_variant
    elif ENGINE == "qwen3tts":
        from qwen_tts import Qwen3TTSModel

        dtype = torch.float32
        if use_cuda:
            dtype = torch.float16 if perf["dtypeMode"] == "fp16" else torch.bfloat16
        kwargs = {
            "device_map": "cuda:0" if use_cuda else "cpu",
            "dtype": dtype,
        }
        if perf["attentionMode"] != "auto":
            if perf["attentionMode"] == "flash_attention_2" and not qwen_capabilities().get("flash_attention_2"):
                raise RuntimeError("Flash Attention 2 no está disponible en este runtime de Windows")
            kwargs["attn_implementation"] = perf["attentionMode"]
        try:
            MODEL = Qwen3TTSModel.from_pretrained(requested, **kwargs)
        except Exception as exc:
            raise RuntimeError(f"Qwen3-TTS no pudo cargar con {perf['dtypeMode']} / {perf['attentionMode']}: {exc}") from exc
    else:
        raise RuntimeError(f"Motor no soportado: {ENGINE}")

    MODEL_KEY = key
    return MODEL


def chatterbox_conditionals(ref_audio="", cache_path="", exaggeration=0.5, variant="latam"):
    global CHATTERBOX_ACTIVE_KEY
    variant = "multilingual" if str(variant) == "multilingual" else "latam"
    model = load_model(chatterbox_variant=variant)

    if not ref_audio:
        if CHATTERBOX_BUILTIN is None:
            raise RuntimeError("Chatterbox LatAm necesita una voz de referencia" if variant == "latam" else "Chatterbox no tiene una voz predeterminada disponible")
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
        try:
            model.prepare_conditionals(ref_audio, exaggeration=0.5)
        except Exception as exc:
            raise RuntimeError(f"Chatterbox no pudo preparar la voz de referencia: {exc}") from exc
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


def qwen_prompt(ref_audio, ref_text, cache_path="", params=None):
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
        items = load_model(qwen_params=params).create_voice_clone_prompt(
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
    params = payload.get("params") or {}

    if ENGINE == "chatterbox":
        variant = "multilingual" if str(params.get("variant") or "") == "multilingual" else "latam"
        chatterbox_conditionals(ref_audio, cache_path, 0.5, variant)
        info = torch_runtime_info()
        return {
            "prepared_reference": True,
            "engine": ENGINE,
            "device": MODEL_DEVICE,
            "cache_path": cache_path,
            "variant": variant if ENGINE == "chatterbox" else "",
            **info,
        }

    if ENGINE == "qwen3tts":
        load_model(qwen_params=params)
        qwen_prompt(ref_audio, ref_text, cache_path, params)
        info = torch_runtime_info()
        return {
            "prepared_reference": True,
            "engine": ENGINE,
            "device": MODEL_DEVICE,
            "cache_path": cache_path,
            **info,
        }

    raise RuntimeError("Motor no soportado")


def generate_piece(text, ref_audio, ref_text, cache_path, style, params, qwen_mode, model_path, speaker):
    if ENGINE == "chatterbox":
        variant = "multilingual" if str(params.get("variant") or "") == "multilingual" else "latam"
        model = load_model(chatterbox_variant=variant)
        exaggeration = float(params.get("exaggeration", 0.42))
        cfg = float(params.get("cfgWeight", 0.35))
        temperature = float(params.get("temperature", 0.8))
        # Estilo is resolved by the UI as a visible preset. The worker always
        # respects the values displayed to the user instead of silently
        # overriding Exaggeration / CFG.
        chatterbox_conditionals(ref_audio, cache_path, exaggeration, variant)
        try:
            wav = model.generate(
                text,
                language_id="es",
                audio_prompt_path=None,
                exaggeration=exaggeration,
                cfg_weight=cfg,
                temperature=temperature,
            )
        except Exception as exc:
            raise RuntimeError(f"Chatterbox falló al sintetizar audio: {exc}") from exc
        arr = wav.detach().float().cpu().numpy()
        if arr.ndim > 1:
            arr = arr[0]
        return arr.astype(np.float32), int(model.sr)

    if ENGINE == "qwen3tts":
        temperature = float(params.get("temperature", 0.78))

        if qwen_mode == "finetuned":
            if not model_path or not os.path.isdir(model_path):
                raise RuntimeError("Selecciona un modelo Qwen3-TTS entrenado")
            if not speaker:
                raise RuntimeError("El modelo entrenado no declara un speaker válido")
            model = load_model(model_path, qwen_params=params)
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
            model = load_model(qwen_params=params)
            wavs, sr = model.generate_voice_clone(
                text=text,
                language="Spanish",
                voice_clone_prompt=qwen_prompt(ref_audio, ref_text, cache_path, params),
                max_new_tokens=2048,
                do_sample=True,
                top_k=50,
                top_p=1.0,
                temperature=temperature,
                repetition_penalty=1.05,
            )
        return np.asarray(wavs[0], dtype=np.float32), int(sr)

    raise RuntimeError("Motor no soportado")


def time_stretch_preserve_pitch(audio, sample_rate, speed):
    speed = max(0.85, min(1.25, float(speed or 1.0)))
    if abs(speed - 1.0) < 0.001 or len(audio) < 2048:
        return np.asarray(audio, dtype=np.float32)
    try:
        import torch
        import torchaudio.functional as AF

        wav = torch.as_tensor(np.asarray(audio, dtype=np.float32))
        n_fft = 1024
        hop = 256
        window = torch.hann_window(n_fft, dtype=wav.dtype)
        spec = torch.stft(
            wav,
            n_fft=n_fft,
            hop_length=hop,
            win_length=n_fft,
            window=window,
            return_complex=True,
        )
        phase_advance = torch.linspace(
            0,
            math.pi * hop,
            spec.shape[-2],
            dtype=wav.dtype,
        )[:, None]
        stretched = AF.phase_vocoder(spec, rate=speed, phase_advance=phase_advance)
        target = max(1, int(round(len(wav) / speed)))
        out = torch.istft(
            stretched,
            n_fft=n_fft,
            hop_length=hop,
            win_length=n_fft,
            window=window,
            length=target,
        )
        return out.detach().cpu().numpy().astype(np.float32)
    except Exception as exc:
        raise RuntimeError(f"No se pudo aplicar la velocidad de lectura {speed:.2f}x conservando el tono: {exc}") from exc


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
    speed = max(0.85, min(1.25, float(params.get("speed", 1.0) or 1.0)))

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

    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()
    except Exception:
        pass
    started = time.perf_counter()
    pieces, sample_rate = [], 0
    text_chunks = chunks(text, qwen_runtime_params(params)["chunkChars"] if ENGINE == "qwen3tts" else 360)
    request_id = str(payload.get("id") or "")
    for idx, part in enumerate(text_chunks):
        emit({"type": "progress", "id": request_id, "phase": "chunk-start", "chunk": idx + 1, "chunks": len(text_chunks)})
        chunk_started = time.perf_counter()
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
        emit({"type": "progress", "id": request_id, "phase": "chunk-done", "chunk": idx + 1, "chunks": len(text_chunks), "elapsed_ms": round((time.perf_counter() - chunk_started) * 1000)})

    if not pieces or not sample_rate:
        raise RuntimeError("El motor no produjo audio")

    emit({"type": "progress", "id": request_id, "phase": "postprocess", "chunks": len(text_chunks)})
    audio = np.concatenate(pieces)
    if abs(speed - 1.0) >= 0.001:
        audio = time_stretch_preserve_pitch(audio, sample_rate, speed)
    os.makedirs(os.path.dirname(output), exist_ok=True)
    sf.write(output, audio, sample_rate)
    elapsed = time.perf_counter() - started
    duration = len(audio) / float(sample_rate)
    info = torch_runtime_info()
    peak_allocated_mb = 0
    peak_reserved_mb = 0
    try:
        import torch
        if torch.cuda.is_available():
            peak_allocated_mb = int(torch.cuda.max_memory_allocated() / (1024 * 1024))
            peak_reserved_mb = int(torch.cuda.max_memory_reserved() / (1024 * 1024))
    except Exception:
        pass
    return {
        "output": output,
        "duration_sec": round(duration, 3),
        "elapsed_ms": round(elapsed * 1000),
        "rtf": round(elapsed / duration, 3) if duration > 0 else 0,
        "device": MODEL_DEVICE,
        "chunks": len(text_chunks),
        "cuda_peak_allocated_mb": peak_allocated_mb,
        "cuda_peak_reserved_mb": peak_reserved_mb,
        "qwen_mode": qwen_mode if ENGINE == "qwen3tts" else "",
        "qwen_runtime": qwen_runtime_params(params) if ENGINE == "qwen3tts" else {},
        "speed": round(speed, 3),
        "variant": ("multilingual" if str(params.get("variant") or "") == "multilingual" else "latam") if ENGINE == "chatterbox" else "",
        **info,
    }


def handle(payload):
    cmd = str(payload.get("cmd") or "")
    if cmd == "ping":
        info = torch_runtime_info()
        return {
            "ready": True,
            "engine": ENGINE,
            "model_loaded": MODEL is not None,
            "device": MODEL_DEVICE,
            **info,
        }
    if cmd == "capabilities":
        return {"engine": ENGINE, **qwen_capabilities()} if ENGINE == "qwen3tts" else {"engine": ENGINE, **torch_runtime_info()}
    if cmd == "prepare":
        params = payload.get("params") or {}
        variant = "multilingual" if str(params.get("variant") or "") == "multilingual" else "latam"
        qwen_mode = str(payload.get("qwen_mode") or params.get("voiceMode") or "reference")
        model_path = str(payload.get("model_path") or "").strip()
        speaker = str(payload.get("speaker") or "").strip()
        repaired = []
        if ENGINE == "chatterbox":
            load_model(chatterbox_variant=variant)
        elif ENGINE == "qwen3tts":
            if qwen_mode == "finetuned":
                validated = validate_qwen_model(model_path, speaker)
                repaired = validated.get("repaired") or []
                load_model(validated["model_path"], qwen_params=params)
            else:
                validated = validate_qwen_model("", "")
                load_model(validated["model_path"], qwen_params=params)
        else:
            raise RuntimeError("Motor no soportado")
        info = torch_runtime_info()
        return {"prepared": True, "engine": ENGINE, "device": MODEL_DEVICE, "variant": variant if ENGINE == "chatterbox" else "", "qwen_mode": qwen_mode if ENGINE == "qwen3tts" else "", "model_key": MODEL_KEY, "repaired_assets": repaired, **info}
    if cmd == "validate_qwen":
        model_path = str(payload.get("model_path") or "").strip()
        speaker = str(payload.get("speaker") or "").strip()
        result = validate_qwen_model(model_path, speaker)
        return {"validated": True, "engine": ENGINE, **result}
    if cmd == "release":
        _release_model_memory()
        return {"released": True, "engine": ENGINE, **torch_runtime_info()}
    if cmd == "prepare_reference":
        return prepare_reference(payload)
    if cmd == "generate":
        return generate(payload)
    if cmd == "stop":
        _release_model_memory()
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
