#!/bin/bash
set -e

# Configuration
VENV_DIR="venv"
PYTHON_SCRIPT="python-translator/bitrix24_translator_complete.py"
REQUIREMENTS="python-translator/requirements.txt"

# Default Arguments
INPUT_FILE="input/business50/localization.json"
OUTPUT_FILE="output/business50_full/localization.json"
SRC_LANGS="tr,ru,en,ua"
TGT_LANGS="tr,ru,en,ua"
BATCH_SIZE=50

echo "🚀 Setting up translation environment..."

# 1. Create venv if not exists
if [ ! -d "$VENV_DIR" ]; then
    echo "📦 Creating virtual environment ($VENV_DIR)..."
    python3 -m venv "$VENV_DIR"
fi

# 2. Activate venv
echo "🔌 Activating virtual environment..."
source "$VENV_DIR/bin/activate"

# 3. Install dependencies
echo "⬇️ Checking/Installing dependencies..."
pip install -r "$REQUIREMENTS"

# 4. Run Translation
echo ""
echo "🌍 Starting translation..."
echo "   Input: $INPUT_FILE"
echo "   Output: $OUTPUT_FILE"
echo "   Sources: $SRC_LANGS"
echo "   Targets: $TGT_LANGS"
echo "   Batch Size: $BATCH_SIZE"
echo ""

mkdir -p "$(dirname "$OUTPUT_FILE")"

# Pass "$@" to allow overriding args (e.g. --limit 100)
python "$PYTHON_SCRIPT" \
  --input "$INPUT_FILE" \
  --output "$OUTPUT_FILE" \
  --src "$SRC_LANGS" \
  --targets "$TGT_LANGS" \
  --file-batch-size "$BATCH_SIZE" \
  --cpu \
  "$@"

echo "✅ Done!"
