import importlib.util
import io
import os
import pathlib
import shutil
import sys
import tempfile

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
    mod._qwen_base_snapshot = lambda include_model=False: str(base)
    try:
        resolved, repaired = mod.ensure_qwen_assets(str(target))
    finally:
        mod._qwen_base_snapshot = original_snapshot

    assert pathlib.Path(resolved) == target.resolve()
    assert broken.exists(), "preprocessor_config.json was not repaired"
    assert "speech_tokenizer/preprocessor_config.json" in repaired
    assert (target / "speech_tokenizer" / "model.safetensors").exists()
    assert (target / "tokenizer_config.json").exists()

    # Existing fine-tuned weights/config must never be overwritten by Base.
    assert (target / "model.safetensors").read_bytes() == b"fine-model"
    print("check-v2lab-qwen-repair: OK · missing speech_tokenizer/preprocessor_config.json repaired without replacing fine-tuned weights")
finally:
    shutil.rmtree(tmp, ignore_errors=True)
