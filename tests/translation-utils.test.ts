import { describe, it, expect } from 'vitest';
import {
  PlaceholderManager,
  cleanTranslation,
  validateTranslation,
  selectBestCandidate,
} from '../src/translation-utils.js';

describe('PlaceholderManager', () => {
  it('should protect and restore placeholders', () => {
    const pm = new PlaceholderManager();
    const { protected: p, placeholders } = pm.protect('Hello #NAME# and {0}');
    expect(p).toContain('__PH_');
    expect(p).not.toContain('#NAME#');
    const restored = pm.restore(p, placeholders);
    expect(restored).toBe('Hello #NAME# and {0}');
  });

  it('should handle empty input', () => {
    const pm = new PlaceholderManager();
    const { protected: p, placeholders } = pm.protect('');
    expect(p).toBe('');
    expect(placeholders).toEqual({});
  });
});

describe('cleanTranslation', () => {
  it('should remove duplicate words', () => {
    expect(cleanTranslation('Delete Delete')).toBe('Delete');
    expect(cleanTranslation('Açık açık açık')).toBe('Açık');
  });

  it('should normalize whitespace', () => {
    expect(cleanTranslation('  word   other  ')).toBe('word other');
  });

  it('should handle "X - X." pattern', () => {
    expect(cleanTranslation('Час - час.')).toBe('Час');
  });

  it('should strip trailing punctuation for short strings', () => {
    expect(cleanTranslation('Yes,')).toBe('Yes');
  });

  it('should handle null/undefined', () => {
    expect(cleanTranslation(null)).toBe(null);
    expect(cleanTranslation(undefined)).toBe(undefined);
  });
});

describe('validateTranslation', () => {
  it('should accept Cyrillic for ua', () => {
    expect(validateTranslation('Привіт', 'ua')).toBe(true);
    expect(validateTranslation('Hello', 'ua')).toBe(false);
  });

  it('should accept Latin for en', () => {
    expect(validateTranslation('Hello', 'en')).toBe(true);
    expect(validateTranslation('Привіт', 'en')).toBe(false);
  });
});

describe('selectBestCandidate', () => {
  it('should pick valid candidate', () => {
    const r = selectBestCandidate({ ru: 'Привіт', en: 'Hello' }, 'ua');
    expect(r).toBe('Привіт');
  });

  it('should prefer proximity', () => {
    const r = selectBestCandidate({ ru: 'Текст', en: 'Text' }, 'ua');
    expect(r).toBe('Текст');
  });
});
