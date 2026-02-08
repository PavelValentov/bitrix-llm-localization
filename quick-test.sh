#!/bin/bash
# Quick test to check thinking mode status

set -e
cd "$(dirname "$0")"

echo "🔍 QUICK THINKING MODE TEST"
echo ""

# 1. Kill any running server
echo "1️⃣ Stopping old MLX server..."
pkill -f mlx_server.py || true
sleep 2

# 2. Check config
echo ""
echo "2️⃣ Configuration:"
node test-config.mjs | grep "Enable Thinking"

# 3. Run ONE translation batch
echo ""
echo "3️⃣ Running ONE batch..."
echo "   Watch for MLX server debug output!"
echo ""

# Start translation and capture server logs
./run_translation.sh tests/fixtures/test-batch.json 2>&1 | head -50 &
TRANSLATE_PID=$!

# Wait a bit for server to start
sleep 15

# Show server logs with thinking mode status
echo ""
echo "📋 MLX Server Debug Output:"
tail -30 logs/mlx-server.log | grep -E "(enable_thinking|WARNING|Thinking mode)" || echo "   (no thinking debug found)"

# Stop translation
kill $TRANSLATE_PID 2>/dev/null || true

# Stop MLX server
pkill -f mlx_server.py || true

echo ""
echo "✅ Test complete!"
echo ""
echo "If you see 'WARNING: Thinking mode ENABLED' above,"
echo "then thinking mode is still on despite config saying false!"
