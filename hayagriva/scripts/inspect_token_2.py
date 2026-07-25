import json
import os
from huggingface_hub import hf_hub_download

SOURCE_MODEL_ID = "bharatgenai/LegalParam"
fpath = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename="tokenizer_config.json")
with open(fpath, "r", encoding="utf-8") as f:
    data = json.load(f)
    added_tokens = data.get("added_tokens_decoder", {})
    print("Token 1 mapping:", added_tokens.get("1"))
    print("Token 2 mapping:", added_tokens.get("2"))
    print("Token 3 mapping:", added_tokens.get("3"))
    print("Token 4 mapping:", added_tokens.get("4"))
    
    # Print all mappings below 10
    for k, v in added_tokens.items():
        if int(k) < 10:
            print(f"Token {k}: {v}")
