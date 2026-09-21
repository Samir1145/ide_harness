#!/usr/bin/env bash
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
bash "$ROOT_DIR/backend/lib/agents/rbz-server/start_tunnel.sh"
