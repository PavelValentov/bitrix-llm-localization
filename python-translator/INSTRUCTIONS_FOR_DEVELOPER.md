# Instructions for Developers 👨‍💻

Deep dive into the architecture and customization.

## Architecture

The system is built around `transformers` and `torch`.

1. **`PlaceholderManager`**: Critical component.
   - Regex-based protection.
   - Saves mapping `__PH_0__` -> `#AUTHOR#`.
   - Replaces in text before translation.
   - Restores after translation.

2. **`BitrixTranslator`**: Wrapper around NLLB.
   - Handles device selection (CPU/MPS/CUDA).
   - Manages tokenization and generation.
   - Uses `facebook/nllb-200-distilled-600M`.

## Language Codes

NLLB uses specific BCP-47 codes. We map standard codes in `bitrix24_translator_complete.py`:

```python
LANG_CODES = {
    'ru': 'rus_Cyrl',
    'en': 'eng_Latn',
    'tr': 'tur_Latn',
    'ua': 'ukr_Cyrl',
    # ...
}
```

**Adding a new language:**
1. Find the code: [NLLB Languages](https://github.com/facebookresearch/fairseq/tree/nllb#supported-languages)
2. Add to `LANG_CODES` dict.

## Memory Management

If you experience OOM (Out of Memory) crashes:

1. **Reduce Batch Size**: `--batch-size 8`
2. **Enable Reloading**: `--reload-after 100` (Clears VRAM periodically)
3. **Force CPU**: `--cpu` (Slow but safe)

## Customization

### Changing the Model
To use the larger 1.3B model (better quality, slower):

```python
# In bitrix24_translator_complete.py
MODEL_NAME = "facebook/nllb-200-distilled-1.3B"
```

### Adjusting Generation
Modify `translate_batch`:

```python
generated_tokens = self.model.generate(
    **inputs,
    num_beams=5,        # Increase for quality (slower)
    max_length=512,     # Max output length
    temperature=0.8     # Creativity (not recommended for UI text)
)
```

## Troubleshooting Common Issues

- **"Index out of range"**: Usually bad tokenization of placeholders. Check `PlaceholderManager` logic.
- **"MPS backend out of memory"**: Reduce batch size to 16 or 8.
- **Process killed**: System ran out of RAM. Add swap or use smaller batch size.
