#!/bin/bash
# Restart translation with clean state

set -e

cd "$(dirname "$0")"

echo "🔄 Restarting translation with fresh config..."
echo ""

# 1. Kill any running MLX server or translation
echo "1️⃣  Stopping any running processes..."
pkill -f mlx_server.py || true
pkill -f translate.ts || true
sleep 2

# 2. Verify configuration
echo ""
echo "2️⃣  Verifying configuration..."
node tests/scripts/test-config.mjs | grep -E "(Batch Size|Enable Thinking|Max Response)" || {
    echo "❌ Configuration check failed!"
    exit 1
}

# 3. Check if thinking mode is disabled
THINKING_STATUS=$(node tests/scripts/test-config.mjs | grep "Enable Thinking" | grep -o "false\|true")
if [ "$THINKING_STATUS" = "true" ]; then
    echo ""
    echo "❌ ERROR: Thinking mode is ENABLED!"
    echo "   This will make translation 3x slower."
    echo ""
    echo "Fix: Add to .env file:"
    echo "   ENABLE_MODEL_THINKING=false"
    echo ""
    exit 1
fi

echo ""
echo "✅ Configuration verified:"
echo "   - Thinking mode: DISABLED"
echo "   - Ready to start"
echo ""

# 4. Start translation
echo "3️⃣  Starting fresh translation..."
echo ""

./run_translation.sh input/business50/localization.json

echo ""
echo "✅ Translation completed!"
