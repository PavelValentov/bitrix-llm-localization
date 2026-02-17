import * as fs from 'fs';
import * as path from 'path';
import { aggregate } from '../src/aggregator.js';
import { buildSourceTextIndex, fillAllNullOrWhitespaceOnlyKeys, fillGaps, fillUniformValues } from '../src/fill-gaps.js';
import type { TranslationMap } from '../src/utils.js';
import { ALLOWED_LANGUAGES } from '../src/utils.js';

const USAGE = `
Usage: pnpm unite-localization <input-dir> <output-dir> [--fill-gaps]

  input-dir   Directory containing language subdirs (e.g. dev/, prod/ with en/, ru/, tr/)
              and/or localization.json or localization-full.json
  output-dir  Directory where to write the result localization.json
  --fill-gaps After merging, run fill-gaps (cross-reference + uniform) to fill missing translations where possible

Discovery:
  - If input-dir has direct language subdirs (en, ru, tr, ...), they are used as one root
  - Otherwise, subdirs that contain language subdirs (e.g. dev, prod) are used as roots
  - Existing localization.json or localization-full.json in input-dir is merged (existing has priority;
    whitespace-only values are replaced by non-whitespace from PHP when applicable)

Examples:
  pnpm unite-localization input/business50 output/business50
  pnpm unite-localization input/business50 output/business50 --fill-gaps
`;

// --- §4.6 Empty / whitespace validation ---

/** True if value is null, undefined, or empty string (missing translation). */
function isEmptyOrMissing(val: string | null | undefined): boolean {
  return val == null || val === '';
}

/** True if value is a non-empty string that contains only whitespace. */
function isWhitespaceOnly(val: string): boolean {
  return val.length > 0 && val.trim().length === 0;
}

/** True if we should replace current with new (per §4.6). Do not trim stored values. */
function shouldReplaceWithNew(
  current: string | null | undefined,
  newVal: string | null | undefined
): boolean {
  if (isEmptyOrMissing(newVal)) return false;
  if (isEmptyOrMissing(current)) return true;
  if (isWhitespaceOnly(current) && newVal!.trim().length > 0) return true;
  return false;
}

// --- Discovery ---

/** Returns paths to use as language roots: either [inputDir] or nested dirs (e.g. dev, prod). */
function discoverLanguageRoots(inputDir: string): string[] {
  const entries = fs.readdirSync(inputDir).filter((e) => {
    const p = path.join(inputDir, e);
    return fs.statSync(p).isDirectory();
  });
  const hasDirectLang = entries.some((e) => ALLOWED_LANGUAGES.includes(e));
  if (hasDirectLang) return [inputDir];
  const nested = entries.filter((e) => {
    const p = path.join(inputDir, e);
    const sub = fs.readdirSync(p);
    return sub.some((d) => ALLOWED_LANGUAGES.includes(d));
  });
  return nested.map((e) => path.join(inputDir, e));
}

/** Returns path to localization.json or localization-full.json in inputDir, or null. */
function findExistingJson(inputDir: string): string | null {
  const a = path.join(inputDir, 'localization.json');
  const b = path.join(inputDir, 'localization-full.json');
  if (fs.existsSync(a)) return a;
  if (fs.existsSync(b)) return b;
  return null;
}

/** Collect all unique language codes from a TranslationMap. */
function collectLanguages(data: TranslationMap): Set<string> {
  const langs = new Set<string>();
  for (const fileData of Object.values(data)) {
    for (const keyData of Object.values(fileData)) {
      for (const lang of Object.keys(keyData)) {
        langs.add(lang);
      }
    }
  }
  return langs;
}

/** Merge incoming into result: union of keys; for each slot apply shouldReplaceWithNew(result, incoming). */
function mergeInto(
  result: TranslationMap,
  incoming: TranslationMap,
  allLangs: Set<string>
): void {
  for (const [filePath, fileData] of Object.entries(incoming)) {
    if (!result[filePath]) result[filePath] = {};
    for (const [key, keyData] of Object.entries(fileData)) {
      if (!result[filePath][key]) result[filePath][key] = {};
      for (const lang of allLangs) {
        const current = result[filePath][key][lang];
        const newVal = keyData[lang];
        if (shouldReplaceWithNew(current, newVal)) {
          result[filePath][key][lang] = newVal ?? null;
        }
      }
    }
  }
}

/** Ensure every key in result has all lang slots (null where missing). */
function fillMissingLangs(result: TranslationMap, allLangs: Set<string>): void {
  for (const fileData of Object.values(result)) {
    for (const key of Object.keys(fileData)) {
      for (const lang of allLangs) {
        if (fileData[key][lang] === undefined) {
          fileData[key][lang] = null;
        }
      }
    }
  }
}

/** Sort result by file path, key, and lang. */
function sortMap(data: TranslationMap): TranslationMap {
  const sorted: TranslationMap = {};
  for (const filePath of Object.keys(data).sort()) {
    sorted[filePath] = {};
    for (const key of Object.keys(data[filePath]).sort()) {
      const langData = data[filePath][key];
      const sortedLang: Record<string, string | null> = {};
      for (const lang of Object.keys(langData).sort()) {
        sortedLang[lang] = langData[lang];
      }
      sorted[filePath][key] = sortedLang;
    }
  }
  return sorted;
}

// --- Main ---

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fillGapsEnabled = process.argv.includes('--fill-gaps');
if (args.length < 2) {
  console.log(USAGE.trim());
  process.exit(1);
}

const inputDir = path.resolve(args[0]);
const outputDir = path.resolve(args[1]);

if (!fs.existsSync(inputDir)) {
  console.error(`Error: Input directory not found: ${inputDir}`);
  process.exit(1);
}
if (!fs.statSync(inputDir).isDirectory()) {
  console.error(`Error: Input path is not a directory: ${inputDir}`);
  process.exit(1);
}

(async () => {
  try {
    const roots = discoverLanguageRoots(inputDir);
    if (roots.length === 0) {
      console.warn('No language roots found in input dir (no en/ru/tr or dev/prod-style subdirs).');
    } else {
      console.log(`Discovered language roots: ${roots.map((r) => path.basename(r)).join(', ')}`);
    }

    const phpMaps: TranslationMap[] = [];
    let allLangs = new Set<string>();

    for (const root of roots) {
      const map = await aggregate(root);
      phpMaps.push(map);
      allLangs = new Set([...allLangs, ...collectLanguages(map)]);
    }

    let phpMap: TranslationMap = {};
    for (const map of phpMaps) {
      mergeInto(phpMap, map, allLangs);
    }
    if (Object.keys(phpMap).length > 0) {
      const phpFiles = Object.keys(phpMap).length;
      let phpKeys = 0;
      for (const fileData of Object.values(phpMap)) {
        phpKeys += Object.keys(fileData).length;
      }
      console.log(`PHP aggregate: ${phpFiles} files, ${phpKeys} keys`);
    }

    const existingPath = findExistingJson(inputDir);
    let result: TranslationMap = {};
    if (existingPath) {
      console.log(`Loading existing JSON: ${existingPath}`);
      const existingMap: TranslationMap = JSON.parse(
        fs.readFileSync(existingPath, 'utf-8')
      );
      allLangs = new Set([...allLangs, ...collectLanguages(existingMap)]);
      mergeInto(result, existingMap, allLangs);
      mergeInto(result, phpMap, allLangs);
    } else {
      result = { ...phpMap };
    }

    fillMissingLangs(result, allLangs);

    // Normalize keys that are all null or only whitespace → all " "
    const logDir = 'logs';
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `unite-normalize-${timestamp}.log`);
    const logFn = (msg: string) => {
      fs.appendFileSync(logFile, msg + '\n');
    };
    let normalizeRes = fillAllNullOrWhitespaceOnlyKeys(result, logFn);
    if (normalizeRes.substitutions > 0) {
      console.log(`Normalize empty keys: ${normalizeRes.substitutions} → " " (log: ${logFile})`);
    }

    if (fillGapsEnabled) {
      console.log('\n=== Fill-gaps (cross-reference + uniform) ===');
      const fgLogFile = path.join(logDir, `unite-fill-gaps-${timestamp}.log`);
      const fgLogFn = (msg: string) => {
        fs.appendFileSync(fgLogFile, msg + '\n');
      };
      const index = buildSourceTextIndex(result, 'en');
      let substitutions = fillGaps(result, index, fgLogFn).substitutions;
      const uniformRes = fillUniformValues(result, fgLogFn);
      substitutions += uniformRes.substitutions;
      console.log(`Fill-gaps substitutions: ${substitutions}`);
      console.log(`Log: ${fgLogFile}`);
    }

    const sortedResult = sortMap(result);

    const outFile = path.join(outputDir, 'localization.json');
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(sortedResult, null, 2));

    const resultFiles = Object.keys(sortedResult).length;
    let resultKeys = 0;
    for (const fileData of Object.values(sortedResult)) {
      resultKeys += Object.keys(fileData).length;
    }
    const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
    console.log(`\nOutput: ${outFile}`);
    console.log(`Result: ${resultFiles} files, ${resultKeys} keys`);
    console.log(`Size: ${sizeMb} MB`);
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
