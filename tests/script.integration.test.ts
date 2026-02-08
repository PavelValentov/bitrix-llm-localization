import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mocks for fs
const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: fsMocks.readFile,
    writeFile: fsMocks.writeFile,
    mkdir: fsMocks.mkdir
  }
}));

// Hoisted mocks for Translator
const translatorMocks = vi.hoisted(() => ({
  translateFileBatch: vi.fn()
}));

vi.mock('../src/translator.js', () => {
  return {
    Translator: class {
      translateFileBatch = translatorMocks.translateFileBatch;
    }
  };
});

// Mock config
vi.mock('../src/config.js', () => ({
  config: {
    translationBackend: 'api',
    openai: { apiKey: "test", model: "gpt-4o" },
    local: { url: 'http://localhost:1234/v1', model: 'test' },
    localServer: { url: 'http://127.0.0.1:8765', reloadEveryBatches: 10 },
    batchSize: 2,
    systemPrompt: "prompt"
  }
}));

import { runTranslation } from '../scripts/translate.js';

describe('Translation Script', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should translate missing keys using multi-source context', async () => {
    // Setup input data
    const inputData = {
      "path/to/file.php": {
        "KEY_1": { "ru": "Привет", "en": null },
        "KEY_2": { "ru": "Мир", "en": "World" },
        "KEY_3": { "ru": "Тест", "en": null }
      }
    };

    fsMocks.readFile.mockResolvedValue(JSON.stringify(inputData));
    
    // Setup Translator mock response
    translatorMocks.translateFileBatch.mockResolvedValue({
      "KEY_1": { "en": "Hello" },
      "KEY_3": { "en": "Test" }
    });

    await runTranslation('dummy.json', ['en']);

    // Verify Translator called
    expect(translatorMocks.translateFileBatch).toHaveBeenCalledTimes(1);
    const callArgs = translatorMocks.translateFileBatch.mock.calls[0][0];
    
    // Check that we sent correct structure
    expect(callArgs).toHaveLength(2);
    expect(callArgs[0]).toEqual({
      key: "KEY_1",
      fileName: "path/to/file.php",
      context: { "ru": "Привет" },
      targets: ["en"]
    });

    // Verify Save (output/default is output/dummy.json)
    // Script saves per SAVE_INTERVAL + final save, so >= 1 call
    expect(fsMocks.mkdir).toHaveBeenCalledWith('output', { recursive: true });
    expect(fsMocks.writeFile).toHaveBeenCalled();
    const lastCall = fsMocks.writeFile.mock.calls[fsMocks.writeFile.mock.calls.length - 1];
    const savedData = JSON.parse(lastCall[1]);
    
    expect(savedData["path/to/file.php"]["KEY_1"]["en"]).toBe("Hello");
    expect(savedData["path/to/file.php"]["KEY_2"]["en"]).toBe("World");
    expect(savedData["path/to/file.php"]["KEY_3"]["en"]).toBe("Test");
  });

  it('should translate to multiple targets simultaneously', async () => {
    const inputData = {
      "file.php": {
        "KEY": { "ru": "Текст", "en": null, "ua": null }
      }
    };
    fsMocks.readFile.mockResolvedValue(JSON.stringify(inputData));

    translatorMocks.translateFileBatch.mockResolvedValue({
      "KEY": { "en": "Text", "ua": "Текст_UA" }
    });

    await runTranslation('dummy.json', ['en', 'ua']);

    expect(translatorMocks.translateFileBatch).toHaveBeenCalledTimes(1);
    const callArgs = translatorMocks.translateFileBatch.mock.calls[0][0];
    
    expect(callArgs[0].targets).toEqual(["en", "ua"]);
    
    expect(fsMocks.writeFile).toHaveBeenCalled();
    const lastCall = fsMocks.writeFile.mock.calls[fsMocks.writeFile.mock.calls.length - 1];
    const savedData = JSON.parse(lastCall[1]);
    
    expect(savedData["file.php"]["KEY"]["en"]).toBe("Text");
    expect(savedData["file.php"]["KEY"]["ua"]).toBe("Текст_UA");
  });

  it('should skip keys that are already fully translated', async () => {
    const inputData = {
      "file.php": {
        "KEY_FULL": { "ru": "Да", "en": "Yes", "ua": "Так" },
        "KEY_PARTIAL": { "ru": "Нет", "en": "No", "ua": null }
      }
    };
    fsMocks.readFile.mockResolvedValue(JSON.stringify(inputData));

    // Translator should only be called for KEY_PARTIAL
    translatorMocks.translateFileBatch.mockResolvedValue({
      "KEY_PARTIAL": { "ua": "Ні" }
    });

    await runTranslation('dummy.json', ['en', 'ua']);

    expect(translatorMocks.translateFileBatch).toHaveBeenCalledTimes(1);
    const callArgs = translatorMocks.translateFileBatch.mock.calls[0][0];
    
    // Should verify that only 1 item was sent
    expect(callArgs).toHaveLength(1);
    expect(callArgs[0].key).toBe("KEY_PARTIAL");
    expect(callArgs[0].targets).toEqual(["ua"]);
  });
});
