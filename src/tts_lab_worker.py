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
import threading
import ctypes

import numpy as np
import soundfile as sf

ENGINE = sys.argv[1] if len(sys.argv) > 1 else ""
MODEL = None
MODEL_DEVICE = ""
MODEL_KEY = ""
MODEL_REQUEST_KEY = ""
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
QWEN_PERF_REVISION = 3
QWEN_SHARED_REVISION = 2


def qwen_runtime_params(params=None):
    params = params or {}
    dtype_mode = str(params.get("dtypeMode") or "bf16").lower()
    if dtype_mode not in ("bf16", "fp16"):
        dtype_mode = "bf16"
    attention_mode = str(params.get("attentionMode") or "auto").lower()
    if attention_mode not in ("auto", "sdpa", "eager", "flash_attention_2"):
        attention_mode = "auto"
    chunk_chars = max(240, min(900, int(params.get("chunkChars") or 360)))
    non_streaming = params.get("nonStreamingMode", None)
    use_cache = params.get("useCache", True) is not False
    cache_impl = str(params.get("cacheImplementation") or "auto").lower()
    if cache_impl not in ("auto", "dynamic", "static"):
        cache_impl = "auto"
    return {
        "dtypeMode": dtype_mode,
        "attentionMode": attention_mode,
        "chunkChars": chunk_chars,
        "nonStreamingMode": None if non_streaming is None else bool(non_streaming),
        # Kept for settings/backward compatibility. qwen_tts 0.1.1 drops these kwargs
        # before they reach HuggingFace, so lab.19 no longer benchmarks them.
        "useCache": use_cache,
        "cacheImplementation": cache_impl,
        "benchmarkDeterministic": bool(params.get("benchmarkDeterministic")),
        "profileStages": bool(params.get("profileStages")),
    }


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


_NVML_LIB = None
_NVML_HANDLE = None
_NVML_INIT_ATTEMPTED = False


class _NvmlUtilization(ctypes.Structure):
    _fields_ = [("gpu", ctypes.c_uint), ("memory", ctypes.c_uint)]


class _NvmlMemory(ctypes.Structure):
    _fields_ = [("total", ctypes.c_ulonglong), ("free", ctypes.c_ulonglong), ("used", ctypes.c_ulonglong)]


def _nvml_init():
    global _NVML_LIB, _NVML_HANDLE, _NVML_INIT_ATTEMPTED
    if _NVML_INIT_ATTEMPTED:
        return _NVML_LIB is not None and _NVML_HANDLE is not None
    _NVML_INIT_ATTEMPTED = True
    if os.name != "nt" or not hasattr(ctypes, "WinDLL"):
        return False
    try:
        lib = ctypes.WinDLL("nvml.dll")
        lib.nvmlInit_v2.restype = ctypes.c_int
        lib.nvmlDeviceGetHandleByIndex_v2.argtypes = [ctypes.c_uint, ctypes.POINTER(ctypes.c_void_p)]
        lib.nvmlDeviceGetHandleByIndex_v2.restype = ctypes.c_int
        if lib.nvmlInit_v2() != 0:
            return False
        handle = ctypes.c_void_p()
        if lib.nvmlDeviceGetHandleByIndex_v2(0, ctypes.byref(handle)) != 0:
            return False
        _NVML_LIB, _NVML_HANDLE = lib, handle
        return True
    except Exception:
        _NVML_LIB, _NVML_HANDLE = None, None
        return False


def _gpu_sample_once():
    if not _nvml_init():
        return None
    lib, handle = _NVML_LIB, _NVML_HANDLE
    try:
        util = _NvmlUtilization()
        mem = _NvmlMemory()
        temp = ctypes.c_uint(0)
        power = ctypes.c_uint(0)
        clock = ctypes.c_uint(0)
        pstate = ctypes.c_uint(0)
        gpu_util = 0.0
        used_mb = 0.0
        temperature = 0.0
        power_w = 0.0
        clock_mhz = 0.0
        state = ""
        try:
            if lib.nvmlDeviceGetUtilizationRates(handle, ctypes.byref(util)) == 0:
                gpu_util = float(util.gpu)
        except Exception:
            pass
        try:
            if lib.nvmlDeviceGetMemoryInfo(handle, ctypes.byref(mem)) == 0:
                used_mb = float(mem.used) / (1024.0 * 1024.0)
        except Exception:
            pass
        try:
            if lib.nvmlDeviceGetTemperature(handle, 0, ctypes.byref(temp)) == 0:
                temperature = float(temp.value)
        except Exception:
            pass
        try:
            if lib.nvmlDeviceGetPowerUsage(handle, ctypes.byref(power)) == 0:
                power_w = float(power.value) / 1000.0
        except Exception:
            pass
        try:
            if lib.nvmlDeviceGetClockInfo(handle, 0, ctypes.byref(clock)) == 0:
                clock_mhz = float(clock.value)
        except Exception:
            pass
        try:
            if lib.nvmlDeviceGetPerformanceState(handle, ctypes.byref(pstate)) == 0:
                state = "P" + str(int(pstate.value))
        except Exception:
            pass
        return {
            "gpu_util_pct": gpu_util,
            "vram_used_mb": used_mb,
            "temperature_c": temperature,
            "power_w": power_w,
            "graphics_clock_mhz": clock_mhz,
            "pstate": state,
        }
    except Exception:
        return None


def _gpu_sampler(enabled):
    samples = []
    stop = threading.Event()
    if not enabled:
        return stop, None, samples
    def run():
        deadline = time.time() + 600
        while not stop.is_set() and time.time() < deadline:
            sample = _gpu_sample_once()
            if sample:
                samples.append(sample)
            stop.wait(0.10)
    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return stop, thread, samples


def _gpu_summary(samples):
    if not samples:
        return {"samples": 0}
    def avg(key):
        vals = [float(x.get(key) or 0) for x in samples]
        return round(sum(vals) / len(vals), 2) if vals else 0
    def peak(key):
        vals = [float(x.get(key) or 0) for x in samples]
        return round(max(vals), 2) if vals else 0
    states = {}
    for sample in samples:
        state = str(sample.get("pstate") or "")
        if state:
            states[state] = states.get(state, 0) + 1
    return {
        "samples": len(samples),
        "gpu_util_avg_pct": avg("gpu_util_pct"),
        "gpu_util_max_pct": peak("gpu_util_pct"),
        "power_avg_w": avg("power_w"),
        "power_max_w": peak("power_w"),
        "vram_max_mb": peak("vram_used_mb"),
        "temperature_max_c": peak("temperature_c"),
        "graphics_clock_avg_mhz": avg("graphics_clock_mhz"),
        "graphics_clock_max_mhz": peak("graphics_clock_mhz"),
        "pstates": states,
    }


def _cuda_sync():
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.synchronize()
    except Exception:
        pass


def _timed_qwen_wrapper(model, call, profile_steps=False):
    timings = {
        "autoregressive_ms": 0,
        "decode_ms": 0,
        "code_predictor_ms": 0,
        "code_predictor_calls": 0,
        "code_predictor_steps": 0,
        "talker_steps": 0,
        "prefill_tokens": 0,
    }
    core = getattr(model, "model", None)
    tokenizer = getattr(core, "speech_tokenizer", None) if core is not None else None
    talker = getattr(core, "talker", None) if core is not None else None
    predictor = getattr(talker, "code_predictor", None) if talker is not None else None
    original_generate = getattr(core, "generate", None) if core is not None else None
    original_decode = getattr(tokenizer, "decode", None) if tokenizer is not None else None
    original_talker_generate = getattr(talker, "generate", None) if talker is not None else None
    original_predictor_generate = getattr(predictor, "generate", None) if predictor is not None else None

    if not callable(original_generate) or not callable(original_decode):
        _cuda_sync()
        started = time.perf_counter()
        result = call()
        _cuda_sync()
        timings["model_call_ms"] = round((time.perf_counter() - started) * 1000)
        return result, timings

    def timed_generate(*args, **kwargs):
        _cuda_sync()
        started = time.perf_counter()
        try:
            return original_generate(*args, **kwargs)
        finally:
            _cuda_sync()
            timings["autoregressive_ms"] += round((time.perf_counter() - started) * 1000)

    def timed_decode(*args, **kwargs):
        _cuda_sync()
        started = time.perf_counter()
        try:
            return original_decode(*args, **kwargs)
        finally:
            _cuda_sync()
            timings["decode_ms"] += round((time.perf_counter() - started) * 1000)

    def timed_talker_generate(*args, **kwargs):
        for key in ("inputs_embeds", "input_ids"):
            value = kwargs.get(key)
            shape = getattr(value, "shape", None)
            if shape is not None and len(shape) >= 2:
                try:
                    timings["prefill_tokens"] = max(timings["prefill_tokens"], int(shape[1]))
                except Exception:
                    pass
                break
        return original_talker_generate(*args, **kwargs)

    def timed_predictor_generate(*args, **kwargs):
        _cuda_sync()
        started = time.perf_counter()
        result = original_predictor_generate(*args, **kwargs)
        _cuda_sync()
        timings["code_predictor_ms"] += round((time.perf_counter() - started) * 1000)
        timings["code_predictor_calls"] += 1
        timings["talker_steps"] += 1
        seq = getattr(result, "sequences", None)
        shape = getattr(seq, "shape", None)
        if shape is not None and len(shape):
            try:
                timings["code_predictor_steps"] += int(shape[-1])
            except Exception:
                pass
        return result

    core.generate = timed_generate
    tokenizer.decode = timed_decode
    if profile_steps and callable(original_talker_generate):
        talker.generate = timed_talker_generate
    if profile_steps and callable(original_predictor_generate):
        predictor.generate = timed_predictor_generate

    _cuda_sync()
    started = time.perf_counter()
    try:
        result = call()
    finally:
        _cuda_sync()
        core.generate = original_generate
        tokenizer.decode = original_decode
        if profile_steps and callable(original_talker_generate):
            talker.generate = original_talker_generate
        if profile_steps and callable(original_predictor_generate):
            predictor.generate = original_predictor_generate

    total = round((time.perf_counter() - started) * 1000)
    timings["model_call_ms"] = total
    timings["wrapper_overhead_ms"] = max(0, total - timings["autoregressive_ms"] - timings["decode_ms"])
    if timings["code_predictor_steps"] > 0:
        timings["code_predictor_ms_per_step"] = round(
            timings["code_predictor_ms"] / timings["code_predictor_steps"], 3
        )
    else:
        timings["code_predictor_ms_per_step"] = 0.0
    return result, timings


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
    global MODEL, MODEL_KEY, MODEL_REQUEST_KEY, VOICE_PROMPTS, CHATTERBOX_BUILTIN, CHATTERBOX_ACTIVE_KEY, CHATTERBOX_VARIANT
    MODEL = None
    MODEL_KEY = ""
    MODEL_REQUEST_KEY = ""
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
    config_src = os.path.join(target, "config.json")
    model_src = os.path.join(target, "model.safetensors")
    if not os.path.isfile(config_src) or not os.path.isfile(model_src):
        raise RuntimeError("El modelo Qwen3-TTS entrenado está incompleto: faltan config.json o model.safetensors")
    overlay_root = os.path.abspath(os.getenv("GEC_TTS_MODEL_OVERLAYS") or os.path.join(os.path.dirname(target), "_overlays"))
    key_src = target + "|" + str(os.path.getsize(model_src)) + "|" + str(os.path.getmtime(config_src)) + "|r" + str(QWEN_SHARED_REVISION)
    key = hashlib.sha1(key_src.encode("utf-8")).hexdigest()[:20]
    overlay = os.path.join(overlay_root, key + "-r" + str(QWEN_SHARED_REVISION))
    os.makedirs(overlay, exist_ok=True)
    repaired = []
    for rel, src in [("config.json", config_src), ("model.safetensors", model_src)]:
        dst = os.path.join(overlay, *rel.split("/"))
        if _link_or_copy(src, dst):
            repaired.append("overlay:" + rel)
    for rel in QWEN_SHARED_FILES:
        src = os.path.join(base, *rel.split("/"))
        dst = os.path.join(overlay, *rel.split("/"))
        if os.path.isfile(dst):
            try:
                if os.path.getsize(dst) != os.path.getsize(src):
                    os.remove(dst)
            except Exception:
                try:
                    os.remove(dst)
                except Exception:
                    pass
        if _link_or_copy(src, dst):
            repaired.append("overlay:" + rel)
    required = ["config.json", "model.safetensors", *QWEN_SHARED_FILES]
    missing = [rel for rel in required if not os.path.isfile(os.path.join(overlay, *rel.split("/")))]
    if missing:
        raise RuntimeError("El overlay seguro de Qwen3-TTS está incompleto: faltan " + ", ".join(missing[:4]))
    for rel in QWEN_SHARED_FILES:
        src = os.path.join(base, *rel.split("/"))
        dst = os.path.join(overlay, *rel.split("/"))
        if os.path.getsize(src) != os.path.getsize(dst):
            raise RuntimeError("El overlay seguro de Qwen3-TTS tiene un componente inválido: " + rel)
    return overlay, repaired


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
    global MODEL, MODEL_DEVICE, MODEL_KEY, MODEL_REQUEST_KEY, VOICE_PROMPTS, CHATTERBOX_BUILTIN, CHATTERBOX_ACTIVE_KEY, CHATTERBOX_VARIANT
    import torch

    runtime = ensure_cuda_consistency()
    use_cuda = bool(runtime["cuda_available"])
    if use_cuda:
        try:
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            torch.backends.cudnn.benchmark = ENGINE != "qwen3tts"
            torch.set_float32_matmul_precision("high")
            try:
                torch.backends.cuda.enable_flash_sdp(True)
                torch.backends.cuda.enable_mem_efficient_sdp(True)
                torch.backends.cuda.enable_math_sdp(True)
            except Exception:
                pass
        except Exception:
            pass
    requested = ""
    perf = qwen_runtime_params(qwen_params) if ENGINE == "qwen3tts" else None
    request_hint = os.path.abspath(model_path) if (ENGINE == "qwen3tts" and model_path) else (QWEN_BASE_REPO if ENGINE == "qwen3tts" else "chatterbox-latam")
    request_key = f"{ENGINE}:{request_hint}:{perf['dtypeMode']}:{perf['attentionMode']}" if ENGINE == "qwen3tts" else f"{ENGINE}:{request_hint}"
    # Critical lab.19 fast path: do not resolve Hugging Face assets/network on every chunk
    # when the exact model is already resident in this persistent worker.
    if MODEL is not None and MODEL_REQUEST_KEY == request_key:
        return MODEL
    if ENGINE == "qwen3tts":
        requested, _ = ensure_qwen_assets(os.path.abspath(model_path) if model_path else "")
    else:
        chatterbox_variant = "latam"
        requested = "chatterbox-latam"
    key = f"{ENGINE}:{requested}:{perf['dtypeMode']}:{perf['attentionMode']}" if ENGINE == "qwen3tts" else f"{ENGINE}:{requested}"

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
            MODEL = load_chatterbox_latam(MODEL_DEVICE)
        except Exception as exc:
            raise RuntimeError(f"Chatterbox LatAm no pudo cargar el modelo: {exc}") from exc
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
    MODEL_REQUEST_KEY = request_key
    return MODEL


def chatterbox_conditionals(ref_audio="", cache_path="", exaggeration=0.5, variant="latam"):
    global CHATTERBOX_ACTIVE_KEY
    variant = "latam"
    model = load_model(chatterbox_variant="latam")

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
        variant = "latam"
        chatterbox_conditionals(ref_audio, cache_path, 0.5, "latam")
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
    piece_started = time.perf_counter()
    if ENGINE == "chatterbox":
        variant = "latam"
        model = load_model(chatterbox_variant="latam")
        exaggeration = float(params.get("exaggeration", 0.42))
        cfg = float(params.get("cfgWeight", 0.35))
        configured_temperature = float(params.get("temperature", 0.8))
        stable_mode = str(params.get("consistencyMode") or "automatic") in ("automatic", "stable-v1")
        production_temperature = float(params.get("productionTemperature", 0.60 if stable_mode else configured_temperature))
        temperature = max(0.10, min(1.50, production_temperature if stable_mode else configured_temperature))
        chatterbox_conditionals(ref_audio, cache_path, exaggeration, variant)
        model_call_started = time.perf_counter()
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
        model_call_ms = round((time.perf_counter() - model_call_started) * 1000)
        numpy_started = time.perf_counter()
        arr = wav.detach().float().cpu().numpy()
        if arr.ndim > 1:
            arr = arr[0]
        numpy_ms = round((time.perf_counter() - numpy_started) * 1000)
        return arr.astype(np.float32), int(model.sr), {
            "piece_total_ms": round((time.perf_counter() - piece_started) * 1000),
            "model_call_ms": model_call_ms,
            "numpy_ms": numpy_ms,
        }

    if ENGINE == "qwen3tts":
        configured_temperature = float(params.get("temperature", 0.78))
        production_temperature = float(params.get("productionTemperature", configured_temperature))
        temperature = max(0.10, min(1.50, production_temperature))
        perf = qwen_runtime_params(params)
        benchmark_deterministic = bool(perf["benchmarkDeterministic"])
        profile_steps = bool(perf["profileStages"])

        model_load_started = time.perf_counter()
        if qwen_mode == "finetuned":
            if not model_path or not os.path.isdir(model_path):
                raise RuntimeError("Selecciona un modelo Qwen3-TTS entrenado")
            if not speaker:
                raise RuntimeError("El modelo entrenado no declara un speaker válido")
            import torch
            model = load_model(model_path, qwen_params=params)
            stable_mode = str(params.get("consistencyMode") or "") == "stable-v1"
            non_streaming = True if perf["nonStreamingMode"] is None else bool(perf["nonStreamingMode"])
            model_load_ms = round((time.perf_counter() - model_load_started) * 1000)
            def qwen_call():
                with torch.inference_mode():
                    return model.generate_custom_voice(
                        text=text,
                        language="Spanish",
                        speaker=speaker,
                        non_streaming_mode=non_streaming,
                        max_new_tokens=2048,
                        do_sample=not benchmark_deterministic,
                        top_k=20 if stable_mode else 50,
                        top_p=0.90 if stable_mode else 1.0,
                        temperature=temperature,
                        repetition_penalty=1.05,
                    )
            (wavs, sr), call_timings = _timed_qwen_wrapper(model, qwen_call, profile_steps=profile_steps)
            prompt_ms = 0
        else:
            import torch
            model = load_model(qwen_params=params)
            stable_mode = str(params.get("consistencyMode") or "automatic") in ("automatic", "stable-v1")
            non_streaming = False if perf["nonStreamingMode"] is None else bool(perf["nonStreamingMode"])
            model_load_ms = round((time.perf_counter() - model_load_started) * 1000)
            prompt_started = time.perf_counter()
            prompt = qwen_prompt(ref_audio, ref_text, cache_path, params)
            prompt_ms = round((time.perf_counter() - prompt_started) * 1000)
            def qwen_call():
                with torch.inference_mode():
                    return model.generate_voice_clone(
                        text=text,
                        language="Spanish",
                        voice_clone_prompt=prompt,
                        non_streaming_mode=non_streaming,
                        max_new_tokens=2048,
                        do_sample=not benchmark_deterministic,
                        top_k=20 if stable_mode else 50,
                        top_p=0.90 if stable_mode else 1.0,
                        temperature=temperature,
                        repetition_penalty=1.05,
                    )
            (wavs, sr), call_timings = _timed_qwen_wrapper(model, qwen_call, profile_steps=profile_steps)

        numpy_started = time.perf_counter()
        arr = np.asarray(wavs[0], dtype=np.float32)
        numpy_ms = round((time.perf_counter() - numpy_started) * 1000)
        audio_sec = (len(arr) / float(sr)) if sr else 0.0
        core = getattr(model, "model", None)
        cfg = getattr(core, "config", None)
        code_groups = int(getattr(cfg, "num_code_groups", 16) or 16)
        if int(call_timings.get("talker_steps") or 0) <= 0 and audio_sec > 0:
            call_timings["talker_steps"] = max(1, int(round(audio_sec * 12.5)))
        if int(call_timings.get("code_predictor_steps") or 0) <= 0:
            call_timings["code_predictor_steps"] = int(call_timings.get("talker_steps") or 0) * max(0, code_groups - 1)
        call_timings["num_code_groups"] = code_groups
        return arr, int(sr), {
            "piece_total_ms": round((time.perf_counter() - piece_started) * 1000),
            "model_load_ms": model_load_ms,
            "prompt_ms": prompt_ms,
            "numpy_ms": numpy_ms,
            "non_streaming_mode": non_streaming,
            "benchmark_deterministic": benchmark_deterministic,
            **call_timings,
        }

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
    voice_session_id = str(payload.get("voice_session_id") or "")
    voice_config_fingerprint = str(payload.get("voice_config_fingerprint") or "")
    speed = 1.0

    if not text:
        raise RuntimeError("No hay texto para locutar")
    benchmark_seed = int(params.get("benchmarkSeed") or 0)
    production_seed = int(params.get("productionSeed") or 0)
    active_seed = benchmark_seed or production_seed
    if active_seed:
        try:
            import torch
            torch.manual_seed(active_seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(active_seed)
            np.random.seed(active_seed % (2**32 - 1))
        except Exception:
            pass
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
    gpu_stop, gpu_thread, gpu_samples = _gpu_sampler(ENGINE == "qwen3tts" and bool(params.get("profileGpu")))
    pieces, sample_rate = [], 0
    chunk_diagnostics = []
    piece_stage_diagnostics = []
    setup_ms = round((time.perf_counter() - started) * 1000)
    stable_mode = str(params.get("consistencyMode") or "automatic") in ("automatic", "stable-v1")
    chatter_chunk = max(300, min(900, int(params.get("chunkChars") or (540 if stable_mode else 360))))
    if ENGINE == "chatterbox" and bool(params.get("forceSingleChunk")):
        text_chunks = [text]
    else:
        text_chunks = chunks(text, qwen_runtime_params(params)["chunkChars"] if ENGINE == "qwen3tts" else chatter_chunk)
    request_id = str(payload.get("id") or "")
    for idx, part in enumerate(text_chunks):
        emit({"type": "progress", "id": request_id, "phase": "chunk-start", "chunk": idx + 1, "chunks": len(text_chunks)})
        chunk_started = time.perf_counter()
        stop_chunk_beat = threading.Event()
        def chunk_heartbeat():
            elapsed = 0
            while not stop_chunk_beat.wait(8):
                elapsed += 8
                emit({"type": "progress", "id": request_id, "phase": "chunk-heartbeat", "label": f"Generando fragmento {idx + 1}/{len(text_chunks)}…", "chunk": idx + 1, "chunks": len(text_chunks), "elapsed_sec": elapsed})
        chunk_beat = threading.Thread(target=chunk_heartbeat, daemon=True)
        chunk_beat.start()
        chunk_seed = active_seed if active_seed else 0
        if chunk_seed:
            try:
                import torch
                torch.manual_seed(chunk_seed)
                if torch.cuda.is_available():
                    torch.cuda.manual_seed_all(chunk_seed)
                np.random.seed(chunk_seed % (2**32 - 1))
            except Exception:
                pass
        try:
            audio, sr, piece_diag = generate_piece(
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
            piece_stage_diagnostics.append({"index": idx + 1, **piece_diag})
        except Exception:
            gpu_stop.set()
            if gpu_thread is not None:
                gpu_thread.join(timeout=4)
            raise
        finally:
            stop_chunk_beat.set()
            chunk_beat.join(timeout=1)
        sample_rate = sr
        chunk_elapsed_ms = round((time.perf_counter() - chunk_started) * 1000)
        chunk_audio_sec = round(len(audio) / float(sr), 3) if sr else 0
        chunk_diagnostics.append({
            "index": idx + 1,
            "chars": len(part),
            "elapsed_ms": chunk_elapsed_ms,
            "audio_sec": chunk_audio_sec,
            "talker_steps": int(piece_diag.get("talker_steps") or 0),
            "code_predictor_steps": int(piece_diag.get("code_predictor_steps") or 0),
            "prefill_tokens": int(piece_diag.get("prefill_tokens") or 0),
            "seed": chunk_seed,
            "temperature": round(float(params.get("productionTemperature", 0.60 if ENGINE == "chatterbox" else params.get("temperature", 0.78))), 3),
            "consistency_mode": str(params.get("consistencyMode") or "automatic"),
            "voice_session_id": voice_session_id,
            "voice_config_fingerprint": voice_config_fingerprint,
        })
        if pieces and sr:
            pieces.append(np.zeros(int(sr * 0.13), dtype=np.float32))
        pieces.append(audio)
        emit({"type": "progress", "id": request_id, "phase": "chunk-done", "chunk": idx + 1, "chunks": len(text_chunks), "elapsed_ms": chunk_elapsed_ms, "audio_sec": chunk_audio_sec, "seed": active_seed})

    if not pieces or not sample_rate:
        raise RuntimeError("El motor no produjo audio")

    emit({"type": "progress", "id": request_id, "phase": "postprocess", "chunks": len(text_chunks)})
    concat_started = time.perf_counter()
    audio = np.concatenate(pieces)
    concat_ms = round((time.perf_counter() - concat_started) * 1000)
    if not np.isfinite(audio).all():
        raise RuntimeError("Qwen3-TTS produjo muestras de audio no válidas con esta configuración")
    os.makedirs(os.path.dirname(output), exist_ok=True)
    write_started = time.perf_counter()
    sf.write(output, audio, sample_rate)
    write_wav_ms = round((time.perf_counter() - write_started) * 1000)
    gpu_stop.set()
    if gpu_thread is not None:
        gpu_thread.join(timeout=4)
    elapsed = time.perf_counter() - started
    duration = len(audio) / float(sample_rate)
    audio_peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    audio_rms = float(np.sqrt(np.mean(np.square(audio.astype(np.float64))))) if len(audio) else 0.0
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
        "audio_peak": round(audio_peak, 6),
        "audio_rms": round(audio_rms, 6),
        "rtf": round(elapsed / duration, 3) if duration > 0 else 0,
        "rtf_synthesis": round((sum(int(x.get("model_call_ms") or 0) for x in piece_stage_diagnostics) / 1000.0) / duration, 3) if duration > 0 else 0,
        "device": MODEL_DEVICE,
        "chunks": len(text_chunks),
        "cuda_peak_allocated_mb": peak_allocated_mb,
        "cuda_peak_reserved_mb": peak_reserved_mb,
        "qwen_mode": qwen_mode if ENGINE == "qwen3tts" else "",
        "qwen_runtime": qwen_runtime_params(params) if ENGINE == "qwen3tts" else {},
        "production_seed": active_seed,
        "production_temperature": round(float(params.get("productionTemperature", 0.60 if ENGINE == "chatterbox" else params.get("temperature", 0.78))), 3),
        "consistency_mode": str(params.get("consistencyMode") or "automatic"),
        "chunk_diagnostics": chunk_diagnostics,
        "stage_timings": {
            "setup_ms": setup_ms,
            "pieces": piece_stage_diagnostics,
            "autoregressive_ms": sum(int(x.get("autoregressive_ms") or 0) for x in piece_stage_diagnostics),
            "decode_ms": sum(int(x.get("decode_ms") or 0) for x in piece_stage_diagnostics),
            "code_predictor_ms": sum(int(x.get("code_predictor_ms") or 0) for x in piece_stage_diagnostics),
            "code_predictor_calls": sum(int(x.get("code_predictor_calls") or 0) for x in piece_stage_diagnostics),
            "code_predictor_steps": sum(int(x.get("code_predictor_steps") or 0) for x in piece_stage_diagnostics),
            "talker_steps": sum(int(x.get("talker_steps") or 0) for x in piece_stage_diagnostics),
            "prefill_tokens_max": max([int(x.get("prefill_tokens") or 0) for x in piece_stage_diagnostics] or [0]),
            "num_code_groups": max([int(x.get("num_code_groups") or 0) for x in piece_stage_diagnostics] or [0]),
            "wrapper_overhead_ms": sum(int(x.get("wrapper_overhead_ms") or 0) for x in piece_stage_diagnostics),
            "model_call_ms": sum(int(x.get("model_call_ms") or 0) for x in piece_stage_diagnostics),
            "prompt_ms": sum(int(x.get("prompt_ms") or 0) for x in piece_stage_diagnostics),
            "numpy_ms": sum(int(x.get("numpy_ms") or 0) for x in piece_stage_diagnostics),
            "concat_ms": concat_ms,
            "write_wav_ms": write_wav_ms,
            "synthesis_ms": sum(int(x.get("model_call_ms") or 0) for x in piece_stage_diagnostics),
            "rtf_e2e": round(elapsed / duration, 3) if duration > 0 else 0,
            "rtf_synthesis": round((sum(int(x.get("model_call_ms") or 0) for x in piece_stage_diagnostics) / 1000.0) / duration, 3) if duration > 0 else 0,
            "total_ms": round(elapsed * 1000),
        },
        "gpu_telemetry": _gpu_summary(gpu_samples),
        "voice_session_id": voice_session_id,
        "voice_config_fingerprint": voice_config_fingerprint,
        "speed": 1.0,
        "variant": "latam" if ENGINE == "chatterbox" else "",
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
        variant = "latam"
        qwen_mode = str(payload.get("qwen_mode") or params.get("voiceMode") or "reference")
        model_path = str(payload.get("model_path") or "").strip()
        speaker = str(payload.get("speaker") or "").strip()
        repaired = []
        request_id = str(payload.get("id") or "")
        stop_beat = threading.Event()
        def prep_heartbeat():
            elapsed = 0
            while not stop_beat.wait(8):
                elapsed += 8
                emit({"type": "progress", "id": request_id, "phase": "model-heartbeat", "label": "Descargando / preparando modelo…", "elapsed_sec": elapsed})
        beat = threading.Thread(target=prep_heartbeat, daemon=True)
        emit({"type": "progress", "id": request_id, "phase": "model-start", "label": "Descargando / preparando modelo…"})
        beat.start()
        try:
            if ENGINE == "chatterbox":
                load_model(chatterbox_variant="latam")
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
        finally:
            stop_beat.set()
            beat.join(timeout=1)
        emit({"type": "progress", "id": request_id, "phase": "model-loaded", "label": "Modelo cargado y validado ✓"})
        info = torch_runtime_info()
        return {"prepared": True, "engine": ENGINE, "device": MODEL_DEVICE, "variant": variant if ENGINE == "chatterbox" else "", "qwen_mode": qwen_mode if ENGINE == "qwen3tts" else "", "model_key": MODEL_KEY, "repaired_assets": repaired, "shared_revision": QWEN_SHARED_REVISION if ENGINE == "qwen3tts" else 0, **info}
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
