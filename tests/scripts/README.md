# Test Scripts

Utility scripts for testing and debugging.

## Scripts

### create-test-batch.py
Creates `test-batch.json` by extracting untranslated keys from `localization.json`.

Usage:
```bash
cd /Users/ug/code/bitrix24/localization
python3 tests/scripts/create-test-batch.py
```

### test-config.mjs
Debug script to verify `.env` configuration parsing.

Usage:
```bash
pnpm exec tsx tests/scripts/test-config.mjs
```

### debug-request.mjs
Debug script to inspect the exact request being sent to MLX server.

Usage:
```bash
pnpm exec tsx tests/scripts/debug-request.mjs
```

### test-no-think.sh
Shell script to test translation with thinking mode disabled.

### test-one-batch.sh
Shell script to test a single batch translation and measure performance.

## Note

These scripts are for development/debugging only and are not part of the automated test suite.
