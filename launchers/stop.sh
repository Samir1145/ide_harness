#!/usr/bin/env bash
# Hayagriva Shutdown Script for Linux
echo "Stopping Hayagriva background services..."

# Terminate process on port 3210 (Backend Proxy)
fuser -k 3210/tcp 2>/dev/null || true

# Terminate process on port 8090 (LLM Server)
fuser -k 8090/tcp 2>/dev/null || true

# Terminate node daemon and llama-server by name if still alive
pkill -f "node cli.js" 2>/dev/null || true
pkill -f "llama-server" 2>/dev/null || true

echo "All Hayagriva background services stopped."
