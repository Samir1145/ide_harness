#!/bin/zsh

# Hayagriva Stop
# Kills Hayagriva runner and Electron

LOGFILE="/tmp/hayagriva-launcher.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOGFILE"
}

log "Stopping Hayagriva..."

# Find and kill Hayagriva proxy, backend, and browser CLI processes
pkill -f "node cli.js" 2>/dev/null || true
pkill -f "theia start" 2>/dev/null || true
pkill -f "theia build" 2>/dev/null || true

# Find and kill Hayagriva Electron processes & workers
pkill -f "Electron.bin" 2>/dev/null || true
pkill -f "theia-electron-main.js" 2>/dev/null || true
pkill -f "electron scripts/theia-electron-main.js" 2>/dev/null || true
pkill -f "theia-ide-electron" 2>/dev/null || true
pkill -f "Electron Framework" 2>/dev/null || true
pkill -f "Electron Helper" 2>/dev/null || true
pkill -f "plugin-host" 2>/dev/null || true
pkill -f "ipc-bootstrap" 2>/dev/null || true
pkill -f "monitor_backend_health" 2>/dev/null || true

# Also kill anything listening on the primary ports:
# 3210 (Hayagriva proxy), 3000 (Theia Browser backend), 8080 (wiki), 9222 (CDP Debugging), 8090/8091 (Llamafiles)
for port in 3210 3000 8080 9222 8090 8091; do
    if lsof -ti :$port >/dev/null 2>&1; then
        log "Force killing processes holding port $port..."
        lsof -ti :$port | xargs kill -9 2>/dev/null || true
    fi
done

# Revert case settings to activeMode: lite for next boot
find "$HOME/Documents" -name "hayagriva_settings.json" -type f 2>/dev/null | while read -r f; do
    if [ -f "$f" ]; then
        node -e "try { const p = process.argv[1]; const data = JSON.parse(require('fs').readFileSync(p, 'utf8')); data.activeMode = 'lite'; require('fs').writeFileSync(p, JSON.stringify(data, null, 2), 'utf8'); } catch (_) {}" "$f" 2>/dev/null || true
    fi
done

log "Hayagriva stopped."
