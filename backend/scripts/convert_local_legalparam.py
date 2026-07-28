#!/usr/bin/env python3
"""
Local BharatGen LegalParam -> GGUF Q4_K_M Converter & Quantizer for HAYAGRIVA
Converts bharatgenai/LegalParam to standard LlamaForCausalLM and quantizes to Q4_K_M locally.
"""

import os
import sys
import shutil
import subprocess

SOURCE_MODEL_ID = "bharatgenai/LegalParam"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "models", "llm", "llamafile")
TEMP_LLAMA_DIR = os.path.join(OUTPUT_DIR, "temp_llama")
FP16_GGUF_PATH = os.path.join(OUTPUT_DIR, "legalparam-f16.gguf")
FINAL_GGUF_PATH = os.path.join(OUTPUT_DIR, "legalparam-7b.gguf")

def main():
    print("=" * 65)
    print("  HAYAGRIVA Local BharatGen LegalParam -> GGUF Q4_K_M Converter")
    print("=" * 65)

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(TEMP_LLAMA_DIR, exist_ok=True)

    try:
        import torch
        from transformers import AutoConfig, AutoModelForCausalLM, LlamaTokenizer, LlamaConfig, LlamaForCausalLM
    except ImportError:
        print("[ERROR] Required Python packages missing. Installing dependencies...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "torch", "transformers", "accelerate", "safetensors", "sentencepiece", "protobuf", "gguf"])
        from transformers import AutoConfig, AutoModelForCausalLM, LlamaTokenizer, LlamaConfig, LlamaForCausalLM

    if not os.path.exists(os.path.join(TEMP_LLAMA_DIR, "config.json")):
        print(f"\n[1/5] Loading source config from {SOURCE_MODEL_ID}...")
        src_config = AutoConfig.from_pretrained(SOURCE_MODEL_ID, trust_remote_code=True)

        print(f"[2/5] Downloading and loading {SOURCE_MODEL_ID} in float16...")
        src_model = AutoModelForCausalLM.from_pretrained(
            SOURCE_MODEL_ID,
            trust_remote_code=True,
            torch_dtype=torch.float16,
            low_cpu_mem_usage=True
        )
        print("[3/5] Remapping architecture to standard LlamaForCausalLM...")
        llama_config = LlamaConfig(
            hidden_size=src_config.hidden_size,
            intermediate_size=src_config.intermediate_size,
            num_hidden_layers=src_config.num_hidden_layers,
            num_attention_heads=src_config.num_attention_heads,
            num_key_value_heads=src_config.num_key_value_heads,
            hidden_act=src_config.hidden_act,
            max_position_embeddings=src_config.max_position_embeddings,
            rms_norm_eps=src_config.rms_norm_eps,
            rope_theta=src_config.rope_theta,
            vocab_size=src_config.vocab_size,
            bos_token_id=src_config.bos_token_id,
            eos_token_id=src_config.eos_token_id,
            torch_dtype="float16",
        )

        llama_model = LlamaForCausalLM(llama_config)
        llama_model.load_state_dict(src_model.state_dict(), strict=False)

        print(f"Saving remapped model tensors to {TEMP_LLAMA_DIR}...")
        llama_model.save_pretrained(TEMP_LLAMA_DIR, safe_serialization=True)

        from huggingface_hub import hf_hub_download
        for tok_file in ["tokenizer.model", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"]:
            try:
                fpath = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename=tok_file)
                shutil.copy(fpath, os.path.join(TEMP_LLAMA_DIR, tok_file))
                print(f"✓ Copied {tok_file} to temp_llama")
            except Exception as e:
                print(f"Note: {tok_file} download skipped: {e}")

        del src_model
        del llama_model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("✓ Model tensors saved and freed from memory.")
    else:
        print("✓ Existing remapped model tensors found in temp_llama. Resuming GGUF conversion...")

    print("\n[4/5] Converting safetensors to GGUF format...")
    convert_hf_script = "/tmp/llama.cpp/convert_hf_to_gguf.py"
    convert_cmd = [
        sys.executable, convert_hf_script,
        TEMP_LLAMA_DIR,
        "--outfile", FP16_GGUF_PATH,
        "--outtype", "f16"
    ]
    subprocess.check_call(convert_cmd)

    print("\n[5/5] Quantizing GGUF to Q4_K_M using llama-quantize...")
    quant_binary = shutil.which("llama-quantize") or shutil.which("quantize")
    if not quant_binary:
        print("[WARNING] 'llama-quantize' binary not found in PATH.")
        print("          Installing llama.cpp via Homebrew or running f16 output direct.")
        shutil.move(FP16_GGUF_PATH, FINAL_GGUF_PATH)
    else:
        subprocess.check_call([quant_binary, FP16_GGUF_PATH, FINAL_GGUF_PATH, "Q4_K_M"])
        if os.path.exists(FP16_GGUF_PATH):
            os.remove(FP16_GGUF_PATH)

    shutil.rmtree(TEMP_LLAMA_DIR, ignore_errors=True)

    print("\n" + "=" * 65)
    print(" ✓ CONVERSION SUCCESSFUL!")
    print(f" Final GGUF model location: {FINAL_GGUF_PATH}")
    print("=" * 65)

if __name__ == "__main__":
    main()
