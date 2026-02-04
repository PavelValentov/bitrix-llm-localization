import * as fs from 'fs';
import * as path from 'path';

interface TranslationMap {
    [filePath: string]: {
        [key: string]: {
            [lang: string]: string;
        }
    }
}

const jsonPath = process.argv[2] || 'localization.json';

if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
}

console.log(`Validating ${jsonPath}...`);
const data: TranslationMap = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

const keys = Object.keys(data);
console.log(`Total files: ${keys.length}`);

let issues = 0;
let validFiles = 0;
let langStats: Record<string, number> = {};

const langRegex = /\/lang\/(ru|en|ua|de|fr|la|br|sc|tc|vn)\//i;

for (const filePath of keys) {
    // Check if path still contains language code
    // logic in aggregator was: relativePath.replace(/\/lang\/[a-z0-9_]+\//i, '/lang/');
    // If it failed to replace, we might see /lang/ru/ in the key.
    
    const match = filePath.match(langRegex);
    if (match) {
        console.warn(`[WARNING] Path contains unstripped language code '${match[1]}': ${filePath}`);
        issues++;
    }

    const fileData = data[filePath];
    const messageKeys = Object.keys(fileData);
    
    if (messageKeys.length === 0) {
        console.warn(`[WARNING] No messages in file: ${filePath}`);
        issues++;
    }

    for (const msgKey of messageKeys) {
        const translations = fileData[msgKey];
        const langs = Object.keys(translations);
        
        for (const lang of langs) {
            langStats[lang] = (langStats[lang] || 0) + 1;
        }
    }
    
    validFiles++;
}

console.log('\n--- Stats ---');
console.log(`Processed Files: ${validFiles}`);
console.log(`Issues Found: ${issues}`);
console.log('Translations per language (message count):');
console.table(langStats);

if (issues > 0) {
    console.log('\nQA: FAILED (Warnings present)');
} else {
    console.log('\nQA: PASSED');
}
