#!/usr/bin/env bash
# Helper script to launch local quantized LegalParam or FinanceParam GGUF models via Homebrew llama-server

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

ENGINE="${1:-legal}" # Defaults to 'legal', options: 'legal' or 'finance'
PORT="8090"

MODELS_BASE="${HAYA_MODELS_PATH:-}"
if [ -z "$MODELS_BASE" ]; then
    if [ -d "$(dirname "$0")/../models/llm" ]; then
        MODELS_BASE="$(dirname "$0")/../models/llm"
    elif [ -d "/Users/atulgrover/Desktop/ide_models/weights/llm" ]; then
        MODELS_BASE="/Users/atulgrover/Desktop/ide_models/weights/llm"
    elif [ -d "$HOME/Desktop/ide_models/weights/llm" ]; then
        MODELS_BASE="$HOME/Desktop/ide_models/weights/llm"
    elif [ -d "/Users/atulgrover/Desktop/haya_models/weights/llm" ]; then
        MODELS_BASE="/Users/atulgrover/Desktop/haya_models/weights/llm"
    elif [ -d "$HOME/Desktop/haya_models/weights/llm" ]; then
        MODELS_BASE="$HOME/Desktop/haya_models/weights/llm"
    else
        MODELS_BASE="$(dirname "$0")/../models/llm"
    fi
fi

if [ "$ENGINE" = "finance" ]; then
    MODEL_FILE="${MODELS_BASE}/llamafile/financeparam/financeparam-2.9b.gguf"
    MODEL_NAME="FinanceParam 2.9B"
elif [ "$ENGINE" = "saul" ]; then
    MODEL_FILE="${MODELS_BASE}/saul/Saul-Instruct-v1.Q4_K_M.gguf"
    MODEL_NAME="SaulLM 7B Instruct"
else
    MODEL_FILE="${MODELS_BASE}/llamafile/legalparam/legalparam-2.9b.gguf"
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
