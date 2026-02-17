import * as fs from 'fs';
import * as path from 'path';
import { buildSourceTextIndex, fillAllNullOrWhitespaceOnlyKeys, fillGaps, fillUniformValues } from '../src/fill-gaps.js';
import type { TranslationMap } from '../src/utils.js';

const USAGE = `
Usage: pnpm fill-gaps <input-json> <output-folder> [--dry-run]

  input-json     Path to localization.json
  output-folder  Directory for result (writes <input-basename> there)
  --dry-run      No file write, only log substitutions

Examples:
  pnpm fill-gaps output/business50/localization.json output/filled
  pnpm fill-gaps output/business50/localization.json output/filled --dry-run
`;

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');

if (args.length < 2) {
  console.log(USAGE.trim());
  process.exit(0);
}

const jsonPath = path.resolve(args[0]);
const targetDir = path.resolve(args[1]);

(async () => {
  try {
    if (!fs.existsSync(jsonPath)) {
      console.error(`Error: JSON file not found: ${jsonPath}`);
      process.exit(1);
    }

    const data: TranslationMap = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    const logDir = 'logs';
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `fill-gaps-${timestamp}.log`);

    const logFn = (msg: string) => {
      fs.appendFileSync(logFile, msg + '\n');
    };

    logFn(`[FILL-GAPS] ${new Date().toISOString()} | Started`);

    // Pass 0: normalize keys that are all null or only whitespace → all " "
    const normalizeRes = fillAllNullOrWhitespaceOnlyKeys(data, logFn);
    let substitutions = normalizeRes.substitutions;
    logFn(`[NORMALIZE-EMPTY] Keys with no real content set to " ". Substitutions: ${normalizeRes.substitutions}`);

    const index = buildSourceTextIndex(data, 'en');
    const gapRes = fillGaps(data, index, logFn);
    substitutions += gapRes.substitutions;
    logFn(`[FILL-GAPS] First pass (copy from source) complete. Substitutions: ${gapRes.substitutions}`);

    // Second pass: fill uniform values (e.g. "?", "!", numbers, or identical translations)
    const uniformRes = fillUniformValues(data, logFn);
    substitutions += uniformRes.substitutions;
    logFn(`[UNIFORM-FILL] Second pass (uniform values) complete. Substitutions: ${uniformRes.substitutions}`);

    logFn(`[FILL-GAPS] ${new Date().toISOString()} | Completed | Total: ${substitutions}`);

    console.log(`\nDone! Substitutions: ${substitutions}`);
    console.log(`Log: ${logFile}`);

    if (!dryRun && substitutions > 0) {
      const basename = path.basename(jsonPath);
      const outputPath = path.join(targetDir, basename);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
      console.log(`Output: ${outputPath}`);
    } else if (dryRun) {
      console.log('(dry-run: no file written)');
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
