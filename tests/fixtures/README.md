# Test Fixtures

This directory contains test data files used by unit and e2e tests.

## Files

### test-batch.json
Small batch of translation keys for testing basic translation functionality.

### test-huge-key.json
Single huge key (7,700+ characters) for testing large text translation.
Used to verify the language-by-language splitting logic for huge keys.

### test-long-key.json
Abbreviated version of huge key for quick tests.

## Usage

Import in tests:
```typescript
import testBatch from './fixtures/test-batch.json';
import testHugeKey from './fixtures/test-huge-key.json';
```

## Generating Test Data

Use `tests/scripts/create-test-batch.py` to generate fresh test batches from the main localization file.
