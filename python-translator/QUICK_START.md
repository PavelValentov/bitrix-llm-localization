# Quick Start Guide 🚀

Get your translations running in 5 minutes.

## 1. Environment Setup

Ensure you have Python installed.

```bash
# Check Python version
python3 --version

# Install libraries
pip3 install -r requirements.txt
```

## 2. Check Your Data

Make sure your input `localization.json` follows this structure:

```json
{
  "path/to/file.php": {
    "KEY_NAME": {
      "en": "Source text",
      "ru": null,
      "tr": ""
    }
  }
}
```

## 3. First Run (Test)

Run the simple example to download the model (~1.2GB) and verify it works.

```bash
python3 simple_example.py
```

*Note: The first run will take 1-2 minutes to download the model.*

## 4. Run Production Translation

```bash
python3 bitrix24_translator_complete.py \
  --input ./input/localization.json \
  --output ./output \
  --src en \
  --targets ru,tr,ua \
  --batch-size 32
```

## 5. Monitor Progress

- You will see a progress bar.
- The script automatically uses GPU (CUDA) or Mac Accelerator (MPS) if available.
- Results are saved to the output directory.

## Success! 🎉
Check your output folder for the translated JSON.
