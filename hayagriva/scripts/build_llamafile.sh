#!/usr/bin/env bash
# Standalone llamafile compiler script for HAYAGRIVA

PORT="8090"
THREADS="6"
BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_DIR="${BASE_DIR}/models/llm/llamafile"
GGUF_FILE="${MODEL_DIR}/legalparam-7b.gguf"
OUTPUT_FILE="${MODEL_DIR}/legalparam-7b.llamafile"

echo "================================================================="
echo "   HAYAGRIVA Standalone .llamafile Executable Builder"
echo "================================================================="

if [ ! -f "$GGUF_FILE" ]; then
    echo "[ERROR] Could not find GGUF model file at $GGUF_FILE"
    exit 1
fi

echo "\n[1/3] Using local llamafile runner binary..."
cp "${MODEL_DIR}/llamafile-runner" /tmp/llamafile-runner
chmod +x /tmp/llamafile-runner

echo "\n[2/3] Creating packaging structures..."
PACK_DIR="/tmp/llamafile-pack-$(date +%s)"
mkdir -p "${PACK_DIR}"

# Copy GGUF file
cp "$GGUF_FILE" "${PACK_DIR}/model.gguf"

# Create default args file for server
cat << 'EOF' > "${PACK_DIR}/.args"
-m
model.gguf
--host
127.0.0.1
--port
8090
--nobrowser
--threads
6
-c
2048
EOF

# Zip the arguments and model weights together (using -0 to store uncompressed for memory mapping)
cd "${PACK_DIR}"
zip -0 -r /tmp/model-pack.zip .args model.gguf

# Concatenate the llamafile binary wrapper and zip payload
echo "\n[3/3] Compiling standalone executable..."
cat /tmp/llamafile-runner /tmp/model-pack.zip > "$OUTPUT_FILE"
chmod +x "$OUTPUT_FILE"

# Clean up
rm -rf /tmp/llamafile-runner /tmp/model-pack.zip "${PACK_DIR}"

echo "\n================================================================="
echo " ✓ STANDALONE LLAMAFILE COMPILED SUCCESSFULLY!"
echo " Executable location: $OUTPUT_FILE"
echo "================================================================="
