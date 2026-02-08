#!/bin/bash
# Test actual speed of ONE batch

set -e
cd "$(dirname "$0")"

echo "🧪 Testing ONE batch speed..."
echo ""

# 1. Check config
echo "1️⃣ Configuration:"
node test-config.mjs | grep -E "(Batch Size|Enable Thinking|Max Response)"
echo ""

# 2. Extract first 15 untranslated keys
echo "2️⃣ Creating test file with 15 keys..."
cat input/business50/localization.json | \
  python3 -c "
import json, sys
data = json.load(sys.stdin)
test_data = {}
count = 0
for file_path, keys in data.items():
    for key, langs in keys.items():
        if langs.get('tr') is None and count < 15:
            if file_path not in test_data:
                test_data[file_path] = {}
            test_data[file_path][key] = langs
            count += 1
            if count >= 15:
                break
    if count >= 15:
        break
print(json.dumps(test_data, indent=2))
" > tests/fixtures/test-batch.json

echo "   Created tests/fixtures/test-batch.json with $(cat tests/fixtures/test-batch.json | grep '\"tr\": null' | wc -l | tr -d ' ') keys"
echo ""

# 3. Run ONE translation with timing
echo "3️⃣ Running translation (watch the time!)..."
echo "   Press Ctrl+C after first batch completes"
echo ""
time ./run_translation.sh tests/fixtures/test-batch.json

echo ""
echo "✅ Test complete!"
echo ""
echo "📊 Expected timings:"
echo "   - Without thinking: 3-6 seconds per batch of 10 keys"
echo "   - With thinking: 10-15 seconds per batch of 10 keys"
echo ""
echo "If your batch took >8 seconds, thinking mode may still be enabled."
