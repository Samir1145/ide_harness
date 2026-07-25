import sys
import os
import json
from pathlib import Path
from huggingface_hub import hf_hub_download

# Append the directory of llama.cpp so we can import its helper modules
sys.path.append("/tmp/llama.cpp/gguf-py")

import gguf
from gguf.scripts.gguf_new_metadata import MetadataDetails, copy_with_new_metadata

import argparse

def main():
    parser = argparse.ArgumentParser(description="Fix GGUF vocabulary issues from HuggingFace source config.")
    parser.add_argument("--input", type=str, default="/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/models/llm/llamafile/legalparam-7b.gguf", help="Input GGUF file path")
    parser.add_argument("--output", type=str, default="/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/models/llm/llamafile/legalparam-7b-patched.gguf", help="Output GGUF file path")
    parser.add_argument("--repo", type=str, default="bharatgenai/LegalParam", help="Hugging Face repository ID")
    
    args = parser.parse_args()
    
    INPUT_PATH = Path(args.input)
    OUTPUT_PATH = Path(args.output)
    SOURCE_MODEL_ID = args.repo

    print(f"Loading GGUF model: {INPUT_PATH}")
    reader = gguf.GGUFReader(INPUT_PATH, "r")
    
    arch = reader.get_field(gguf.Keys.General.ARCHITECTURE).contents()
    print(f"Architecture: {arch}")
    
    # Download tokenizer files from HuggingFace to build the correct vocabulary
    print("Downloading original tokenizer configuration from HuggingFace...")
    tok_json_path = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename="tokenizer.json")
    tok_config_path = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename="tokenizer_config.json")
    
    with open(tok_json_path, "r", encoding="utf-8") as f:
        tok_json = json.load(f)
    with open(tok_config_path, "r", encoding="utf-8") as f:
        tok_config = json.load(f)
        
    vocab = tok_json["model"]["vocab"]
    vocab_size = len(vocab)
    print(f"Original vocabulary size: {vocab_size}")
    
    # Reconstruct reverse vocab
    reverse_vocab = {id_: tok for tok, id_ in vocab.items()}
    
    # added tokens
    added_tokens_decoder = tok_config.get("added_tokens_decoder", {})
    
    tokens = []
    scores = []
    toktypes = []
    
    import re
    byte_pattern = re.compile(r"^<0x([0-9a-fA-F]{2})>$")
    
    # Build standard Llama GGUF vocab keys
    target_vocab_size = 256006
    vocab_size_field = reader.get_field("llama.vocab_size")
    if vocab_size_field:
        target_vocab_size = int(vocab_size_field.contents())
    print(f"Target vocabulary size from GGUF: {target_vocab_size}")
    
    for i in range(target_vocab_size):
        if i not in reverse_vocab:
            tokens.append(f"[PAD{i}]".encode("utf-8"))
            scores.append(-1000.0)
            toktypes.append(gguf.TokenType.UNUSED)
        else:
            token = reverse_vocab[i]
            
            # 1. Rename lowercase byte tokens to uppercase
            match = byte_pattern.match(token)
            if match:
                hex_val = match.group(1).upper()
                token = f"<0x{hex_val}>"
                
            # 2. Rename duplicate <s> token
            if i == 2 and token == "<s>":
                token = "<s>_dup_2"
                
            tokens.append(token.encode("utf-8"))
            scores.append(0.0)
            
            # Determine token type
            str_i = str(i)
            if str_i in added_tokens_decoder:
                tok_data = added_tokens_decoder[str_i]
                if tok_data.get("special") or token.startswith("<") and token.endswith(">"):
                    toktypes.append(gguf.TokenType.CONTROL)
                else:
                    toktypes.append(gguf.TokenType.USER_DEFINED)
            else:
                toktypes.append(gguf.TokenType.NORMAL)
                
    print(f"Reconstructed tokens length: {len(tokens)}")
    
    # Verify index 1004 to 1010
    for idx in range(1004, 1010):
        print(f"Reconstructed Index {idx}: {tokens[idx].decode('utf-8')}")
        
    # Construct new_metadata overrides
    new_metadata = {
        gguf.Keys.Tokenizer.LIST: MetadataDetails(
            gguf.GGUFValueType.ARRAY,
            tokens,
            sub_type=gguf.GGUFValueType.STRING
        ),
        gguf.Keys.Tokenizer.SCORES: MetadataDetails(
            gguf.GGUFValueType.ARRAY,
            scores,
            sub_type=gguf.GGUFValueType.FLOAT32
        ),
        gguf.Keys.Tokenizer.TOKEN_TYPE: MetadataDetails(
            gguf.GGUFValueType.ARRAY,
            toktypes,
            sub_type=gguf.GGUFValueType.INT32
        )
    }
    
    print(f"Writing updated GGUF model: {OUTPUT_PATH}")
    writer = gguf.GGUFWriter(OUTPUT_PATH, arch=arch, endianess=reader.endianess)
    
    alignment = reader.get_field(gguf.Keys.General.ALIGNMENT)
    if alignment is not None:
        writer.data_alignment = alignment.contents()
        
    copy_with_new_metadata(reader, writer, new_metadata, remove_metadata=[])
    print("✓ Successfully wrote new GGUF file with correct vocabulary!")

if __name__ == "__main__":
    main()
