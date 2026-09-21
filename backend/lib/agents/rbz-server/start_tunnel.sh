#!/usr/bin/env bash
# Resolution Bazaar (RBZ) Server & Cloudflare Tunnel Launcher
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=4001

echo "=========================================================================="
echo "  🌐 RESOLUTION BAZAAR (RBZ) CLOUD SERVER & CLOUDFLARE TUNNEL"
echo "=========================================================================="

# 1. Verify PostgreSQL is running on port 5432
if ! lsof -Pi :5432 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  PostgreSQL does not appear to be listening on port 5432."
    echo "   Attempting to start PostgreSQL via brew services..."
    brew services start postgresql@16 || true
    sleep 2
fi

# 2. Verify cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared CLI is not found in PATH."
    echo "   Please install it with: brew install cloudflared"
    exit 1
fi

# 3. Start RBZ Server on Port 4001 if not already running
SERVER_PID=""
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "✓ RBZ Server is already running on port $PORT."
else
    echo "▶ Starting RBZ Standalone Server on port $PORT..."
    node "$DIR/server.js" "$PORT" &
    SERVER_PID=$!
    
    # Wait for server to be responsive
    for i in {1..15}; do
        if curl -s "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
            echo "✓ RBZ Server active and healthy on http://127.0.0.1:$PORT (PID: $SERVER_PID)"
            break
        fi
        sleep 1
    done
fi

# Cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down Cloudflare tunnel..."
    if [ -n "$SERVER_PID" ]; then
        echo "Stopping RBZ server (PID: $SERVER_PID)..."
        kill "$SERVER_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup INT TERM HUP

echo ""
echo "▶ Connecting Permanent Cloudflare Tunnel (Tunnel ID: 5408c6f0-e518-4e46-a46f-4fb72d036e34)..."
echo "   (Routing traffic to http://localhost:$PORT)..."
echo "--------------------------------------------------------------------------"

# Launch permanent cloudflared tunnel using Cloudflare Zero Trust token
TOKEN="eyJhIjoiZjBiOWI5ZDY1NDM3ZDJlZjFjOThkNDZiMWMzMzMzN2IiLCJ0IjoiNTQwOGM2ZjAtZTUxOC00ZTQ2LWE0NmYtNGZiNzJkMDM2ZTM0IiwicyI6IlpURTRZMlkwTnpBdE1EVTBOaTAwWldRNExXSTROek10TjJFeVlqQXpOelExTmpKaSJ9"
cloudflared tunnel run --token "$TOKEN"
