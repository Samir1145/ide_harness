---
name: gguf-vocab-patching
description: Fix and patch vocabulary metadata in GGUF files converted from Hugging Face model sources (resolves SPM/BPE crashes, duplicate token assertions, and vocabulary size mismatches).
---

# GGUF Vocabulary Patching Guide

When converting models based on the **Param-1-2.9B-Instruct** architecture (such as BharatGen's `LegalParam` and `FinanceParam`) into GGUF format, the standard `llama.cpp` conversion process introduces three critical vocabulary metadata errors. 

This guide documents these errors and provides a reusable, parameterized python script to automate the fixes for any GGUF model in the family.

---

## The Three Critical Vocabulary Errors

### 1. Case-Mismatched Byte Tokens (Token Lookup Crash)
* **Symptom:** The server launches but crashes on the first text prompt with:
  `libc++abi: terminating due to uncaught exception of type std::out_of_range: unordered_map::at: key not found`
* **Cause:** The native C++ tokenizer in `llama.cpp` / `llamafile` looks up hex representation strings for raw bytes using **uppercase** letters (e.g. `<0x0A>`, `<0x0F>`). However, the Hugging Face model definitions use **lowercase** letters (e.g. `<0x0a>`, `<0x0f>`).
* **Fix:** Iterate over the `tokenizer.ggml.tokens` array and convert all matched byte token strings (`<0x00>` through `<0xFF>`) to uppercase hex formatting.

### 2. Duplicate Special Tokens (Assert Failures)
* **Symptom:** Startup fails with `GGML_ASSERT` on duplicate tokens.
* **Cause:** The conversion process registers multiple instances of the beginning-of-sentence (`<s>`) token at different indexes in the array.
* **Fix:** Iterate through the token array and append `_dup_{index}` to any subsequent duplicate special tokens to make them unique.

### 3. Vocabulary Size Mismatch (Load Failure)
* **Symptom:** Startup fails with:
  `llama_model_load: error loading model: vocab size mismatch`
* **Cause:** The model's tensor layers expect the vocabulary size to match `llama.vocab_size` (usually `256006` for Param models). However, the Hugging Face `tokenizer.json` only contains the base vocab size (usually `256000` tokens).
* **Fix:** Read `llama.vocab_size` from GGUF metadata, and pad the `tokens`, `scores`, and `token_type` arrays to that exact size using unused pad tokens (e.g., `[PAD256000]`).

---

## The Reusable Automated Patch Script

Use this parameterized python script to patch the vocabulary of any model in this architecture family.

```python
import sys
import argparse
import json
from pathlib import Path
from huggingface_hub import hf_hub_download

# Append llama.cpp gguf-py directory
sys.path.append("/tmp/llama.cpp/gguf-py")
import gguf
from gguf.scripts.gguf_new_metadata import MetadataDetails, copy_with_new_metadata

def patch_gguf_vocab(input_path: str, output_path: str, repo_id: str):
    print(f"Loading GGUF model: {input_path}")
    reader = gguf.GGUFReader(input_path, "r")
    arch = reader.get_field(gguf.Keys.General.ARCHITECTURE).contents()
    
    print(f"Downloading original tokenizer from Hugging Face repository: {repo_id}...")
    tok_json_path = hf_hub_download(repo_id=repo_id, filename="tokenizer.json")
    tok_config_path = hf_hub_download(repo_id=repo_id, filename="tokenizer_config.json")
    
    with open(tok_json_path, "r", encoding="utf-8") as f:
        tok_json = json.load(f)
    with open(tok_config_path, "r", encoding="utf-8") as f:
        tok_config = json.load(f)
        
    vocab = tok_json["model"]["vocab"]
    reverse_vocab = {id_: tok for tok, id_ in vocab.items()}
    added_tokens_decoder = tok_config.get("added_tokens_decoder", {})
    
    # Read the expected vocab size from the GGUF model tensors
    target_vocab_size = 256006
    vocab_size_field = reader.get_field("llama.vocab_size")
    if vocab_size_field:
        target_vocab_size = int(vocab_size_field.contents())
    print(f"Target vocabulary size from GGUF: {target_vocab_size}")
    
    tokens, scores, toktypes = [], [], []
    import re
    byte_pattern = re.compile(r"^<0x([0-9a-fA-F]{2})>$")
    
    # Reconstruct the correct vocabulary list
    for i in range(target_vocab_size):
        if i not in reverse_vocab:
            tokens.append(f"[PAD{i}]".encode("utf-8"))
            scores.append(-1000.0)
            toktypes.append(gguf.TokenType.UNUSED)
        else:
            token = reverse_vocab[i]
            
            # 1. Convert lowercase byte tokens to uppercase
            match = byte_pattern.match(token)
            if match:
                hex_val = match.group(1).upper()
                token = f"<0x{hex_val}>"
                
            # 2. Rename duplicate <s> token
            if i == 2 and token == "<s>":
                token = "<s>_dup_2"
                
            tokens.append(token.encode("utf-8"))
            scores.append(0.0)
            
            str_i = str(i)
            if str_i in added_tokens_decoder:
                tok_data = added_tokens_decoder[str_i]
                if tok_data.get("special") or token.startswith("<") and token.endswith(">"):
                    toktypes.append(gguf.TokenType.CONTROL)
                else:
                    toktypes.append(gguf.TokenType.USER_DEFINED)
            else:
                toktypes.append(gguf.TokenType.NORMAL)
                
    # Define the metadata overrides
    new_metadata = {
        gguf.Keys.Tokenizer.LIST: MetadataDetails(
            gguf.GGUFValueType.ARRAY, tokens, sub_type=gguf.GGUFValueType.STRING
        ),
        gguf.Keys.Tokenizer.SCORES: MetadataDetails(
            gguf.GGUFValueType.ARRAY, scores, sub_type=gguf.GGUFValueType.FLOAT32
        ),
        gguf.Keys.Tokenizer.TOKEN_TYPE: MetadataDetails(
            gguf.GGUFValueType.ARRAY, toktypes, sub_type=gguf.GGUFValueType.INT32
        )
    }
    
    print(f"Writing corrected GGUF file: {output_path}")
    writer = gguf.GGUFWriter(output_path, arch=arch, endianess=reader.endianess)
    alignment = reader.get_field(gguf.Keys.General.ALIGNMENT)
    if alignment is not None:
        writer.data_alignment = alignment.contents()
        
    copy_with_new_metadata(reader, writer, new_metadata, remove_metadata=[])
    print("✓ Vocabulary patched successfully!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Patch GGUF tokenizer vocabularies.")
    parser.add_argument("--input", required=True, help="Input GGUF file path")
    parser.add_argument("--output", required=True, help="Output GGUF file path")
    parser.add_argument("--repo", required=True, help="Hugging Face model repository ID")
    args = parser.parse_args()
    
    patch_gguf_vocab(args.input, args.output, args.repo)
```

---

## 4. Recent Learnings (macOS Environment & Prompt Templates)

During the conversion of **FinanceParam-2.9B** (July 2026), we resolved several critical environmental and usage bugs that apply to the entire `Param-1-2.9B-Instruct` model family.

### A. PyTorch / Transformers Version Conflict on macOS Intel (Rosetta)
* **Symptom:** `ImportError: AutoModelForCausalLM requires the PyTorch library but it was not found` or `Disabling PyTorch because PyTorch >= 2.4 is required but found 2.2.2`.
* **Cause:** PyTorch officially dropped x86_64 macOS build support starting with version 2.3.0. You cannot install `torch>=2.4` on Intel Mac/emulation. However, `transformers 5.x` forces a requirement for `torch>=2.4`.
* **Fix:** In the Python virtual environment, downgrade `transformers` to a `4.x` release and keep `torch==2.2.2`. The following package versions are fully compatible:
  ```bash
  pip install "transformers<5.0" "tokenizers>=0.22.0" "torch==2.2.2"
  # Verified setup: transformers==4.57.6, tokenizers==0.22.2, torch==2.2.2
  ```

### B. Tokenizer Fast Deserialization Mismatch
* **Symptom:** `Exception: data did not match any variant of untagged enum ModelWrapper at line ...` when loading the tokenizer.
* **Cause:** Newer `tokenizer.json` configurations created by HuggingFace libraries contain keys that older Rust-based tokenizers (like `tokenizers==0.19.1`) cannot parse.
* **Fix:** Keep `tokenizers` upgraded to at least `0.22.2` in the environment.

### C. Looping or Repetitive Prompt Completions (Prompt Mismatches)
* **Symptom:** The converted GGUF model runs but outputs empty answers (`<|/assistant|></s>`) or repeats words infinitely (e.g. `excellence excellence ...` or `QuestionQuestion...`).
* **Cause:** The model is an instruct-trained model that expects prompt inputs structured *exactly* like its fine-tuned chat template. Without this format, the input tokens misalign with attention layers.
* **Chat Templates by Model:**
  * **LegalParam:** `<user>\n[PROMPT]\n<assistant>\n`
  * **FinanceParam** (and general `Param-1-2.9B` models): `<|user|>[PROMPT]</|/user|><|assistant|>`
    * *Note:* Ensure there are **no spaces** surrounding the prompt inside the tags (i.e. `<|user|>Explain...` rather than `<|user|> Explain...`).
* **Bilingual Language Nuance:**
  * The model expects Hindi queries to be written in Devanagari script (e.g. `म्यूचुअल फंड क्या होता है?`) rather than Latin Hinglish transliteration (e.g. `mutual fund kya hota hai?`). Hinglish input causes extremely low-probability predictions, resulting in repeating tokens.

