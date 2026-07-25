// Helper script to prepare and configure local Llamafile server environment for BharatGen LegalParam
const fs = require('fs');
const path = require('path');

const LLM_DIR = path.join(__dirname, '..', 'models', 'llm', 'llamafile');
const PORT = process.env.LLAMAFILE_PORT || '8090';
const THREADS = process.env.LLAMAFILE_THREADS || '6';

async function main() {
    console.log('[Llamafile Setup] Verifying directory structure...');
    fs.mkdirSync(LLM_DIR, { recursive: true });

    // Windows Batch Helper
    const batPath = path.join(LLM_DIR, 'run-llamafile.bat');
    const batContent = `@echo off
echo Starting BharatGen LegalParam Llamafile Server on http://127.0.0.1:${PORT}...
set MODEL_FILE=legalparam-7b.llamafile
if not exist "%MODEL_FILE%" (
    echo [ERROR] Could not find %MODEL_FILE% in %~dp0
    echo Please place your GGUF / llamafile binary in this directory and rename to legalparam-7b.llamafile
    pause
    exit /b 1
)
"%MODEL_FILE%" --port ${PORT} --threads ${THREADS} --nobrowser
`;
    fs.writeFileSync(batPath, batContent);

    // Shell Helper (macOS/Linux)
    const shPath = path.join(LLM_DIR, 'run-llamafile.sh');
    const shContent = `#!/usr/bin/env bash
echo "Starting BharatGen LegalParam Llamafile Server on http://127.0.0.1:${PORT}..."
MODEL_FILE="$(dirname "$0")/legalparam-7b.llamafile"
if [ ! -f "$MODEL_FILE" ]; then
    echo "[ERROR] Could not find $MODEL_FILE"
    echo "Please place your GGUF / llamafile binary in $(dirname "$0") and rename to legalparam-7b.llamafile"
    exit 1
fi
chmod +x "$MODEL_FILE"
"$MODEL_FILE" --port ${PORT} --threads ${THREADS} --nobrowser
`;
    fs.writeFileSync(shPath, shContent);

    try {
        fs.chmodSync(shPath, '755');
    } catch (_) {}

    console.log(`[Llamafile Setup] ✓ Launch helpers created at: ${LLM_DIR}`);
    console.log(`[Llamafile Setup] Target Port: ${PORT} | CPU Threads: ${THREADS}`);
}

main().catch(err => {
    console.error('[Llamafile Setup] Failed:', err.message);
    process.exit(1);
});
