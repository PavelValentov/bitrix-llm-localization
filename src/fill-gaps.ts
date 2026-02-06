import type { TranslationMap } from './utils.js';

export type LogFn = (message: string) => void;

export interface DonorEntry {
  filePath: string;
  key: string;
  translations: Record<string, string>;
}

/**
 * Normalizes source text: trim whitespace, treat empty string as null.
 */
export function normalizeSourceText(val: string | null | undefined): string | null {
  if (val == null) return null;
  const trimmed = String(val).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Gets the source text for a key (for grouping).
 * Prefers `sourceLang`, falls back to first available non-null language.
 */
function getSourceText(
  langs: Record<string, string | null>,
  sourceLang: string = 'en'
): string | null {
  const primary = normalizeSourceText(langs[sourceLang] ?? null);
  if (primary) return primary;
  for (const v of Object.values(langs)) {
    const n = normalizeSourceText(v);
    if (n) return n;
  }
  return null;
}

/**
 * Checks if a value is considered "missing" (null or empty).
 */
function isMissing(val: string | null | undefined): boolean {
  return val == null || String(val).trim() === '';
}

/**
 * Builds an index: source text -> list of donor entries (keys that have translations).
 */
export function buildSourceTextIndex(
  data: TranslationMap,
  sourceLang: string = 'en'
): Map<string, DonorEntry[]> {
  const index = new Map<string, DonorEntry[]>();

  for (const [filePath, keys] of Object.entries(data)) {
    for (const [key, langs] of Object.entries(keys)) {
      const sourceText = getSourceText(langs, sourceLang);
      if (!sourceText) continue;

      const translations: Record<string, string> = {};
      for (const [lang, val] of Object.entries(langs)) {
        if (!isMissing(val)) translations[lang] = val as string;
      }
      if (Object.keys(translations).length === 0) continue;

      const entry: DonorEntry = { filePath, key, translations };
      const list = index.get(sourceText) ?? [];
      list.push(entry);
      index.set(sourceText, list);
    }
  }

  return index;
}

/**
 * Fills missing translations by reusing from donors with same source text.
 * Mutates `data` in place. Calls logFn for each substitution.
 */
export function fillGaps(
  data: TranslationMap,
  index: Map<string, DonorEntry[]>,
  logFn: LogFn
): { substitutions: number } {
  let substitutions = 0;

  for (const [filePath, keys] of Object.entries(data)) {
    for (const [key, langs] of Object.entries(keys)) {
      const sourceText = getSourceText(langs, 'en');
      if (!sourceText) continue;

      const donors = index.get(sourceText);
      if (!donors || donors.length === 0) continue;

      for (const [lang, val] of Object.entries(langs)) {
        if (!isMissing(val)) continue;

        const donor = donors.find((d) => d.translations[lang]);
        if (!donor) continue;

        const newVal = donor.translations[lang];
        const oldVal = val ?? 'null';
        const entry = data[filePath]?.[key];
        if (entry) {
          entry[lang] = newVal;
          substitutions++;
          logFn(`[SUBSTITUTION] ${filePath} | ${key} | ${lang} | ${oldVal} → "${newVal}"`);
        }
      }
    }
  }

  return { substitutions };
}
