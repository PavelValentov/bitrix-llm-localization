# Tests Directory

Automated tests and test utilities for the Bitrix24 localization system.

## Structure

```
tests/
├── fixtures/          # Test data files (JSON)
│   ├── test-batch.json       # Small batch for quick tests
│   ├── test-huge-key.json    # Huge key (7700+ chars) for edge case testing
│   └── test-long-key.json    # Abbreviated huge key
│
├── scripts/           # Test utility scripts
│   ├── create-test-batch.py  # Generate test batches from main localization file
│   ├── test-config.mjs       # Debug .env configuration
│   ├── debug-request.mjs     # Debug MLX server requests
│   ├── test-no-think.sh      # Test thinking mode disabled
│   └── test-one-batch.sh     # Performance test for single batch
│
└── *.test.ts          # Vitest test files
```

## Test Types

### Unit Tests
- `translator.test.ts` - Translator class unit tests
- `utils.test.ts` - Utility functions
- `translation-utils.test.ts` - Translation helpers
- `aggregator.test.ts` - Aggregator logic
- `restorer.test.ts` - Restore logic
- `fill-gaps.test.ts` - Fill gaps logic

### Integration Tests
- `translator-local-server.test.ts` - MLX server integration
- `script.integration.test.ts` - CLI script integration

### E2E Tests
- `e2e-mlx-translation.test.ts` - Full translation pipeline with real model

## Running Tests

### All tests
```bash
pnpm test
```

### Unit tests only
```bash
pnpm test:unit
```

### E2E tests (requires MLX server)
```bash
pnpm test:e2e
```

### Watch mode
```bash
pnpm test:watch
```

## Test Fixtures

### Creating Fresh Test Data

Generate a new `test-batch.json` from the main localization file:

```bash
python3 tests/scripts/create-test-batch.py
```

This extracts untranslated keys (`tr: null`) with existing context for realistic testing.

### Using Fixtures in Tests

```typescript
import testBatch from './fixtures/test-batch.json';
import testHugeKey from './fixtures/test-huge-key.json';

// Use in your tests
const data = testBatch;
```

## Test Scripts

### Debug Configuration
```bash
pnpm exec tsx tests/scripts/test-config.mjs
```

Verifies that `.env` variables are correctly loaded and parsed.

### Debug MLX Requests
```bash
pnpm exec tsx tests/scripts/debug-request.mjs
```

Shows the exact JSON request sent to MLX server including `enable_thinking` parameter.

### Test Thinking Mode
```bash
tests/scripts/test-no-think.sh
```

Verifies that model thinking mode is properly disabled.

### Performance Test
```bash
tests/scripts/test-one-batch.sh
```

Measures translation speed for a single batch.

## Best Practices

1. **Keep fixtures small**: Use minimal realistic data
2. **Generate fresh data**: Run `create-test-batch.py` when main file changes
3. **Mock external services**: Use mocks for API tests
4. **Test edge cases**: Huge keys, special characters, empty strings
5. **Clean up**: Tests should not leave temporary files in project root

## CI/CD

Tests run automatically on:
- Pull requests
- Main branch commits
- Manual workflow dispatch

## Troubleshooting

### E2E tests fail
1. Check MLX server is running: `curl http://127.0.0.1:8765/health`
2. Verify model is loaded: Check `logs/mlx-server.log`
3. Increase timeout in `vitest.e2e.config.ts`

### Fixtures not found
Run from project root:
```bash
cd /Users/ug/code/bitrix24/localization
pnpm test
```

## Related Documentation

- `../docs/TESTING.md` - Testing strategy
- `../README.md` - Project overview
- `fixtures/README.md` - Fixture details
- `scripts/README.md` - Script usage
