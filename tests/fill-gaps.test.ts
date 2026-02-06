import { describe, it, expect } from 'vitest';
import {
  normalizeSourceText,
  buildSourceTextIndex,
  fillGaps,
} from '../src/fill-gaps.js';
import type { TranslationMap } from '../src/utils.js';

describe('normalizeSourceText', () => {
  it('returns null for null/undefined', () => {
    expect(normalizeSourceText(null)).toBe(null);
    expect(normalizeSourceText(undefined)).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(normalizeSourceText('')).toBe(null);
    expect(normalizeSourceText('   ')).toBe(null);
  });

  it('trims and returns non-empty string', () => {
    expect(normalizeSourceText('  Hello  ')).toBe('Hello');
    expect(normalizeSourceText('Delete')).toBe('Delete');
  });
});

describe('buildSourceTextIndex', () => {
  it('groups keys by source text (en)', () => {
    const data: TranslationMap = {
      'file1.php': {
        KEY_A: { en: 'Delete', ru: 'Удалить', tr: 'Sil', ua: 'Видалити' },
        KEY_B: { en: 'Delete', ru: null, tr: null, ua: null },
      },
    };
    const index = buildSourceTextIndex(data);
    expect(index.size).toBe(1);
    const donors = index.get('Delete')!;
    expect(donors).toHaveLength(2);
    expect(donors[0].filePath).toBe('file1.php');
    expect(donors[0].key).toBe('KEY_A');
    expect(donors[0].translations).toEqual({
      en: 'Delete',
      ru: 'Удалить',
      tr: 'Sil',
      ua: 'Видалити',
    });
    expect(donors[1].key).toBe('KEY_B');
    expect(donors[1].translations).toEqual({ en: 'Delete' });
  });

  it('skips keys with no source text', () => {
    const data: TranslationMap = {
      'file1.php': {
        KEY_EMPTY: { en: null, ru: null, tr: null },
      },
    };
    const index = buildSourceTextIndex(data);
    expect(index.size).toBe(0);
  });
});

describe('fillGaps', () => {
  it('substitutes missing translations from donors', () => {
    const data: TranslationMap = {
      'path/file.php': {
        DONOR: { en: 'Delete', ru: 'Удалить', tr: 'Sil', ua: 'Видалити' },
        RECIPIENT: { en: 'Delete', ru: null, tr: null, ua: null },
      },
    };
    const index = buildSourceTextIndex(data);
    const logs: string[] = [];
    const logFn = (msg: string) => logs.push(msg);

    const { substitutions } = fillGaps(data, index, logFn);

    expect(substitutions).toBe(3);
    expect(data['path/file.php']!['RECIPIENT']).toEqual({
      en: 'Delete',
      ru: 'Удалить',
      tr: 'Sil',
      ua: 'Видалити',
    });
    expect(logs).toContain(
      '[SUBSTITUTION] path/file.php | RECIPIENT | ru | null → "Удалить"'
    );
    expect(logs).toContain(
      '[SUBSTITUTION] path/file.php | RECIPIENT | tr | null → "Sil"'
    );
    expect(logs).toContain(
      '[SUBSTITUTION] path/file.php | RECIPIENT | ua | null → "Видалити"'
    );
  });

  it('uses first donor with translation when multiple donors exist', () => {
    const data: TranslationMap = {
      'f1.php': {
        D1: { en: 'Start', ru: 'Старт', tr: 'Başlat', ua: 'Почати' },
      },
      'f2.php': {
        R: { en: 'Start', ru: null, tr: null, ua: null },
      },
    };
    const index = buildSourceTextIndex(data);
    const logs: string[] = [];
    const { substitutions } = fillGaps(data, index, (m) => logs.push(m));

    expect(substitutions).toBe(3);
    expect(data['f2.php']!['R']).toEqual({
      en: 'Start',
      ru: 'Старт',
      tr: 'Başlat',
      ua: 'Почати',
    });
  });

  it('is idempotent — second run produces no new substitutions', () => {
    const data: TranslationMap = {
      'file.php': {
        D: { en: 'Edit', ru: 'Изменить', ua: 'Змінити' },
        R: { en: 'Edit', ru: null, ua: null },
      },
    };
    const index = buildSourceTextIndex(data);
    const { substitutions: s1 } = fillGaps(data, index, () => {});
    const index2 = buildSourceTextIndex(data);
    const { substitutions: s2 } = fillGaps(data, index2, () => {});

    expect(s1).toBe(2);
    expect(s2).toBe(0);
  });
});
