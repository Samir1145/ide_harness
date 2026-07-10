#!/bin/bash

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
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HAYAGRIVA_DIR="$ROOT_DIR/hayagriva"
THEIA_DIR="$ROOT_DIR/ide/applications/electron"
LOGFILE="/tmp/hayagriva-launcher.log"

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


# Check if hayagriva proxy is already running
PORT=3210
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    log "Hayagriva proxy already running on port $PORT"
else
    log "Starting Hayagriva proxy..."
    cd "$HAYAGRIVA_DIR"
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

# Start Hayagriva Electron app
log "Starting Hayagriva Electron app..."
cd "$THEIA_DIR"
unset ELECTRON_RUN_AS_NODE
yarn start

# Clean up all background servers when user quits the app
"$ROOT_DIR/stop.command"
