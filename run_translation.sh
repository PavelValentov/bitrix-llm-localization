#!/bin/bash
set -e

# -----------------------------------------------------------------------------
# run_translation.sh — Local MLX server + Node.js translation
# 1. Load .env
# 2. Activate Python venv, start mlx-server with Qwen model
# 3. Run pnpm translate with TRANSLATION_BACKEND=local-server
# -----------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
VENV_DIR="$SCRIPT_DIR/mlx-server/venv"
MLX_REQUIREMENTS="$SCRIPT_DIR/mlx-server/requirements.txt"
MLX_SERVER="$SCRIPT_DIR/mlx-server/mlx_server.py"
MODEL_PATH="${MLX_MODEL_PATH:-$HOME/.lmstudio/models/lmstudio-community/Qwen3-8B-MLX-8bit}"
SERVER_PORT="${LOCAL_SERVER_PORT:-8765}"
SERVER_URL="http://127.0.0.1:$SERVER_PORT"

# Default translation args
# In-place: read/write same file for resumability (interrupt with Ctrl+C, resume on next run)
INPUT_FILE="${1:-input/business50/localization.json}"
REQUIRED_LANGS="${REQUIRED_LANGS:-ru,tr,en}"
OUTPUT_DIR="${OUTPUT_DIR:-.}"
[ $# -gt 0 ] && shift

if [ ! -f "$INPUT_FILE" ]; then
  echo "❌ Input file not found: $INPUT_FILE"
  echo ""
  echo "Usage: ./run_translation.sh [input-file]"
  echo "  Default: input/business50/localization.json"
  echo "  Example: ./run_translation.sh input/business50/localization.json"
  exit 1
fi

MLX_PID=""
TRANSLATE_PID=""

cleanup() {
  # If translation is running, let it handle SIGINT gracefully (save progress)
  if [ -n "$TRANSLATE_PID" ] && kill -0 "$TRANSLATE_PID" 2>/dev/null; then
    echo ""
    echo "⏳ Waiting for translation to save progress..."
    wait "$TRANSLATE_PID" 2>/dev/null || true
  fi
  # Then stop MLX server
  if [ -n "$MLX_PID" ] && kill -0 "$MLX_PID" 2>/dev/null; then
    echo "🛑 Stopping MLX server (PID $MLX_PID)..."
    kill "$MLX_PID" 2>/dev/null || true
    wait "$MLX_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# 1. Load .env
if [ -f "$SCRIPT_DIR/.env" ]; then
  echo "📄 Loading .env..."
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# Ensure local-server backend for this run
export TRANSLATION_BACKEND="${TRANSLATION_BACKEND:-local-server}"
export LOCAL_SERVER_URL="${LOCAL_SERVER_URL:-$SERVER_URL}"

echo "🚀 Setting up translation environment..."
echo "   Backend: $TRANSLATION_BACKEND"
echo "   Server URL: $LOCAL_SERVER_URL"
echo ""

# 2. Python venv for mlx-server
if [ ! -d "$VENV_DIR" ]; then
  echo "📦 Creating MLX virtual environment ($VENV_DIR)..."
  python3 -m venv "$VENV_DIR"
fi

echo "🔌 Activating Python venv..."
source "$VENV_DIR/bin/activate"

echo "⬇️ Upgrading pip..."
pip install -q -U pip
echo "⬇️ Checking MLX dependencies..."
pip install -q -r "$MLX_REQUIREMENTS"

# 3. Start MLX server in background
mkdir -p logs

if [ ! -d "$MODEL_PATH" ] && [ ! -f "$MODEL_PATH" ]; then
  echo "❌ Model not found: $MODEL_PATH"
  echo "   Set MLX_MODEL_PATH or install the model to the default path."
  exit 1
fi

echo ""
echo "🖥️  Starting MLX server (model: $(basename "$MODEL_PATH"))..."
python "$MLX_SERVER" \
  --model "$MODEL_PATH" \
  --port "$SERVER_PORT" \
  --reload-every 10 \
  > logs/mlx-server.log 2>&1 &
MLX_PID=$!

echo "   Server PID: $MLX_PID (logs: logs/mlx-server.log)"
echo "   Waiting for server readiness..."

# Wait for /health
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL/health" 2>/dev/null | grep -q 200; then
    echo "   ✅ Server ready."
    break
  fi
  sleep 2
  WAITED=$((WAITED + 2))
  echo -n "."
done
echo ""

if [ $WAITED -ge $MAX_WAIT ]; then
  echo "❌ Server did not become ready within ${MAX_WAIT}s. Check logs/mlx-server.log"
  exit 1
fi

# 4. Run translation
echo ""
echo "🌍 Starting translation (in-place, resumable)..."
echo "   File: $INPUT_FILE"
echo "   Required langs: $REQUIRED_LANGS"
echo ""

# Run translation (don't exit on non-zero — Ctrl+C returns 0 after graceful save)
# Run tsx directly so TRANSLATE_PID is the Node process (not pnpm); then wait() really waits for sync save on SIGINT.
# CRITICAL: Use --max-old-space-size=4096 to allow 4GB heap (JSON.stringify of 800k objects needs 500MB-1GB)
set +e
TSX_BIN="$SCRIPT_DIR/node_modules/.bin/tsx"
if [ ! -x "$TSX_BIN" ]; then
  echo "❌ tsx not found. Run: pnpm install"
  exit 1
fi
NODE_OPTIONS="--max-old-space-size=4096" "$TSX_BIN" scripts/translate.ts "$INPUT_FILE" \
  --required="$REQUIRED_LANGS" \
  --output="$OUTPUT_DIR" \
  "$@" &
TRANSLATE_PID=$!

on_sigint() {
  if [ -n "$TRANSLATE_PID" ] && kill -0 "$TRANSLATE_PID" 2>/dev/null; then
    echo ""
    echo "⏳ Interrupted — sending SIGINT to translation process, waiting for save..."
    echo "⚠️  DO NOT press Ctrl+C again! The process is saving a 35MB file (20-30 seconds)."
    echo ""
    
    # TRANSLATE_PID is the Node (tsx) process; it will sync-save and exit on SIGINT.
    kill -INT "$TRANSLATE_PID" 2>/dev/null
    
    # Wait for process to exit. If wait is interrupted by another signal, keep waiting.
    while kill -0 "$TRANSLATE_PID" 2>/dev/null; do
      wait "$TRANSLATE_PID" 2>/dev/null || true
      sleep 1
    done
    echo "   ✓ Translation process exited cleanly"
  fi
  TRANSLATE_PID=""
  exit 130
}
trap on_sigint SIGINT

wait "$TRANSLATE_PID"
EXIT_CODE=$?
trap - SIGINT
TRANSLATE_PID=""
set -e

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "✅ Done!"
else
  echo ""
  echo "⚠️  Translation exited with code $EXIT_CODE"
fi
