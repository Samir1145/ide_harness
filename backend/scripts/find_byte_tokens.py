import json
from huggingface_hub import hf_hub_download

SOURCE_MODEL_ID = "bharatgenai/LegalParam"
fpath = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename="tokenizer.json")
with open(fpath, "r", encoding="utf-8") as f:
    data = json.load(f)
    vocab = data["model"]["vocab"]
    
    # Check if '<0x00>' or similar is in vocab
    found_count = 0
    for byte_val in range(256):
        tok = f"<0x{byte_val:02X}>"
        if tok in vocab:
            found_count += 1
            if found_count <= 10:
                print(f"Found {tok} at index {vocab[tok]}")
        else:
            pass
            
    print(f"Total byte tokens found in vocab: {found_count} / 256")
