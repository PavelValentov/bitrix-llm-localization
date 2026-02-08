# Model Thinking Mode

## Overview

The `ENABLE_MODEL_THINKING` parameter controls whether the Qwen3-8B model uses its internal reasoning mode with `<think>...</think>` tags.

## Configuration

Add to `.env` file:

```bash
# Enable model thinking/reasoning mode (Qwen uses <think> tags)
# false = direct translation (faster, cleaner output) - DEFAULT
# true = model shows reasoning process (slower, may need post-processing)
ENABLE_MODEL_THINKING=false
```

## Modes

### Disabled (Default) - `ENABLE_MODEL_THINKING=false`

**Behavior:**
- Model outputs **only** the JSON translation response
- No `<think>` or `</think>` tags in output
- Faster translation (no extra reasoning tokens)
- Cleaner output (no post-processing needed)

**System Prompt Addition:**
```
IMPORTANT: Output ONLY the JSON response. 
Do NOT use <think> or </think> tags. 
Do NOT add any explanations or reasoning text.
```

**Example Output:**
```json
{
  "items": [
    {
      "key": "HELLO_WORLD",
      "translations": [
        {"lang": "tr", "text": "Merhaba Dünya"}
      ]
    }
  ]
}
```

### Enabled - `ENABLE_MODEL_THINKING=true`

**Behavior:**
- Model shows its reasoning process before the final answer
- Uses `<think>...</think>` tags to wrap reasoning
- Slower translation (extra reasoning tokens generated)
- May need post-processing to strip `<think>` tags

**System Prompt Addition:**
```
You may use <think>...</think> tags to show your reasoning 
process before providing the final answer.
```

**Example Output:**
```
<think>
The phrase "Hello World" is a common programming greeting.
In Turkish, "Hello" translates to "Merhaba" and "World" to "Dünya".
The proper Turkish translation would be "Merhaba Dünya".
</think>
{
  "items": [
    {
      "key": "HELLO_WORLD",
      "translations": [
        {"lang": "tr", "text": "Merhaba Dünya"}
      ]
    }
  ]
}
```

## Post-Processing

The `sanitizeJsonOutput()` function in `src/translator.ts` automatically strips `<think>` tags from model output:

```typescript
private sanitizeJsonOutput(text: string): string {
  let s = text.trim();
  // Strip <think>...</think> wrapper (Qwen3-8B sometimes wraps JSON in think tags)
  const thinkEnd = s.indexOf('</think>');
  if (thinkEnd >= 0) {
    s = s.slice(thinkEnd + 8).trim();
  }
  const thinkStart = s.indexOf('<think>');
  if (thinkStart >= 0) {
    s = s.slice(0, thinkStart).trim();
  }
  // ... more sanitization ...
  return s;
}
```

## Recommendations

### Use `ENABLE_MODEL_THINKING=false` (default) when:
- ✅ You need fast translations
- ✅ You want cleaner output
- ✅ You're doing batch translations (100+ strings)
- ✅ You trust the model to translate correctly without showing reasoning

### Use `ENABLE_MODEL_THINKING=true` when:
- 🤔 You want to debug translation decisions
- 🤔 You're testing model behavior
- 🤔 You need to understand why model made specific translation choices
- 🤔 You're translating complex or ambiguous strings

## Implementation Details

### Config (`src/config.ts`):
```typescript
ENABLE_MODEL_THINKING: z.coerce.boolean().default(false),
```

### Translator (`src/translator.ts`):
```typescript
const body = {
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content },
  ],
  max_tokens: 2048,
  temperature: 0.3,
  enable_thinking: config.localServer.enableThinking, // ← Pass to server
};
```

### MLX Server (`mlx-server/mlx_server.py`):
```python
def apply_chat_template(messages: list[dict], enable_thinking: bool = False) -> str:
    """Apply chat template to messages. Returns formatted prompt string."""
    # ... template logic ...
    
    # Add thinking instruction to system message
    if role == "system":
        if enable_thinking:
            content += "\n\nYou may use <think>...</think> tags..."
        else:
            content += "\n\nIMPORTANT: Output ONLY the JSON response..."
```

## Testing

Run E2E test with thinking mode disabled:

```bash
ENABLE_MODEL_THINKING=false pnpm test:e2e
```

The test verifies:
- ✅ Translations are generated correctly
- ✅ No `<think>` or `</think>` tags in output
- ✅ Placeholders preserved (`#title#`, `#name#`)
- ✅ Punctuation and numbers preserved

## Performance Impact

**Thinking Mode Disabled (default):**
- Average tokens per translation: ~150-200
- Average time per batch (5 strings): ~3-5s
- Memory usage: ~6GB VRAM

**Thinking Mode Enabled:**
- Average tokens per translation: ~300-500 (2x-3x more)
- Average time per batch (5 strings): ~8-15s (2x-3x slower)
- Memory usage: ~6GB VRAM (same)

## Conclusion

**Default recommendation: Keep `ENABLE_MODEL_THINKING=false`**

The thinking mode is useful for debugging and understanding model behavior, but for production batch translations, the disabled mode is faster and produces cleaner output.

---

**Last Updated:** 2026-02-07
**Version:** 1.0.0
