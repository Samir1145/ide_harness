#!/usr/bin/env python3
"""
End-to-end BharatGen FinanceParam -> GGUF Q4_K_M Converter for HAYAGRIVA.

Strategy:
  1. Download safetensors + tokenizer files from HF (no dummy tokenizer.model)
  2. Patch config.json architecture to LlamaForCausalLM
  3. Convert via convert_hf_to_gguf.py (reads tokenizer.json natively → BPE)
  4. Quantize to Q4_K_M
  5. Patch vocab: lowercase hex byte tokens → uppercase, fix token types
  6. Delete raw weights to free disk
"""

import os
import sys
import re
import json
import shutil
import subprocess
from pathlib import Path

sys.path.append("/tmp/llama.cpp/gguf-py")
import gguf

REPO_ID = "bharatgenai/FinanceParam"
MODEL_DIR = Path("/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/models/llm/llamafile")
DOWNLOAD_DIR = MODEL_DIR / "temp_financeparam_raw"
FP16_GGUF_PATH = MODEL_DIR / "financeparam-f16.gguf"
UNPATCHED_GGUF_PATH = MODEL_DIR / "financeparam-7b-unpatched.gguf"
FINAL_GGUF_PATH = MODEL_DIR / "financeparam-7b.gguf"

CONVERT_HF_SCRIPT = "/tmp/llama.cpp/convert_hf_to_gguf.py"
LLAMA_QUANTIZE = shutil.which("llama-quantize") or shutil.which("quantize")
VENV_PYTHON = str(Path("/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/.venv/bin/python"))

def step_download():
    """Download weights + tokenizer files from HF."""
    print(f"\n[1/5] Downloading FinanceParam from HF: {REPO_ID}...")
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    from huggingface_hub import snapshot_download
    snapshot_download(
        repo_id=REPO_ID,
        local_dir=str(DOWNLOAD_DIR),
        local_dir_use_symlinks=False,
    )
    print("      ✓ Download complete.")

def step_patch_config():
    """Force architecture to LlamaForCausalLM so converter picks it up."""
    print("\n[2/5] Patching config.json architecture to LlamaForCausalLM...")
    config_path = DOWNLOAD_DIR / "config.json"
    with open(config_path, encoding="utf-8") as f:
        cfg = json.load(f)
    cfg["architectures"] = ["LlamaForCausalLM"]
    # Remove any custom model_type that confuses the converter
    if cfg.get("model_type") not in ("llama", "mistral"):
        cfg["model_type"] = "llama"
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)
    print(f"      ✓ Patched: architectures={cfg['architectures']}, model_type={cfg.get('model_type')}")

def step_convert():
    """Run convert_hf_to_gguf.py — it will read tokenizer.json natively."""
    print("\n[3/5] Converting to GGUF (f16) via convert_hf_to_gguf.py...")
    cmd = [
        VENV_PYTHON, CONVERT_HF_SCRIPT,
        str(DOWNLOAD_DIR),
        "--outfile", str(FP16_GGUF_PATH),
        "--outtype", "f16",
    ]
    subprocess.check_call(cmd)
    print(f"      ✓ F16 GGUF written to {FP16_GGUF_PATH}")

def step_quantize():
    """Quantize F16 → Q4_K_M."""
    global UNPATCHED_GGUF_PATH
    print("\n[4/5] Quantizing to Q4_K_M...")
    if not LLAMA_QUANTIZE:
        print("      [WARNING] llama-quantize binary not found! Using f16 directly.")
        UNPATCHED_GGUF_PATH = FP16_GGUF_PATH
        return
    subprocess.check_call([LLAMA_QUANTIZE, str(FP16_GGUF_PATH), str(UNPATCHED_GGUF_PATH), "Q4_K_M"])
    if FP16_GGUF_PATH.exists():
        FP16_GGUF_PATH.unlink()
        print(f"      ✓ Q4_K_M GGUF written to {UNPATCHED_GGUF_PATH}")
        print(f"        Deleted intermediate f16 GGUF.")

def step_delete_weights():
    """Delete raw safetensors to free disk space."""
    print("\n      Deleting raw model weights to free disk space...")
    shutil.rmtree(DOWNLOAD_DIR, ignore_errors=True)
    print("      ✓ Raw weights deleted.")

def step_patch_vocab():
    """Fix lowercase hex byte token names in the GGUF metadata."""
    print(f"\n[5/5] Patching vocabulary (hex byte casing)...")
    reader = gguf.GGUFReader(str(UNPATCHED_GGUF_PATH), "r")
    arch = reader.fields["general.architecture"].contents()

    orig_tokens = reader.fields["tokenizer.ggml.tokens"].contents()
    orig_scores = reader.fields["tokenizer.ggml.scores"].contents()
    orig_toktypes = reader.fields["tokenizer.ggml.token_type"].contents()

    byte_pattern = re.compile(r"^<0x([0-9a-fA-F]{2})>$")
    tokens, scores, toktypes = [], [], []
    fix_count = 0

    for i, tok in enumerate(orig_tokens):
        token = tok.decode("utf-8") if isinstance(tok, bytes) else tok
        m = byte_pattern.match(token)
        if m:
            upper = m.group(1).upper()
            if upper != m.group(1):
                fix_count += 1
            token = f"<0x{upper}>"
        tokens.append(token.encode("utf-8"))
        scores.append(float(orig_scores[i]))
        toktypes.append(int(orig_toktypes[i]))

    print(f"      Fixed {fix_count} lowercase byte tokens.")
    print(f"      Writing patched GGUF to {FINAL_GGUF_PATH}...")

    writer = gguf.GGUFWriter(str(FINAL_GGUF_PATH), arch=arch, endianess=reader.endianess)

    # Copy all metadata except the three token fields we're replacing
    skip = {"tokenizer.ggml.tokens", "tokenizer.ggml.scores", "tokenizer.ggml.token_type"}
    for field in reader.fields.values():
        if field.name in skip:
            continue
        ftype = field.types[0]
        try:
            val = field.contents()
            if ftype == gguf.GGUFValueType.ARRAY:
                writer.add_array(field.name, val)
            elif ftype == gguf.GGUFValueType.STRING:
                writer.add_string(field.name, val)
            elif ftype == gguf.GGUFValueType.UINT32:
                writer.add_uint32(field.name, val)
            elif ftype == gguf.GGUFValueType.INT32:
                writer.add_int32(field.name, val)
            elif ftype == gguf.GGUFValueType.FLOAT32:
                writer.add_float32(field.name, val)
            elif ftype == gguf.GGUFValueType.UINT64:
                writer.add_uint64(field.name, val)
            elif ftype == gguf.GGUFValueType.INT64:
                writer.add_int64(field.name, val)
            elif ftype == gguf.GGUFValueType.BOOL:
                writer.add_bool(field.name, val)
            elif ftype == gguf.GGUFValueType.UINT8:
                writer.add_uint8(field.name, val)
            elif ftype == gguf.GGUFValueType.INT8:
                writer.add_int8(field.name, val)
            elif ftype == gguf.GGUFValueType.UINT16:
                writer.add_uint16(field.name, val)
            elif ftype == gguf.GGUFValueType.FLOAT64:
                writer.add_float64(field.name, val)
        except Exception as e:
            print(f"      [WARN] Skipping field {field.name}: {e}")

    # Write patched vocab fields
    writer.add_array("tokenizer.ggml.tokens", tokens)
    writer.add_array("tokenizer.ggml.scores", scores)
    writer.add_array("tokenizer.ggml.token_type", toktypes)

    # Write tensor info
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    for tensor in reader.tensors:
        writer.write_tensor_info(tensor.name, list(tensor.shape), tensor.tensor_type, tensor.n_bytes)
    writer.write_ti_data_to_file()
    for tensor in reader.tensors:
        writer.write_tensor_data(tensor.data)
    writer.close()

    if UNPATCHED_GGUF_PATH != FP16_GGUF_PATH:
        UNPATCHED_GGUF_PATH.unlink(missing_ok=True)

    print(f"      ✓ Final patched GGUF: {FINAL_GGUF_PATH}")


def main():
    print("=" * 65)
    print("  HAYAGRIVA FinanceParam Full Conversion Pipeline")
    print("=" * 65)
    print(f"  Free disk before start: ", end="")
    os.system("df -h / | tail -1 | awk '{print $4}'")

    step_download()
    step_patch_config()
    step_convert()
    step_quantize()
    step_delete_weights()
    step_patch_vocab()

    print("\n" + "=" * 65)
    print("  ✓ ALL DONE!")
    print(f"  Final model: {FINAL_GGUF_PATH}")
    print("=" * 65)
    print("\nRun the server with:")
    print("  ./models/llm/llamafile/llamafile-runner -m ./models/llm/llamafile/financeparam-7b.gguf --port 8090 --threads 6 --nobrowser")

if __name__ == "__main__":
    main()
