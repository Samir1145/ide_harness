#!/usr/bin/env bash
# Hayagriva Sovereign IDE Launcher for Linux (Ubuntu / Debian / RHEL)
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HAYAGRIVA_DIR="$ROOT_DIR/backend"
THEIA_DIR="$ROOT_DIR/frontend/applications/electron"
LOGFILE="/tmp/hayagriva-launcher.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Hayagriva Sovereign IDE on Linux..." | tee -a "$LOGFILE"

# Verify Node.js and Yarn
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not found in PATH. Please install Node.js >= 18."
    exit 1
fi

if ! command -v yarn &> /dev/null; then
    echo "[ERROR] Yarn is not found in PATH. Please install Yarn (npm install -g yarn)."
    exit 1
fi

# Clean up any lingering processes on ports 3210 and 8090
if [ -f "$ROOT_DIR/stop.sh" ]; then
    bash "$ROOT_DIR/stop.sh" >/dev/null 2>&1 || true
fi

# Trap signals to clean up on exit
trap 'bash "$ROOT_DIR/stop.sh" >/dev/null 2>&1 || true; exit' INT TERM HUP EXIT

# Install backend dependencies if missing
if [ ! -d "$HAYAGRIVA_DIR/node_modules" ]; then
    echo "Installing backend dependencies..."
    (cd "$HAYAGRIVA_DIR" && yarn install)
fi

# Start backend daemon on port 3210
PORT=3210
echo "Starting Hayagriva backend daemon on port $PORT..."
cd "$HAYAGRIVA_DIR"
nohup node cli.js --watch-all >> "$LOGFILE" 2>&1 &
BACKEND_PID=$!
echo "Backend daemon active (PID: $BACKEND_PID)"

# Wait for backend to be ready
for i in {1..20}; do
    if curl -s http://127.0.0.1:$PORT/api/hayagriva/marketplace/suites-metadata >/dev/null 2>&1; then
        echo "✓ Backend daemon verified and responsive."
        break
    fi
    sleep 1
done

# Build Theia extensions if needed
if [ ! -d "$THEIA_DIR/lib" ]; then
    echo "Building frontend extensions..."
    (cd "$ROOT_DIR/frontend/theia-extensions/product" && yarn build)
    (cd "$ROOT_DIR/frontend/theia-extensions/hayagriva" && yarn build)
    (cd "$THEIA_DIR" && yarn build)
fi

# Launch Electron frontend
echo "Launching Hayagriva Electron IDE..."
cd "$THEIA_DIR"
unset ELECTRON_RUN_AS_NODE
yarn start
