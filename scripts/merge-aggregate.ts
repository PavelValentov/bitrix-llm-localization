import * as fs from 'fs';
import * as path from 'path';
import { aggregate } from '../src/aggregator.js';
import type { TranslationMap } from '../src/utils.js';

const USAGE = `
Usage: pnpm merge-aggregate <root-dir> <existing-json> <output-json>

  root-dir       Directory with language subdirs (en/, ru/, ...)
  existing-json  Path to localization-full.json (existing translations)
  output-json    Output path for merged result

Merge logic:
  1. Aggregate PHP files from root-dir language subdirectories
  2. Merge with existing-json: existing non-null values have PRIORITY
  3. PHP values fill only null/missing slots
  4. Files/keys from both sources are preserved (union)

Examples:
  pnpm merge-aggregate input/business50 input/business50/localization-full.json input/business50/localization_pre.json
`;

const args = process.argv.slice(2);
if (args.length < 3) {
  console.log(USAGE.trim());
  process.exit(0);
}

const rootDir = path.resolve(args[0]);
const existingJsonPath = path.resolve(args[1]);
const outputPath = path.resolve(args[2]);

/**
 * Check if a value is non-null and non-empty (considered "filled").
 */
function isFilled(val: string | null | undefined): val is string {
  return val != null && val !== '';
}

/**
 * Collect all unique language codes from a TranslationMap.
 */
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

(async () => {
  try {
    // 1. Aggregate from PHP dirs
    console.log('=== Phase 1: Aggregating PHP files ===');
    const phpMap = await aggregate(rootDir);
    const phpFiles = Object.keys(phpMap).length;
    let phpKeys = 0;
    for (const fileData of Object.values(phpMap)) {
      phpKeys += Object.keys(fileData).length;
    }
    console.log(`PHP aggregate: ${phpFiles} files, ${phpKeys} keys`);

    // 2. Load existing JSON
    console.log('\n=== Phase 2: Loading existing translations ===');
    if (!fs.existsSync(existingJsonPath)) {
      console.error(`Error: Existing JSON file not found: ${existingJsonPath}`);
      process.exit(1);
    }
    const existingMap: TranslationMap = JSON.parse(fs.readFileSync(existingJsonPath, 'utf-8'));
    const existingFiles = Object.keys(existingMap).length;
    let existingKeys = 0;
    for (const fileData of Object.values(existingMap)) {
      existingKeys += Object.keys(fileData).length;
    }
    console.log(`Existing JSON: ${existingFiles} files, ${existingKeys} keys`);

    // 3. Collect all languages from both sources
    const phpLangs = collectLanguages(phpMap);
    const existingLangs = collectLanguages(existingMap);
    const allLangs = new Set([...phpLangs, ...existingLangs]);
    console.log(`\nLanguages — PHP: [${[...phpLangs].join(', ')}], Existing: [${[...existingLangs].join(', ')}], Union: [${[...allLangs].join(', ')}]`);

    // 4. Merge
    console.log('\n=== Phase 3: Merging ===');
    const result: TranslationMap = {};

    let statsNewFilesFromPhp = 0;
    let statsNewKeysFromPhp = 0;
    let statsValuesFilledFromPhp = 0;
    let statsExistingKept = 0;
    let statsBothNull = 0;

    // 4a. Process all files from existing JSON (priority source)
    for (const [filePath, existingFileData] of Object.entries(existingMap)) {
      if (!result[filePath]) result[filePath] = {};

      for (const [key, existingKeyData] of Object.entries(existingFileData)) {
        if (!result[filePath][key]) result[filePath][key] = {};

        for (const lang of allLangs) {
          const existingVal = existingKeyData[lang];
          const phpVal = phpMap[filePath]?.[key]?.[lang];

          if (isFilled(existingVal)) {
            result[filePath][key][lang] = existingVal;
            statsExistingKept++;
          } else if (isFilled(phpVal)) {
            result[filePath][key][lang] = phpVal;
            statsValuesFilledFromPhp++;
          } else {
            result[filePath][key][lang] = null;
            statsBothNull++;
          }
        }
      }
    }

    // 4b. Add files/keys from PHP that are NOT in existing JSON
    for (const [filePath, phpFileData] of Object.entries(phpMap)) {
      const isNewFile = !result[filePath];
      if (isNewFile) {
        result[filePath] = {};
        statsNewFilesFromPhp++;
      }

      for (const [key, phpKeyData] of Object.entries(phpFileData)) {
        if (result[filePath][key]) continue; // Already processed from existing

        // This is a new key (not in existing JSON)
        result[filePath][key] = {};
        statsNewKeysFromPhp++;

        for (const lang of allLangs) {
          const phpVal = phpKeyData[lang];
          if (isFilled(phpVal)) {
            result[filePath][key][lang] = phpVal;
          } else {
            result[filePath][key][lang] = null;
          }
        }
      }
    }

    // 5. Sort result by file path, then by key
    console.log('Sorting result...');
    const sortedResult: TranslationMap = {};
    const sortedFiles = Object.keys(result).sort();
    for (const filePath of sortedFiles) {
      sortedResult[filePath] = {};
      const sortedKeys = Object.keys(result[filePath]).sort();
      for (const key of sortedKeys) {
        // Sort languages alphabetically within each key
        const langData = result[filePath][key];
        const sortedLangData: Record<string, string | null> = {};
        for (const lang of [...Object.keys(langData)].sort()) {
          sortedLangData[lang] = langData[lang];
        }
        sortedResult[filePath][key] = sortedLangData;
      }
    }

    // 6. Write output
    console.log(`\nWriting to ${outputPath}...`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(sortedResult, null, 2));

    // 7. Final statistics
    const resultFiles = Object.keys(sortedResult).length;
    let resultKeys = 0;
    for (const fileData of Object.values(sortedResult)) {
      resultKeys += Object.keys(fileData).length;
    }

    console.log('\n=== Merge Statistics ===');
    console.log(`Source — Existing JSON: ${existingFiles} files, ${existingKeys} keys`);
    console.log(`Source — PHP Aggregate: ${phpFiles} files, ${phpKeys} keys`);
    console.log(`Result: ${resultFiles} files, ${resultKeys} keys`);
    console.log(`---`);
    console.log(`New files from PHP (not in existing): ${statsNewFilesFromPhp}`);
    console.log(`New keys from PHP (not in existing): ${statsNewKeysFromPhp}`);
    console.log(`Values kept from existing (priority): ${statsExistingKept}`);
    console.log(`Values filled from PHP (was null): ${statsValuesFilledFromPhp}`);
    console.log(`Both null (remain unfilled): ${statsBothNull}`);
    console.log(`---`);
    console.log(`Output: ${outputPath}`);
    const stats = fs.statSync(outputPath);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
})();
