# Bitrix24 Local NLLB Translator

A production-ready Python solution for translating Bitrix24 localization files using the NLLB-200 (No Language Left Behind) model locally.

## Features

- 🚀 **Local & Private**: Runs entirely on your machine. No APIs, no data leaks.
- ⚡ **Fast**: Optimized for Apple Silicon (MPS) and NVIDIA GPUs (CUDA).
- 🛡️ **Smart**: Protects placeholders like `#AUTHOR#`, `{0}`, `%s` during translation.
- ♻️ **Efficient**: Deduplicates source keys to save time (translates "Yes" once, applies everywhere).
- 💾 **Safe**: Atomic saves and progress tracking.

## Installation

1. **Prerequisites**: Python 3.9+
2. **Optional**: Add `HF_TOKEN` to `.env` (project root) for faster Hugging Face downloads — [create token](https://huggingface.co/settings/tokens)
3. **Install dependencies**:

```bash
pip install -r requirements.txt
```

## Quick Start

1. **Prepare your data**: Ensure you have a `localization.json` file.
2. **Run the translator**:

```bash
python bitrix24_translator_complete.py --input localization.json --output translated/ --src en --targets ru,tr,ua
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--input` | Path to input JSON file | Required |
| `--output` | Output directory or file path | Required |
| `--src` | Source language code | `en` |
| `--targets`| Comma-separated target languages | `ru,tr,ua` |
| `--batch-size` | Number of strings to process at once | `32` |
| `--file-batch-size` | Files per checkpoint (0=all at once) | `0` |
| `--reload-after` | Reload model after N batches (0=off) | `0` |
| `--cpu` | Force CPU mode (slower) | `False` |

## How it works

1. **Parses** the input JSON to find all keys with missing translations.
2. **Deduplicates** the source strings (unique phrases only).
3. **Protects** variable placeholders so the AI doesn't break code syntax.
4. **Translates** using `facebook/nllb-200-distilled-600M` (auto-downloaded on first run).
5. **Restores** placeholders.
6. **Saves** the result.

## Tests

```bash
# With venv (recommended)
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python test_nllb_translator.py -v

# Without venv (PlaceholderManager, get_missing_translations only)
python3 test_nllb_translator.py -v
```

## Documentation

- [Quick Start Guide](QUICK_START.md)
- [Developer Instructions](INSTRUCTIONS_FOR_DEVELOPER.md)
- [Mac Optimization](MAC_SPECIFIC_TIPS.md)
- [Troubleshooting](EXAMPLES_AND_TROUBLESHOOTING.md)
