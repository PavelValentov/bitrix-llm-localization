# Mac Specific Tips 🍎

Optimizing for Apple Silicon (M1/M2/M3).

## MPS Acceleration

This script natively supports `MPS` (Metal Performance Shaders).
You don't need to do anything; the script detects it automatically:

```python
self.device = 'mps' if torch.backends.mps.is_available() else ...
```

**Verification:**
When script starts, look for:
`🔌 Using device: mps`

## Performance Tuning

### Batch Size
- **M1/M2 Air (8GB/16GB)**: Use `--batch-size 16`
- **M1/M2/M3 Pro/Max (32GB+)**: Use `--batch-size 64` or `128`

### Memory Leaks
`MPS` backend sometimes doesn't release memory fast enough.
If you see memory usage climbing indefinitely:

Use `--reload-after 500`. This forces a reload of the model every 500 batches, clearing the Metal cache.

## Installation Issues

If `torch` doesn't see GPU:

```bash
# Reinstall torch with nightly build for latest MPS fixes
pip install --pre torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/nightly/cpu
```

## Activity Monitor
Open Activity Monitor -> Window -> GPU History to watch the GPU usage during translation. It should spike to ~90-100%.
