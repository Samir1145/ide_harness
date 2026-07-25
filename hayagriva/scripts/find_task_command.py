import json

transcript_path = "/Users/atulgrover/.gemini/antigravity-ide/brain/e22fa970-866a-44a8-9e1b-c8072e74990c/.system_generated/logs/transcript.jsonl"
with open(transcript_path, "r", encoding="utf-8") as f:
    for line in f:
        try:
            step = json.loads(line)
            step_idx = step.get('step_index')
            if 850 <= step_idx <= 885:
                tool_calls = step.get("tool_calls", [])
                for call in tool_calls:
                    print(f"Step {step_idx}: {call.get('name')} -> {json.dumps(call.get('args'))}")

        except Exception as e:
            pass
