import sys
import os
from pathlib import Path

# Append the directory of llama.cpp so we can import its helper modules
sys.path.append("/tmp/llama.cpp/gguf-py")

import gguf
from gguf.scripts.gguf_new_metadata import MetadataDetails, copy_with_new_metadata

INPUT_PATH = Path("/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/models/llm/llamafile/legalparam-7b.gguf")
OUTPUT_PATH = Path("/Users/atulgrover/Desktop/HAYAGRIVA/hayagriva/models/llm/llamafile/legalparam-7b-patched.gguf")

def main():
    print(f"Loading GGUF model: {INPUT_PATH}")
    reader = gguf.GGUFReader(INPUT_PATH, "r")
    
    arch = reader.get_field(gguf.Keys.General.ARCHITECTURE).contents()
    print(f"Architecture: {arch}")
    
    # Retrieve tokenizer tokens
    tokens_field = reader.get_field(gguf.Keys.Tokenizer.LIST)
    if not tokens_field:
        print("[ERROR] tokenizer.ggml.tokens not found!")
        sys.exit(1)
        
    tokens = list(tokens_field.contents())
    print(f"Total tokens: {len(tokens)}")
    
    # Helper function to convert token type securely to string
    to_str = lambda t: t.decode("utf-8", errors="replace") if hasattr(t, "decode") else str(t)

    # Let's inspect tokens at index 1 and 2
    tok1 = to_str(tokens[1])
    tok2 = to_str(tokens[2])
    print(f"Token 1: '{tok1}' | Token 2: '{tok2}'")
    
    # Check if byte tokens are present (checking case-insensitively)
    import re
    byte_pattern = re.compile(r"^<0x([0-9a-fA-F]{2})>$")
    byte_tokens_found = 0
    for b in range(256):
        tok_name = f"<0x{b:02X}>"
        found_idx = -1
        for idx, t in enumerate(tokens):
            t_str = to_str(t)
            if t_str.upper() == tok_name.upper():
                found_idx = idx
                break
        if found_idx != -1:
            byte_tokens_found += 1
        else:
            print(f"[WARNING] Byte token {tok_name} is MISSING from GGUF!")
            
    print(f"Total byte tokens found in GGUF: {byte_tokens_found} / 256")
    
    # 1. Convert lowercase byte tokens to uppercase
    patched_byte_count = 0
    for i in range(len(tokens)):
        t = tokens[i]
        t_str = to_str(t)
        match = byte_pattern.match(t_str)
        if match:
            hex_val = match.group(1).upper()
            new_tok_str = f"<0x{hex_val}>"
            if t_str != new_tok_str:
                tokens[i] = new_tok_str.encode("utf-8")
                patched_byte_count += 1
    print(f"Patched {patched_byte_count} lowercase byte tokens to uppercase.")

    # 2. Check if there are duplicates
    seen = {}
    duplicates = []
    for i, tok in enumerate(tokens):
        tok_str = to_str(tok)
        if tok_str in seen:
            duplicates.append((i, tok_str, seen[tok_str]))
        seen[tok_str] = i
        
    print(f"Before duplicate patching, duplicate count: {len(duplicates)}")
    if duplicates:
        print("First 5 duplicates:", duplicates[:5])
        
    # We patch the duplicate tokens by renaming them uniquely
    # We rename duplicate tokens by appending '_dup_{index}'
    patched_count = 0
    seen_in_patch = {}
    for i in range(len(tokens)):
        tok = tokens[i]
        tok_str = tok.decode("utf-8", errors="replace") if isinstance(tok, bytes) else str(tok)
        if tok_str in seen_in_patch:
            # Duplicate found! Rename it
            new_tok_str = f"{tok_str}_dup_{i}"
            tokens[i] = new_tok_str.encode("utf-8")
            patched_count += 1
        else:
            seen_in_patch[tok_str] = i
            
    print(f"Patched {patched_count} duplicate tokens.")
    
    # Let's verify duplicates are now 0
    seen_after = {}
    duplicates_after = []
    for i, tok in enumerate(tokens):
        tok_str = tok.decode("utf-8", errors="replace") if isinstance(tok, bytes) else tok
        if tok_str in seen_after:
            duplicates_after.append((i, tok_str, seen_after[tok_str]))
        seen_after[tok_str] = i
    print(f"After patching, duplicate count: {len(duplicates_after)}")
    
    # Construct new_metadata
    new_metadata = {
        gguf.Keys.Tokenizer.LIST: MetadataDetails(
            gguf.GGUFValueType.ARRAY,
            tokens,
            sub_type=gguf.GGUFValueType.STRING
        )
    }
    
    print(f"Writing updated GGUF model: {OUTPUT_PATH}")
    writer = gguf.GGUFWriter(OUTPUT_PATH, arch=arch, endianess=reader.endianess)
    
    alignment = reader.get_field(gguf.Keys.General.ALIGNMENT)
    if alignment is not None:
        writer.data_alignment = alignment.contents()
        
    copy_with_new_metadata(reader, writer, new_metadata, remove_metadata=[])
    print("✓ Successfully wrote new GGUF file!")

if __name__ == "__main__":
    main()
