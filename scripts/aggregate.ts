import * as fs from 'fs';
import * as path from 'path';
import { aggregate } from '../src/aggregator.js';

const args = process.argv.slice(2);
const rootDir = args[0] ? path.resolve(args[0]) : path.resolve('./business50');
const outputFile = args[1] ? path.resolve(args[1]) : path.join(rootDir, 'localization.json');

(async () => {
    try {
        const result = await aggregate(rootDir);
        fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
        console.log(`\nSuccess! Aggregated translations written to: ${outputFile}`);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();
