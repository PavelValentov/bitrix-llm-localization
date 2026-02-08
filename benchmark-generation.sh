#!/bin/bash
# Benchmark pure generation speed (no startup overhead)

set -e
cd "$(dirname "$0")"

echo "⚡ PURE GENERATION SPEED BENCHMARK"
echo ""

# 1. Start MLX server (one time)
echo "1️⃣ Starting MLX server..."
pkill -f mlx_server.py || true
sleep 2

source mlx-server/venv/bin/activate
python mlx-server/mlx_server.py \
  -m ~/.lmstudio/models/lmstudio-community/Qwen3-8B-MLX-8bit \
  -p 8765 \
  --reload-every 0 > logs/mlx-server.log 2>&1 &
MLX_PID=$!

echo "   Waiting for server..."
sleep 15

# 2. Benchmark 3 consecutive requests
echo ""
echo "2️⃣ Running 3 consecutive translation requests..."
echo "   (same server, no restart overhead)"
echo ""

for i in 1 2 3; do
    echo "Request $i:"
    START=$(date +%s)
    
    # Create fresh test file
    rm -f tests/fixtures/test-batch.json
    python3 tests/scripts/create-test-batch.py > /dev/null 2>&1
    
    # Run translation
    TRANSLATION_BACKEND=local-server \
    LOCAL_SERVER_URL=http://127.0.0.1:8765 \
    pnpm exec tsx scripts/translate.ts tests/fixtures/test-batch.json \
      --required=tr \
      --output=. > /dev/null 2>&1
    
    END=$(date +%s)
    DURATION=$((END - START))
    echo "   Time: ${DURATION}s"
done

# 3. Cleanup
kill $MLX_PID 2>/dev/null || true

echo ""
echo "📊 Analysis:"
echo "   - First request may be slower (model warmup)"
echo "   - Requests 2-3 show real generation speed"
echo ""
echo "Expected:"
echo "   - Without thinking: 3-6s per batch"
echo "   - With thinking: 10-15s per batch"
