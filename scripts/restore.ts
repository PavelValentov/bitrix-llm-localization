import * as fs from 'fs';
import * as path from 'path';
import { restore } from '../src/restorer.js';

const USAGE = `
Usage: pnpm restore <input-json> <output-folder>

  input-json     Path to localization.json
  output-folder  Directory for restored PHP files

Examples:
  pnpm restore output/business50/localization.json output/business50-restored
  pnpm restore ./localization.json ./restored
`;

const args = process.argv.slice(2);
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
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        const count = await restore(data, targetDir);
        console.log(`\nDone! Total files restored: ${count}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
