#!/bin/bash

# Hayagriva Stop
# Kills Hayagriva runner and Electron

set -e

LOGFILE="/tmp/hayagriva-launcher.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGFILE"
}

log "Stopping Hayagriva..."

# Find and kill Hayagriva proxy processes
pkill -f "node cli.js" 2>/dev/null || true

# Find and kill Hayagriva Electron processes
pkill -f "electron scripts/theia-electron-main.js" 2>/dev/null || true
pkill -f "theia-ide-electron" 2>/dev/null || true

# Also kill on port 3210 (Hayagriva proxy) and 8080 (wiki)
lsof -ti :3210 | xargs kill -9 2>/dev/null || true
lsof -ti :8080 | xargs kill -9 2>/dev/null || true

log "Hayagriva stopped."
