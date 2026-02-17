import { describe, it, expect } from 'vitest';
import {
  normalizeSourceText,
  buildSourceTextIndex,
  fillAllNullOrWhitespaceOnlyKeys,
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
  it('groups keys by source text (en) and indexes by every language for cross-lang match', () => {
    const data: TranslationMap = {
      'file1.php': {
        KEY_A: { en: 'Delete', ru: 'Удалить', tr: 'Sil', ua: 'Видалити' },
        KEY_B: { en: 'Delete', ru: null, tr: null, ua: null },
      },
    };
    const index = buildSourceTextIndex(data);
    // Index has one entry per unique normalized text (Delete, Удалить, Sil, Видалити)
    expect(index.size).toBe(4);
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

  it('fills recipient that has only ru by matching donor via same ru text (index by all langs)', () => {
    const data: TranslationMap = {
      'socialnetwork/.../short/lang/{lang}/template.php': {
        DONOR: {
          en: 'You do not have permission to view the profile of this user.',
          ru: 'У вас нет прав на просмотр профайла этого пользователя.',
          tr: 'Bu kullanıcının profiline bakma izniniz yok.',
          ua: 'У вас немає прав на перегляд профайла цього користувача.',
        },
      },
      'intranet/.../short/lang/{lang}/template.php': {
        RECIPIENT: {
          en: null,
          ru: 'У вас нет прав на просмотр профайла этого пользователя.',
          tr: null,
          ua: null,
        },
      },
    };
    const index = buildSourceTextIndex(data);
    const { substitutions } = fillGaps(data, index, () => {});

    expect(substitutions).toBe(3);
    expect(data['intranet/.../short/lang/{lang}/template.php']!['RECIPIENT']).toEqual({
      en: 'You do not have permission to view the profile of this user.',
      ru: 'У вас нет прав на просмотр профайла этого пользователя.',
      tr: 'Bu kullanıcının profiline bakma izniniz yok.',
      ua: 'У вас немає прав на перегляд профайла цього користувача.',
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

describe('fillAllNullOrWhitespaceOnlyKeys', () => {
  it('sets all languages to " " when all values are null', () => {
    const data: TranslationMap = {
      'file.php': {
        WZD_REF_BRAND_DESCR_COMPANY1: { en: null, ru: null, tr: null, ua: null },
      },
    };
    const logs: string[] = [];
    const { substitutions } = fillAllNullOrWhitespaceOnlyKeys(data, (m) => logs.push(m));

    expect(substitutions).toBe(4);
    expect(data['file.php']!['WZD_REF_BRAND_DESCR_COMPANY1']).toEqual({
      en: ' ',
      ru: ' ',
      tr: ' ',
      ua: ' ',
    });
    expect(logs.length).toBe(4);
    expect(logs.some((l) => l.includes('WZD_REF_BRAND_DESCR_COMPANY1') && l.includes('→ " "'))).toBe(true);
  });

  it('sets all languages to " " when one is " " and rest are null', () => {
    const data: TranslationMap = {
      'file.php': {
        SALE_WIZARD_PS_BILL_: { en: null, ru: ' ', tr: null, ua: null },
      },
    };
    const logs: string[] = [];
    const { substitutions } = fillAllNullOrWhitespaceOnlyKeys(data, (m) => logs.push(m));

    expect(substitutions).toBe(3); // en, tr, ua changed; ru already " "
    expect(data['file.php']!['SALE_WIZARD_PS_BILL_']).toEqual({
      en: ' ',
      ru: ' ',
      tr: ' ',
      ua: ' ',
    });
  });

  it('leaves keys unchanged when at least one value has real content', () => {
    const data: TranslationMap = {
      'file.php': {
        HAS_REAL: { en: 'Hello', ru: null, tr: null, ua: null },
      },
    };
    const { substitutions } = fillAllNullOrWhitespaceOnlyKeys(data, () => {});

    expect(substitutions).toBe(0);
    expect(data['file.php']!['HAS_REAL']).toEqual({
      en: 'Hello',
      ru: null,
      tr: null,
      ua: null,
    });
  });
});
