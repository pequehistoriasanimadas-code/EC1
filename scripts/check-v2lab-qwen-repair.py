import importlib.util
import io
import os
import pathlib
import shutil
import sys
import tempfile
import types

# The repair test exercises only filesystem/model-cache helpers. CI's system
# Python does not need the runtime audio dependencies just to import the worker.
sys.modules.setdefault("numpy", types.ModuleType("numpy"))
sys.modules.setdefault("soundfile", types.ModuleType("soundfile"))

root = pathlib.Path(__file__).resolve().parents[1]
worker_path = root / "src" / "tts_lab_worker.py"

old_stdin = sys.stdin
old_argv = sys.argv[:]
sys.stdin = io.StringIO("")
sys.argv = [str(worker_path), "qwen3tts"]
try:
    spec = importlib.util.spec_from_file_location("gec_tts_lab_worker_test", worker_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
finally:
    sys.stdin = old_stdin
    sys.argv = old_argv

tmp = pathlib.Path(tempfile.mkdtemp(prefix="gec-qwen-repair-"))
try:
    base = tmp / "base"
    target = tmp / "fine"
    base.mkdir(parents=True)
    target.mkdir(parents=True)
    (target / "config.json").write_text('{"talker_config":{"spk_id":{"aurelio":0}}}', encoding="utf-8")
    (target / "model.safetensors").write_bytes(b"fine-model")

    for rel in mod.QWEN_SHARED_FILES:
        p = base.joinpath(*rel.split("/"))
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(("shared:" + rel).encode("utf-8"))

    # Simulate exactly the user's broken snapshot: speech tokenizer exists,
    # but its feature-extractor config is missing in the fine-tuned folder.
    broken = target / "speech_tokenizer" / "preprocessor_config.json"
    assert not broken.exists()

    original_snapshot = mod._qwen_base_snapshot
    old_overlay = os.environ.get("GEC_TTS_MODEL_OVERLAYS")
    overlay_root = tmp / "overlays"
    os.environ["GEC_TTS_MODEL_OVERLAYS"] = str(overlay_root)
    mod._qwen_base_snapshot = lambda include_model=False: str(base)
    try:
        resolved, repaired = mod.ensure_qwen_assets(str(target))
    finally:
        mod._qwen_base_snapshot = original_snapshot
        if old_overlay is None:
            os.environ.pop("GEC_TTS_MODEL_OVERLAYS", None)
        else:
            os.environ["GEC_TTS_MODEL_OVERLAYS"] = old_overlay

    resolved_path = pathlib.Path(resolved).resolve()
    assert resolved_path != target.resolve(), "Lab.14 must not repair files inside the imported checkpoint"
    assert overlay_root.resolve() in resolved_path.parents
    assert not broken.exists(), "The imported checkpoint must remain untouched"
    assert "overlay:speech_tokenizer/preprocessor_config.json" in repaired
    assert (resolved_path / "speech_tokenizer" / "preprocessor_config.json").exists()
    assert (resolved_path / "speech_tokenizer" / "model.safetensors").exists()
    assert (resolved_path / "tokenizer_config.json").exists()

    # Existing fine-tuned weights/config remain byte-for-byte untouched while
    # the runtime overlay points to them and supplies only shared assets.
    assert (target / "model.safetensors").read_bytes() == b"fine-model"
    assert (resolved_path / "model.safetensors").read_bytes() == b"fine-model"
    print("check-v2lab-qwen-repair: OK · shared Qwen assets materialized in safe overlay without modifying fine-tuned checkpoint")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
