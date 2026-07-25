import os
from huggingface_hub import hf_hub_download
import json

SOURCE_MODEL_ID = "bharatgenai/LegalParam"
inspect_dir = "/tmp/inspect_vocab"
os.makedirs(inspect_dir, exist_ok=True)

for tok_file in ["tokenizer.model", "tokenizer.json", "tokenizer_config.json", "special_tokens_map.json", "added_tokens.json"]:
    try:
        fpath = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename=tok_file)
        print(f"Downloaded {tok_file}")
        if tok_file.endswith(".json"):
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
                print(f"--- {tok_file} content key list/size: {len(data)}")
                if tok_file == "added_tokens.json":
                    print(json.dumps(data, indent=2))
                elif tok_file == "special_tokens_map.json":
                    print(json.dumps(data, indent=2))
    except Exception as e:
        print(f"Skipped {tok_file}: {e}")
