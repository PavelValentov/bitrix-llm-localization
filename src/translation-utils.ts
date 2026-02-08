/**
 * Translation utilities ported from DEV-0009 (python-translator/nllb_utils.py).
 * Protects placeholders, cleans output, validates translations.
 */

const PLACEHOLDER_PATTERNS = [
  /#\w+#/g,
  /\{\w+\}/g,
  /%\w+/g,
  /\$\{\w+\}/g,
  /<[^>]+>/g,
  /&[a-zA-Z0-9#]+;/g,
  /\[url=.*?\]/g,
  /\[\/url\]/g,
  /\[b\]|\[\/b\]/g,
];

export class PlaceholderManager {
  private counter = 0;

  protect(text: string): { protected: string; placeholders: Record<string, string> } {
    if (!text || typeof text !== 'string') return { protected: text || '', placeholders: {} };
    const placeholders: Record<string, string> = {};
    let protectedText = text;

    for (const pattern of PLACEHOLDER_PATTERNS) {
      protectedText = protectedText.replace(pattern, (match) => {
        const token = `__PH_${this.counter}__`;
        placeholders[token] = match;
        this.counter++;
        return token;
      });
    }

    return { protected: protectedText, placeholders };
  }

  restore(text: string, placeholders: Record<string, string>): string {
    if (!text || !placeholders || Object.keys(placeholders).length === 0) return text;
    let result = text;
    for (const [token, original] of Object.entries(placeholders)) {
      result = result.replaceAll(token, original);
    }
    return result;
  }

  reset(): void {
    this.counter = 0;
  }
}

/**
 * Post-process translation: remove duplicate words, normalize whitespace.
 * Handles: "word word", "Час - час.", "Ні, ні." (case-insensitive).
 */
export function cleanTranslation(text: string | null | undefined): string | null | undefined {
  if (text == null || typeof text !== 'string') return text;
  let t = text.split(/\s+/).join(' ').trim();

  // Pattern: "X - Y." where X and Y are same word (case-insensitive). \p{L} matches Unicode letters.
  t = t.replace(/(\p{L}+)\s*-\s*(\p{L}+\.?)\s*/gu, (_, a, b) => {
    const aNorm = a.toLowerCase();
    const bNorm = b.replace(/\.$/, '').toLowerCase();
    return aNorm === bNorm ? a + ' ' : _;
  });
  t = t.split(/\s+/).join(' ').trim();

  // Remove duplicate consecutive words (case-insensitive)
  const words = t.split(/\s+/);
  const deduped: string[] = [];
  for (const w of words) {
    const wCmp = w.replace(/[.,;:!?]+$/, '').toLowerCase();
    const prevCmp = deduped.length > 0
      ? deduped[deduped.length - 1].replace(/[.,;:!?]+$/, '').toLowerCase()
      : null;
    if (prevCmp !== wCmp) deduped.push(w);
  }
  let result = deduped.join(' ').trim();

  // Strip trailing punctuation for short strings (single word)
  if (result.split(/\s+/).length === 1 && result.length < 15) {
    result = result.replace(/[.,;:!?]+$/, '');
  }

  return result;
}

const CYRILLIC_LANGS = new Set(['ru', 'ua', 'by', 'bg', 'mk', 'sr', 'kz']);
const LATIN_LANGS = new Set(['en', 'tr', 'de', 'fr', 'es', 'it', 'pl', 'br', 'vn']);
const CYRILLIC_PATTERN = /[а-яА-ЯёЁ]/;
const LATIN_PATTERN = /[a-zA-Z]/;

/**
 * Validates translation based on script and heuristics.
 * Returns true if valid, false if hallucination detected.
 */
export function validateTranslation(text: string | null | undefined, tgtLang: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const isCyrillic = CYRILLIC_PATTERN.test(text);
  const isLatin = LATIN_PATTERN.test(text);

  if (CYRILLIC_LANGS.has(tgtLang)) {
    if (isLatin && !isCyrillic) return false;
  } else if (LATIN_LANGS.has(tgtLang)) {
    if (isCyrillic) return false;
  }

  return true;
}

const PROXIMITY_MAP: Record<string, string[]> = {
  ua: ['ru', 'en'],
  by: ['ru', 'en'],
  kz: ['ru', 'en'],
  pl: ['en', 'ru'],
  de: ['en', 'ru'],
  fr: ['en', 'ru'],
  es: ['en', 'ru'],
  tr: ['en', 'ru'],
};

/**
 * Selects best translation from candidates based on validation and language proximity.
 */
export function selectBestCandidate(
  candidates: Record<string, string>,
  tgtLang: string,
  primarySrc = 'en'
): string | null {
  const valid: Record<string, string> = {};
  for (const [src, txt] of Object.entries(candidates)) {
    if (validateTranslation(txt, tgtLang)) valid[src] = txt;
  }

  if (Object.keys(valid).length === 0) return null;
  if (Object.keys(valid).length === 1) return Object.values(valid)[0];

  const values = Object.values(valid);
  if (values.every((v) => v === values[0])) return values[0];

  const preferred = PROXIMITY_MAP[tgtLang] ?? [primarySrc];
  for (const src of preferred) {
    if (valid[src]) return valid[src];
  }
  if (valid[primarySrc]) return valid[primarySrc];
  return Object.values(valid)[0];
}
