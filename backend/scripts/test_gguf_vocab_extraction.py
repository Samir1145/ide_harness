import sys
import os

# Append the directory of llama.cpp so we can import its helper modules
sys.path.append("/tmp/llama.cpp")

from convert_hf_to_gguf import get_model_class
from transformers import AutoConfig

SOURCE_MODEL_ID = "bharatgenai/LegalParam"
TEMP_LLAMA_DIR = "/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/models/llm/llamafile/temp_llama"

# Ensure the temp llama config matches what we generated
config = AutoConfig.from_pretrained(TEMP_LLAMA_DIR)
model_architecture = config.architectures[0]

model_class = get_model_class(model_architecture)
print(f"Model Class: {model_class}")

# Let's instantiate and test vocabulary loading
model_instance = model_class(TEMP_LLAMA_DIR, "f16", "/tmp/vocab_test.gguf", False)
print("Instantiated Model class.")

# Check the vocab
vocab = model_instance.vocab
print(f"Vocab type: {type(vocab)}")

# Print duplicate tokens
seen = set()
duplicates = []
for i, token in enumerate(vocab.tokens):
    # token is a byte string or string
    token_str = token.decode("utf-8", errors="replace") if isinstance(token, bytes) else token
    if token_str in seen:
        duplicates.append((i, token_str))
    seen.add(token_str)

print(f"Total GGUF tokens: {len(vocab.tokens)}")
print(f"Duplicates: {len(duplicates)}")
for idx, dup in duplicates[:15]:
    # find the first occurrence index
    first_idx = -1
    for k, t in enumerate(vocab.tokens):
        t_str = t.decode("utf-8", errors="replace") if isinstance(t, bytes) else t
        if t_str == dup:
            first_idx = k
            break
    print(f"Duplicate token '{dup}' at index {idx} (first occurred at index {first_idx})")
