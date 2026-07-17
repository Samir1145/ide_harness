#!/bin/zsh

# Hayagriva Launcher

# Robust PATH setup for macOS environment
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

# Local Ollama LLM optimization parameters
export OLLAMA_MODEL="qwen2.5-coder:1.5b"
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_NUM_PARALLEL=1

# Load NVM (Node Version Manager) if installed
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
fi

# Source profiles as fallback
if [ -f "$HOME/.zprofile" ]; then
    source "$HOME/.zprofile"
fi
if [ -f "$HOME/.zshrc" ]; then
    source "$HOME/.zshrc"
fi
if [ -f "$HOME/.profile" ]; then
    source "$HOME/.profile"
fi

set -e

# Dynamically resolve root directory of the command
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
HAYAGRIVA_DIR="$ROOT_DIR/hayagriva"
THEIA_DIR="$ROOT_DIR/ide/applications/electron"
LOGFILE="/tmp/hayagriva-launcher.log"

# Clean up any residual processes from previous sessions to prevent port conflicts
"$ROOT_DIR/stop.command"

# Register trap to clean up on any exit or termination signal
trap '"$ROOT_DIR/stop.command"; exit' INT TERM HUP EXIT

# Load VAULT_KEY and any other secrets from hayagriva/.env (never committed to git)
if [ -f "$HAYAGRIVA_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$HAYAGRIVA_DIR/.env"
    set +a
fi


log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGFILE"
}

log "Hayagriva launcher starting in $ROOT_DIR"
if [ -n "$VAULT_KEY" ]; then
    log "Law vault key loaded from .env"
fi

# Verify Pandoc binaries exist, otherwise download them on-demand
PANDOC_BIN_DIR="$HAYAGRIVA_DIR/bin"
PANDOC_ARM="$PANDOC_BIN_DIR/pandoc-arm64"
PANDOC_X64="$PANDOC_BIN_DIR/pandoc-x64"

if [ ! -f "$PANDOC_ARM" ] || [ ! -f "$PANDOC_X64" ]; then
    log "Pandoc binaries missing in $PANDOC_BIN_DIR. Downloading on-demand..."
    mkdir -p "$PANDOC_BIN_DIR"
    
    if [ ! -f "$PANDOC_ARM" ]; then
        log "Downloading Pandoc ARM64..."
        curl -L -o /tmp/pandoc-arm.zip https://github.com/jgm/pandoc/releases/download/3.6/pandoc-3.6-arm64-macOS.zip
        unzip -o -j /tmp/pandoc-arm.zip "*/bin/pandoc" -d "$PANDOC_BIN_DIR/"
        mv "$PANDOC_BIN_DIR/pandoc" "$PANDOC_ARM"
        rm -f /tmp/pandoc-arm.zip
    fi
    
    if [ ! -f "$PANDOC_X64" ]; then
        log "Downloading Pandoc x86_64..."
        curl -L -o /tmp/pandoc-x64.zip https://github.com/jgm/pandoc/releases/download/3.6/pandoc-3.6-x86_64-macOS.zip
        unzip -o -j /tmp/pandoc-x64.zip "*/bin/pandoc" -d "$PANDOC_BIN_DIR/"
        mv "$PANDOC_BIN_DIR/pandoc" "$PANDOC_X64"
        rm -f /tmp/pandoc-x64.zip
    fi
    
    chmod +x "$PANDOC_ARM" "$PANDOC_X64"
    log "Pandoc binaries configured successfully."
fi



# Check if hayagriva proxy is already running
PORT=3210
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    log "Hayagriva proxy already running on port $PORT"
else
    log "Starting Hayagriva proxy..."
    cd "$HAYAGRIVA_DIR"
    node scripts/download-onnx.js
    nohup node cli.js --watch-all >> "$LOGFILE" 2>&1 &
    HAYAGRIVA_PID=$!
    log "Hayagriva proxy started (PID: $HAYAGRIVA_PID)"
    
    # Wait for proxy to be ready
    for i in {1..30}; do
        if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
            log "Hayagriva proxy ready on port $PORT"
            break
        fi
        sleep 1
    done
fi

# Calculate hashes representing dependency locks and extensions for change detection
calculate_checksum() {
    (
        cat "$HAYAGRIVA_DIR/package.json" 2>/dev/null
        cat "$HAYAGRIVA_DIR/yarn.lock" 2>/dev/null
        cat "$THEIA_DIR/package.json" 2>/dev/null
        cat "$THEIA_DIR/yarn.lock" 2>/dev/null
        find "$ROOT_DIR/ide/theia-extensions/hayagriva/src" -type f -name "*.ts" -exec cat {} + 2>/dev/null
    ) | md5
}

# ── DOWNSTREAM UPDATE CHECK ──────────────────────────────────────────────────
CHECKSUM_FILE="$THEIA_DIR/.last-launch-build-checksum"
CURRENT_HASH=$(calculate_checksum)

if [ ! -f "$CHECKSUM_FILE" ] || [ "$(cat "$CHECKSUM_FILE")" != "$CURRENT_HASH" ]; then
    log "Downstream updates or extension modifications detected."
    log "Auto-synchronizing dependencies and rebuilding frontend bundle. Please wait..."
    
    # Sync backend dependencies
    cd "$HAYAGRIVA_DIR"
    yarn install --frozen-lockfile || yarn install
    
    # Sync frontend dependencies and rebuild bundle
    cd "$THEIA_DIR"
    yarn install --frozen-lockfile || yarn install
    yarn build
    
    # Save new checksum to tracking file
    echo "$CURRENT_HASH" > "$CHECKSUM_FILE"
    log "Frontend bundle and dependencies updated successfully."
fi
# ─────────────────────────────────────────────────────────────────────────────

# Start Hayagriva Electron app
log "Starting Hayagriva Electron app..."
cd "$THEIA_DIR"
unset ELECTRON_RUN_AS_NODE
yarn start

# Clean up will trigger automatically via the trap registered above
exit 0
