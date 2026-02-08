# Performance Tuning Guide

## Overview

This guide explains how to optimize translation performance by adjusting batch size, response tokens, and temperature parameters.

## Key Parameters

### 1. `TRANSLATION_BATCH_SIZE`

**What it does:** Controls how many strings are translated in a single request to the model.

```bash
# .env
TRANSLATION_BATCH_SIZE=5  # Default: 5 strings per request
```

**Trade-offs:**

| Batch Size | Speed | Memory | Quality | Use Case |
|------------|-------|--------|---------|----------|
| **1** | Slow | Low | High | Testing, debugging |
| **5** ✅ | Good | Medium | High | **Recommended default** |
| **10** | Fast | Medium | Good | Production, large files |
| **20+** | Very Fast | High | Medium | Bulk processing |

**Performance comparison:**

```
File: 1000 strings to translate

Batch Size 1:  1000 requests × 3s  = 50 minutes
Batch Size 5:   200 requests × 3s  = 10 minutes ✅
Batch Size 10:  100 requests × 4s  = 6.7 minutes
Batch Size 20:   50 requests × 6s  = 5 minutes
```

**When to use:**

```bash
# Debugging single strings
TRANSLATION_BATCH_SIZE=1

# Production: balanced speed/quality
TRANSLATION_BATCH_SIZE=5  # ✅ Recommended

# Bulk processing: maximum speed
TRANSLATION_BATCH_SIZE=10
```

### 2. `MAX_RESPONSE_TOKENS`

**What it does:** Maximum number of tokens in model's response (NOT context window size).

```bash
# .env
MAX_RESPONSE_TOKENS=16384  # Default: 16384 tokens
```

**Important:** This is NOT the context window size!

| Concept | Definition | For Qwen3-8B |
|---------|------------|--------------|
| **Context Window** | Max size of prompt + response | 32K-128K tokens (model limit) |
| **`MAX_RESPONSE_TOKENS`** | Max size of response only | 16384 tokens (configurable) |

**How many tokens do you need?**

```python
# Estimate tokens for JSON response:
tokens_per_translation = ~50-100 tokens
json_overhead = ~50 tokens per item

# Formula:
required_tokens = (tokens_per_translation + json_overhead) × batch_size

# Examples:
batch_5 = (75 + 50) × 5 = 625 tokens
batch_10 = (75 + 50) × 10 = 1250 tokens
batch_20 = (75 + 50) × 20 = 2500 tokens
```

**Recommendations:**

```bash
# Small batches (1-5 strings)
MAX_RESPONSE_TOKENS=2048  # Sufficient

# Medium batches (5-10 strings)
MAX_RESPONSE_TOKENS=4096  # Good balance

# Large batches (10-20 strings)
MAX_RESPONSE_TOKENS=8192  # Safe margin

# Extra large (20+ strings or very long strings)
MAX_RESPONSE_TOKENS=16384  # ✅ Current default
```

**When response exceeds max_tokens:**
- ⚠️ Model output gets **truncated**
- ❌ Incomplete JSON → parsing error
- 🔄 Script retries once, then fails

**Signs you need more tokens:**
```
Error: Failed to parse LLM output as JSON
Response truncated at: ...}
```

### 3. `temperature`

**What it does:** Controls model's creativity/randomness.

```
0.0 ──────────── 0.3 ──────────── 1.0 ──────────── 2.0
│                │                │                │
Deterministic  Translations   Creative        Chaos
```

**Current value:** `0.3` (hardcoded in `src/translator.ts`)

**Why 0.3 for translations:**

✅ **Stability** - Same strings translate consistently
✅ **Flexibility** - Model can choose context-appropriate synonyms  
✅ **Quality** - Fewer hallucinations and errors
✅ **Terminology** - Technical terms remain consistent

**Examples:**

Input: `"Save changes"`

```python
# temperature = 0.0 (deterministic)
tr: "Değişiklikleri kaydet"  # Always exactly this

# temperature = 0.3 (current) ✅
tr: "Değişiklikleri kaydet"  # Usually
tr: "Değişiklikleri sakla"   # Sometimes (if context suggests)

# temperature = 1.0 (creative)
tr: "Değişiklikleri kaydet"
tr: "Kaydet"
tr: "Değişiklikleri sakla"
tr: "Değişiklikleri koru"
tr: "Değişiklikleri not et"  # May be incorrect
```

**Recommendation:** Keep `temperature=0.3` for UI translations. Do NOT change unless you have a specific reason.

## Optimization Strategies

### For Speed (Production)

```bash
# .env
TRANSLATION_BATCH_SIZE=10
MAX_RESPONSE_TOKENS=8192
ENABLE_MODEL_THINKING=false  # ✅ Important!
LOCAL_SERVER_RELOAD_EVERY_BATCHES=50
```

**Expected performance:**
- ~10 strings per request
- ~4-5 seconds per request
- ~150 strings per minute

### For Quality (Careful Translation)

```bash
# .env
TRANSLATION_BATCH_SIZE=3
MAX_RESPONSE_TOKENS=4096
ENABLE_MODEL_THINKING=false
LOCAL_SERVER_RELOAD_EVERY_BATCHES=50
```

**Expected performance:**
- ~3 strings per request
- ~2-3 seconds per request
- ~60 strings per minute

### For Debugging

```bash
# .env
TRANSLATION_BATCH_SIZE=1
MAX_RESPONSE_TOKENS=2048
ENABLE_MODEL_THINKING=true  # Show reasoning
LOCAL_SERVER_RELOAD_EVERY_BATCHES=10
```

**Expected performance:**
- 1 string per request
- ~3-5 seconds per request (with thinking)
- ~15 strings per minute

## Memory Management

### `LOCAL_SERVER_RELOAD_EVERY_BATCHES`

**What it does:** Reloads model after N batches to prevent memory leaks.

```bash
# .env
LOCAL_SERVER_RELOAD_EVERY_BATCHES=50  # Reload every 50 batches
```

**Recommendations:**

| Value | Effect | Use Case |
|-------|--------|----------|
| **0** | Never reload | Short sessions (<100 strings) |
| **50** | Reload every 50 batches | ✅ Recommended default |
| **100** | Reload every 100 batches | Large files, stable system |

**Signs you need to reload more often:**
- 🐌 Translation slows down over time
- 💾 Memory usage grows continuously
- ⚠️ System becomes unresponsive

## Real-World Example

### Scenario: Translating 10,000 strings

**Configuration:**
```bash
TRANSLATION_BATCH_SIZE=10
MAX_RESPONSE_TOKENS=8192
ENABLE_MODEL_THINKING=false
LOCAL_SERVER_RELOAD_EVERY_BATCHES=50
```

**Performance:**
- Total batches: 10,000 / 10 = 1,000 batches
- Time per batch: ~4 seconds
- Model reloads: 1,000 / 50 = 20 reloads (×5s each)
- Total time: (1,000 × 4s) + (20 × 5s) = 4,000s + 100s = **~68 minutes**

**Optimization:**
```bash
# Increase batch size
TRANSLATION_BATCH_SIZE=20
```

**New performance:**
- Total batches: 10,000 / 20 = 500 batches
- Time per batch: ~6 seconds
- Model reloads: 500 / 50 = 10 reloads (×5s each)
- Total time: (500 × 6s) + (10 × 5s) = 3,000s + 50s = **~51 minutes**

## Monitoring Performance

### Check translation speed:

```bash
./run_translation.sh input/business50/localization.json 2>&1 | grep -E "OK:|Batch"
```

### Typical output:
```
📤 Batch 1/100 [file.php]: 10 keys
   📥 OK: 10 keys → tr  (took 4.2s)
📤 Batch 2/100 [file.php]: 10 keys
   📥 OK: 10 keys → tr  (took 3.8s)
```

### Performance issues:

**Slow batches (>10s):**
- ❌ Batch size too large → reduce to 5
- ❌ Strings too long → reduce batch size
- ❌ Thinking mode enabled → disable

**Memory errors:**
- ❌ Model too large for RAM → use 8-bit model
- ❌ Memory leak → reduce `LOCAL_SERVER_RELOAD_EVERY_BATCHES`

**Parsing errors:**
- ❌ Response truncated → increase `MAX_RESPONSE_TOKENS`
- ❌ Invalid JSON → check logs for model output

## Summary

**Recommended production settings:**

```bash
# .env
TRANSLATION_BATCH_SIZE=5
MAX_RESPONSE_TOKENS=16384
ENABLE_MODEL_THINKING=false
LOCAL_SERVER_RELOAD_EVERY_BATCHES=50
```

**Expected performance:**
- ⚡ ~50-100 strings per minute
- 💾 ~6GB VRAM usage
- ✅ High translation quality
- 🔄 Stable over long sessions

---

**Last Updated:** 2026-02-07
**Version:** 1.0.0
