import json
from huggingface_hub import hf_hub_download

SOURCE_MODEL_ID = "bharatgenai/LegalParam"
fpath = hf_hub_download(repo_id=SOURCE_MODEL_ID, filename="tokenizer.json")
with open(fpath, "r", encoding="utf-8") as f:
    data = json.load(f)
    vocab = data["model"]["vocab"]
    # Sort vocab by ID to see the sequence
    sorted_vocab = sorted(vocab.items(), key=lambda x: x[1])
    print("First 15 tokens in sorted vocab:")
    for token, token_id in sorted_vocab[:15]:
        print(f"ID {token_id}: {token}")

    # Check for duplicate IDs or duplicate tokens
    seen_tokens = {}
    seen_ids = {}
    duplicates_tokens = []
    duplicates_ids = []
    for token, token_id in vocab.items():
        if token in seen_tokens:
            duplicates_tokens.append((token, token_id, seen_tokens[token]))
        seen_tokens[token] = token_id
        
        if token_id in seen_ids:
            duplicates_ids.append((token_id, token, seen_ids[token_id]))
        seen_ids[token_id] = token

    print(f"\nTotal vocab size in tokenizer.json: {len(vocab)}")
    print(f"Duplicate tokens count: {len(duplicates_tokens)}")
    print(f"Duplicate IDs count: {len(duplicates_ids)}")
    if duplicates_tokens:
        print("Duplicate tokens details:", duplicates_tokens[:10])
    if duplicates_ids:
        print("Duplicate IDs details:", duplicates_ids[:10])
