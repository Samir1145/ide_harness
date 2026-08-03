#!/usr/bin/env bash
# Helper script to launch local quantized LegalParam or FinanceParam GGUF models via Homebrew llama-server

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

ENGINE="${1:-legal}" # Defaults to 'legal', options: 'legal' or 'finance'
PORT="8090"

if [ "$ENGINE" = "finance" ]; then
    MODEL_FILE="$(dirname "$0")/../models/llm/llamafile/financeparam/financeparam-2.9b.gguf"
    MODEL_NAME="FinanceParam 2.9B"
else
    MODEL_FILE="$(dirname "$0")/../models/llm/llamafile/legalparam/legalparam-2.9b.gguf"
    MODEL_NAME="LegalParam 2.9B"
fi

THREADS=$(sysctl -n hw.physicalcpu 2>/dev/null || echo "4")
LOG_FILE="/tmp/hayagriva-llama-engine.log"

if [ ! -f "$MODEL_FILE" ]; then
    echo "[ERROR] Could not find GGUF model file at $MODEL_FILE" | tee -a "$LOG_FILE"
    echo "Please ensure models are placed in the correct domain subfolder." | tee -a "$LOG_FILE"
    exit 1
fi

if ! command -v llama-server &> /dev/null; then
    echo "[ERROR] llama-server not found in PATH." | tee -a "$LOG_FILE"
    echo "Please install llama.cpp via Homebrew: brew install llama.cpp" | tee -a "$LOG_FILE"
    exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting BharatGen ${MODEL_NAME} LLM Server..." | tee -a "$LOG_FILE"
echo "Endpoint: http://127.0.0.1:${PORT}" | tee -a "$LOG_FILE"
echo "Context Window: 2048 tokens" | tee -a "$LOG_FILE"
echo "Threads: ${THREADS}" | tee -a "$LOG_FILE"

exec llama-server -m "$MODEL_FILE" --port "${PORT}" --threads "${THREADS}" -c 2048 --host 127.0.0.1 >> "$LOG_FILE" 2>&1
