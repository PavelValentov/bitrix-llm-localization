# Examples and Troubleshooting 🔧

## Usage Examples

### 1. Standard Run
Translate from English to Russian and Turkish.
```bash
python bitrix24_translator_complete.py --input data.json --output out/ --targets ru,tr
```

### 2. Large File on Weak Machine
Safe mode: small batch, forced reloading.
```bash
python bitrix24_translator_complete.py --input big.json --output out/ --batch-size 8 --reload-after 50
```

### 2b. Process Files in Batches (Checkpointing)
Save progress every 50 files — useful for 100k+ keys.
```bash
python bitrix24_translator_complete.py --input big.json --output out/ --file-batch-size 50
```

### 3. Translate from Russian
If your source is Russian:
```bash
python bitrix24_translator_complete.py --input data.json --output out/ --src ru --targets en
```

## Troubleshooting

### ❌ Error: `RuntimeError: CUDA out of memory`
**Solution:** Reduce `--batch-size`. Try 8 or 4.

### ❌ Error: `RuntimeError: Placeholder mismatch`
**Cause:** The model messed up the `__PH_0__` tokens (rare).
**Solution:** The script handles this by returning the original text (fallback) or partially restored text. Check logs.

### ❌ Warning: `Some weights of the model checkpoint were not used...`
**Status:** Normal. Ignore this warning from `transformers`.

### 🐢 Translation is very slow
**Cause:** Running on CPU?
**Solution:** Check `🔌 Using device: ...`. If `cpu`, ensure you have GPU drivers (CUDA) or are on a Mac (MPS).
If on CPU, expect ~1-2 seconds per batch. On GPU it's ~0.1s.

### ❓ Characters look like squares ()
**Cause:** Encoding issue.
**Solution:** Ensure input JSON is UTF-8. The script forces UTF-8 reading/writing.
