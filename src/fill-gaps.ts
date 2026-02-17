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

/**
 * True if value has no real content (null, empty, or whitespace-only).
 */
function isEmptyOrWhitespaceOnly(val: string | null | undefined): boolean {
  if (val == null) return true;
  return String(val).trim() === '';
}

/**
 * For each key where ALL values are null/empty or whitespace-only (no real translation):
 * set every language slot to " " (one space).
 * Covers: (1) all null, (2) one " " and rest null — normalize to all " ".
 * Mutates `data` in place.
 */
export function fillAllNullOrWhitespaceOnlyKeys(
  data: TranslationMap,
  logFn: LogFn
): { substitutions: number } {
  let substitutions = 0;

  for (const [filePath, keys] of Object.entries(data)) {
    for (const [key, langs] of Object.entries(keys)) {
      const hasRealValue = Object.values(langs).some((v) => !isEmptyOrWhitespaceOnly(v));
      if (hasRealValue) continue;

      const entry = data[filePath]?.[key];
      if (!entry) continue;

      for (const lang of Object.keys(entry)) {
        const current = entry[lang];
        if (current === ' ') continue;
        entry[lang] = ' ';
        substitutions++;
        logFn(`[NORMALIZE-EMPTY] ${filePath} | ${key} | ${lang} | ${JSON.stringify(current)} → " "`);
      }
    }
  }

  return { substitutions };
}

/**
 * Fills missing translations if ALL existing translations for a key are identical.
 * Requires at least 2 identical existing values to be considered "uniform" (safety check),
 * OR if the value matches a "universal" pattern (punctuation, numbers, etc).
 */
export function fillUniformValues(
  data: TranslationMap,
  logFn: LogFn
): { substitutions: number } {
  let substitutions = 0;

  for (const [filePath, keys] of Object.entries(data)) {
    for (const [key, langs] of Object.entries(keys)) {
      const existingValues: string[] = [];
      const missingLangs: string[] = [];

      for (const [lang, val] of Object.entries(langs)) {
        if (!isMissing(val)) {
          existingValues.push(val as string);
        } else {
          missingLangs.push(lang);
        }
      }

      // If no missing languages, nothing to fill
      if (missingLangs.length === 0) continue;

      // If no existing values, nothing to copy from
      if (existingValues.length === 0) continue;

      // Check if all existing values are identical
      const firstVal = existingValues[0];
      const allIdentical = existingValues.every((v) => v === firstVal);

      if (!allIdentical) continue;

      // STRICT RULE: Copy only if we have at least 2 identical values.
      // If we have only 1 value (e.g. en="123", ru="", tr=""), we CANNOT be sure it's universal.
      // But if en="123" and ru="123", then it's safe to assume tr="123".
      if (existingValues.length < 2) continue;

      for (const lang of missingLangs) {
        const entry = data[filePath]?.[key];
        if (entry) {
          entry[lang] = firstVal;
          substitutions++;
          logFn(`[UNIFORM-FILL] ${filePath} | ${key} | ${lang} | null → "${firstVal}"`);
        }
      }
    }
  }

  return { substitutions };
}
