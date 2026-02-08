import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config for local-server backend (only fields used by Translator)
vi.mock('../src/config.js', () => ({
  config: {
    translationBackend: 'local-server',
    localServer: { url: 'http://127.0.0.1:8765', reloadEveryBatches: 10 },
    batchSize: 50,
    systemPrompt: 'System Prompt',
  },
}));

import { Translator } from '../src/translator.js';

describe('Translator (local-server)', () => {
  let translator: Translator;

  beforeEach(() => {
    vi.clearAllMocks();
    translator = new Translator();
  });

  it('should fix Qwen3-8B malformed JSON (,.0,) and parse successfully', async () => {
    const malformed = `{"items":[{"key":"K1","translations":[{"lang":"tr","text":"a"},.0,{"lang":"en","text":"b"}]}]}`;
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: malformed }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const input = [
      {
        key: 'K1',
        fileName: 'f.php',
        context: { ru: 'x' },
        targets: ['tr', 'en'],
      },
    ];

    const result = await translator.translateFileBatch(input);

    expect(result).toEqual({
      K1: { tr: 'a', en: 'b' },
    });
    vi.unstubAllGlobals();
  });
});
