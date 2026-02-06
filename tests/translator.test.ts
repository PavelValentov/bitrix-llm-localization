import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock config BEFORE importing Translator
vi.mock('../src/config.js', () => ({
  config: {
    openai: {
      apiKey: "test-key",
      model: "gpt-4o",
      baseURL: undefined
    },
    batchSize: 50,
    systemPrompt: "System Prompt"
  }
}));

import { Translator } from '../src/translator.js';

// Mock OpenAI
const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: mockCreate
        }
      }
    }
  };
});

describe('Translator', () => {
  let translator: Translator;

  beforeEach(() => {
    vi.clearAllMocks();
    translator = new Translator();
  });

  it('should translate a batch correctly', async () => {
    // Setup mock response
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              items: [
                {
                  key: "KEY_1",
                  translations: [
                    { lang: "ua", text: "Привіт" },
                    { lang: "de", text: "Hallo" }
                  ]
                },
                {
                  key: "KEY_2",
                  translations: [
                    { lang: "ua", text: "Світ" },
                    { lang: "de", text: "Welt" }
                  ]
                }
              ]
            })
          }
        }
      ]
    });

    const input = [
      {
        key: "KEY_1",
        fileName: "file1.php",
        context: { "ru": "Привет", "en": "Hello" },
        targets: ["ua", "de"]
      },
      {
        key: "KEY_2",
        fileName: "file1.php",
        context: { "ru": "Мир", "en": "World" },
        targets: ["ua", "de"]
      }
    ];

    const result = await translator.translateFileBatch(input);

    expect(result).toEqual({
      "KEY_1": { "ua": "Привіт", "de": "Hallo" },
      "KEY_2": { "ua": "Світ", "de": "Welt" }
    });
  });

  it('should handle empty input', async () => {
    const result = await translator.translateFileBatch([]);
    expect(result).toEqual({});
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should retry on failure', async () => {
    mockCreate.mockRejectedValueOnce(new Error("API Error"));
    
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ items: [{ key: "KEY", translations: [{ lang: "ua", text: "Success" }] }] }) } }]
    });

    const input = [{ key: "KEY", fileName: "test.php", context: { "en": "Test" }, targets: ["ua"] }];
    const result = await translator.translateFileBatch(input);
    
    expect(result).toEqual({ "KEY": { "ua": "Success" } });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
