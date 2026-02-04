import * as fs from 'fs';
import * as path from 'path';
import { restore } from '../src/restorer.js';

const args = process.argv.slice(2);
const jsonPath = args[0] ? path.resolve(args[0]) : path.resolve('./business50/localization.json');
const targetDir = args[1] ? path.resolve(args[1]) : path.resolve('./business100');

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
