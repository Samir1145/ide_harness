#!/usr/bin/env bash
# Helper script to launch local quantized LegalParam or FinanceParam GGUF models via Homebrew llama-server

ENGINE="${1:-legal}" # Defaults to 'legal', options: 'legal' or 'finance'

if [ "$ENGINE" = "finance" ]; then
    PORT="8091"
    MODEL_FILE="$(dirname "$0")/../models/llm/llamafile/financeparam/financeparam-2.9b.gguf"
    MODEL_NAME="FinanceParam"
else
    PORT="8090"
    MODEL_FILE="$(dirname "$0")/../models/llm/llamafile/legalparam/legalparam-7b.gguf"
    MODEL_NAME="LegalParam"
fi

THREADS="6"

if [ ! -f "$MODEL_FILE" ]; then
    echo "[ERROR] Could not find GGUF model file at $MODEL_FILE"
    echo "Please ensure models are placed in the correct domain subfolder."
    exit 1
fi

if ! command -v llama-server &> /dev/null; then
    echo "[ERROR] llama-server not found in PATH."
    echo "Please install llama.cpp via Homebrew: brew install llama.cpp"
    exit 1
fi

echo "Starting BharatGen ${MODEL_NAME} LLM Server..."
echo "Endpoint: http://127.0.0.1:${PORT}"
echo "Context Window: 2048 tokens"
echo "Threads: ${THREADS}"

llama-server -m "$MODEL_FILE" --port "${PORT}" --threads "${THREADS}" -c 2048 --host 127.0.0.1
