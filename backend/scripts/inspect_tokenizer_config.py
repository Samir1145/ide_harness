import json
from huggingface_hub import hf_hub_download

SOURCE_MODEL_ID = "bharatgenai/LegalParam"
fpath = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename="tokenizer_config.json")
with open(fpath, "r", encoding="utf-8") as f:
    data = json.load(f)
    print(json.dumps(data, indent=2))
