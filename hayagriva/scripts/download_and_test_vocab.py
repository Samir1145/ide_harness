import sys
import os
import shutil
from huggingface_hub import hf_hub_download

import json
# Append the directory of llama.cpp so we can import its helper modules
sys.path.append("/tmp/llama.cpp")

from convert_hf_to_gguf import get_model_class
from transformers import AutoConfig

SOURCE_MODEL_ID = "bharatgenai/LegalParam"
TEMP_LLAMA_DIR = "/tmp/vocab_test_dir"
os.makedirs(TEMP_LLAMA_DIR, exist_ok=True)

# Download only configuration and tokenizer files
for tok_file in ["config.json", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "config_parambharatgen.py"]:
    try:
        fpath = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename=tok_file)
        shutil.copy(fpath, os.path.join(TEMP_LLAMA_DIR, tok_file))
        print(f"Downloaded {tok_file}")
    except Exception as e:
        print(f"Skipped {tok_file}: {e}")

from pathlib import Path

# Override config to use standard llama type to prevent dynamic code loading errors
config_path = os.path.join(TEMP_LLAMA_DIR, "config.json")
with open(config_path, "r") as f:
    cfg = json.load(f)
cfg["model_type"] = "llama"
cfg["architectures"] = ["LlamaForCausalLM"]
with open(config_path, "w") as f:
    json.dump(cfg, f, indent=2)

model_architecture = "LlamaForCausalLM"
model_class = get_model_class(model_architecture)
print(f"Model Class: {model_class}")

# Instantiate and test vocabulary loading using Path object
model_instance = model_class(Path(TEMP_LLAMA_DIR), "f16", Path("/tmp/vocab_test.gguf"))
print("Instantiated Model class.")

# Check the vocab
tokens, toktypes, tokpre = model_instance.get_vocab_base()
print(f"Tokpre: {tokpre}")

# Print duplicate tokens
seen = {}
duplicates = []
for i, token in enumerate(tokens):
    token_str = token.decode("utf-8", errors="replace") if isinstance(token, bytes) else token
    if token_str in seen:
        duplicates.append((i, token_str, seen[token_str]))
    seen[token_str] = i

print(f"Total GGUF tokens: {len(tokens)}")
print(f"Duplicates count: {len(duplicates)}")
for idx, dup, first_idx in duplicates[:15]:
    print(f"Duplicate token '{dup}' at index {idx} (first occurred at index {first_idx})")
