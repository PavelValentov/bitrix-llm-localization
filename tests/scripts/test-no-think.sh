#!/bin/bash
# Test if /no_think token is working

set -e
cd "$(dirname "$0")"

echo "🧪 Testing /no_think token implementation"
echo ""

# 1. Stop old server
pkill -f mlx_server.py || true
sleep 2

# 2. Run translation
echo "Running translation with thinking=false..."
./run_translation.sh tests/fixtures/test-batch.json 2>&1 | grep -E "(Config:|Thinking mode|no_think)" &
TRANSLATE_PID=$!

# 3. Wait for first batch
sleep 30

# 4. Check MLX server logs
echo ""
echo "📋 MLX Server Logs:"
tail -20 logs/mlx-server.log | grep -E "(enable_thinking|Thinking mode|no_think)" || echo "   (no debug output found)"

# 5. Check translation logs for <think> tags
echo ""
echo "📋 Checking for <think> tags in response:"
if tail -500 logs/translation.log | grep -q "<think>"; then
    echo "   ❌ FOUND <think> tags in output!"
    tail -500 logs/translation.log | grep -A 2 "<think>" | head -10
else
    echo "   ✅ No <think> tags found!"
fi

# 6. Cleanup
kill $TRANSLATE_PID 2>/dev/null || true
pkill -f mlx_server.py || true

echo ""
echo "✅ Test complete!"
