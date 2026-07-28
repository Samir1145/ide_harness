#!/usr/bin/env python3
"""
Local BharatGen FinanceParam -> GGUF Q4_K_M Converter & Quantizer for HAYAGRIVA.

Both LegalParam and FinanceParam are ~2.9B fine-tunes of bharatgenai/Param-1-2.9B-Instruct
with identical architecture dimensions. This script mirrors convert_local_legalparam.py exactly,
just targeting the FinanceParam repo and outputting to the financeparam/ subfolder.

Architecture (verified identical to LegalParam):
    hidden_size=2048, num_hidden_layers=32, intermediate_size=7168,
    num_attention_heads=16, num_key_value_heads=8, vocab_size=256000,
    max_position_embeddings=2048, rms_norm_eps=1e-5, rope_theta=10000.0
"""

import os
import sys
import shutil
import subprocess

SOURCE_MODEL_ID = "bharatgenai/FinanceParam"
SCRIPT_DIR      = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR      = os.path.join(SCRIPT_DIR, "..", "models", "llm", "llamafile", "financeparam")
TEMP_LLAMA_DIR  = os.path.join(SCRIPT_DIR, "..", "models", "llm", "llamafile", "temp_financeparam_llama")
TOK_RAW_DIR     = os.path.join(SCRIPT_DIR, "..", "models", "llm", "llamafile", "temp_financeparam_raw")
FP16_GGUF_PATH  = os.path.join(OUTPUT_DIR, "financeparam-f16.gguf")
UNPATCHED_PATH  = os.path.join(OUTPUT_DIR, "financeparam-2.9b-unpatched.gguf")
FINAL_GGUF_PATH = os.path.join(OUTPUT_DIR, "financeparam-2.9b.gguf")

CONVERT_HF_SCRIPT = "/tmp/llama.cpp/convert_hf_to_gguf.py"
FIX_VOCAB_SCRIPT  = os.path.join(SCRIPT_DIR, "fix_vocab_from_hf.py")

def main():
    print("=" * 65)
    print("  HAYAGRIVA FinanceParam -> GGUF Q4_K_M Converter")
    print("=" * 65)

    os.makedirs(OUTPUT_DIR,      exist_ok=True)
    os.makedirs(TEMP_LLAMA_DIR,  exist_ok=True)

    try:
        import torch
        from transformers import (AutoConfig, AutoModelForCausalLM,
                                   LlamaConfig, LlamaForCausalLM)
    except ImportError:
        print("[ERROR] Required packages missing — installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install",
                               "torch", "transformers", "accelerate",
                               "safetensors", "sentencepiece", "protobuf", "gguf"])
        from transformers import (AutoConfig, AutoModelForCausalLM,
                                   LlamaConfig, LlamaForCausalLM)

    # ── 1. Load & remap model ─────────────────────────────────────
    if not os.path.exists(os.path.join(TEMP_LLAMA_DIR, "config.json")):
        print(f"\n[1/5] Loading source config from {SOURCE_MODEL_ID}...")
        src_config = AutoConfig.from_pretrained(SOURCE_MODEL_ID, trust_remote_code=True)

        print(f"[2/5] Downloading & loading {SOURCE_MODEL_ID} in float16...")
        src_model = AutoModelForCausalLM.from_pretrained(
            SOURCE_MODEL_ID,
            trust_remote_code=True,
            torch_dtype=torch.float16,
            low_cpu_mem_usage=True
        )

        print("[3/5] Remapping architecture to standard LlamaForCausalLM...")
        llama_config = LlamaConfig(
            hidden_size=src_config.hidden_size,              # 2048
            intermediate_size=src_config.intermediate_size,  # 7168
            num_hidden_layers=src_config.num_hidden_layers,  # 32
            num_attention_heads=src_config.num_attention_heads,       # 16
            num_key_value_heads=src_config.num_key_value_heads,       # 8
            hidden_act=getattr(src_config, "hidden_act", "silu"),
            max_position_embeddings=src_config.max_position_embeddings,  # 2048
            rms_norm_eps=getattr(src_config, "rms_norm_eps", 1e-5),
            rope_theta=getattr(src_config, "rope_theta", 10000.0),
            vocab_size=src_config.vocab_size,                # 256000
            bos_token_id=src_config.bos_token_id,           # 2
            eos_token_id=src_config.eos_token_id,           # 3
            torch_dtype="float16",
        )

        llama_model = LlamaForCausalLM(llama_config)
        llama_model.load_state_dict(src_model.state_dict(), strict=False)

        print(f"    Saving remapped model to {TEMP_LLAMA_DIR}...")
        llama_model.save_pretrained(TEMP_LLAMA_DIR, safe_serialization=True)

        # Copy tokenizer files — prefer already-downloaded raw dir, fallback to HF
        tok_files = ["tokenizer.json", "tokenizer_config.json",
                     "special_tokens_map.json", "chat_template.jinja"]
        for tf in tok_files:
            src_path = os.path.join(TOK_RAW_DIR, tf)
            dst_path = os.path.join(TEMP_LLAMA_DIR, tf)
            if os.path.exists(src_path):
                shutil.copy(src_path, dst_path)
                print(f"    ✓ Copied {tf} from local raw dir")
            else:
                try:
                    from huggingface_hub import hf_hub_download
                    fpath = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename=tf)
                    shutil.copy(fpath, dst_path)
                    print(f"    ✓ Downloaded {tf} from HF")
                except Exception as e:
                    print(f"    Note: {tf} skipped: {e}")

        del src_model
        del llama_model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        import gc; gc.collect()
        print("    ✓ Model tensors saved and freed from RAM.")
    else:
        print("    ✓ Remapped tensors found in temp dir — resuming GGUF conversion...")

    # ── 2. Convert to GGUF F16 ────────────────────────────────────
    print(f"\n[4/5] Converting to GGUF (f16) via convert_hf_to_gguf.py...")
    subprocess.check_call([
        sys.executable, CONVERT_HF_SCRIPT,
        TEMP_LLAMA_DIR,
        "--outfile", FP16_GGUF_PATH,
        "--outtype", "f16"
    ])
    print(f"    ✓ F16 GGUF: {FP16_GGUF_PATH}")

    # ── 3. Quantize F16 → Q4_K_M ─────────────────────────────────
    print(f"\n[5/5] Quantizing to Q4_K_M...")
    quant_binary = shutil.which("llama-quantize") or shutil.which("quantize")
    if not quant_binary:
        print("    [WARNING] llama-quantize not found — using f16 directly")
        shutil.move(FP16_GGUF_PATH, UNPATCHED_PATH)
    else:
        subprocess.check_call([quant_binary, FP16_GGUF_PATH, UNPATCHED_PATH, "Q4_K_M"])
        if os.path.exists(FP16_GGUF_PATH):
            os.remove(FP16_GGUF_PATH)
            print(f"    ✓ Q4_K_M GGUF: {UNPATCHED_PATH}")
            print(f"    ✓ Deleted intermediate f16 GGUF")

    # Delete temp llama dir to free disk
    shutil.rmtree(TEMP_LLAMA_DIR, ignore_errors=True)
    print(f"    ✓ Deleted temp llama dir")

    # ── 4. Vocab post-patch (hex byte casing) ────────────────────
    print(f"\n[Post] Patching vocab (lowercase hex byte tokens → uppercase)...")
    if os.path.exists(FIX_VOCAB_SCRIPT):
        subprocess.check_call([
            sys.executable, FIX_VOCAB_SCRIPT,
            "--input",  UNPATCHED_PATH,
            "--output", FINAL_GGUF_PATH,
            "--repo",   SOURCE_MODEL_ID
        ])
        if os.path.exists(UNPATCHED_PATH) and UNPATCHED_PATH != FINAL_GGUF_PATH:
            os.remove(UNPATCHED_PATH)
    else:
        # fix_vocab_from_hf.py not found — rename unpatched to final
        print("    [WARNING] fix_vocab_from_hf.py not found — skipping vocab patch")
        shutil.move(UNPATCHED_PATH, FINAL_GGUF_PATH)

    print("\n" + "=" * 65)
    print("  ✓ CONVERSION SUCCESSFUL!")
    print(f"  Final GGUF: {FINAL_GGUF_PATH}")
    print("=" * 65)
    print("\nTo run the server:")
    print(f"  ./models/llm/llamafile/llamafile-runner \\")
    print(f"    -m {FINAL_GGUF_PATH} \\")
    print(f"    --port 8090 --threads 6 --nobrowser")

if __name__ == "__main__":
    main()
