import * as fs from 'fs';
import * as path from 'path';

const ALLOWED_LANGUAGES = [
    'en', 'ru', 'de', 'ua', 'kz', 'by',
    'fr', 'it', 'es', 'pl', 'tr',
    'br', 'la',
    'sc', 'tc', 'vn', 'ja', 'th', 'id',
    'hi'
];

interface TranslationMap {
    [filePath: string]: {
        [key: string]: {
            [lang: string]: string;
        }
    }
}

async function verifyFilesExist(rootDir: string, jsonPath: string) {
    console.log(`Root Directory: ${rootDir}`);
    console.log(`JSON File: ${jsonPath}`);

    if (!fs.existsSync(jsonPath)) {
        console.error(`Error: JSON file not found: ${jsonPath}`);
        process.exit(1);
    }

    console.log('Loading JSON...');
    const data: TranslationMap = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const files = Object.keys(data);
    console.log(`Total entries in JSON: ${files.length}`);

    let missingCount = 0;
    let checkedCount = 0;

    console.log('Verifying file existence for filled translations...');

    for (const normalizedPath of files) {
        const fileData = data[normalizedPath];
        const messageKeys = Object.keys(fileData);

        // Determine which languages have content in this file
        const activeLanguages = new Set<string>();

        for (const msgKey of messageKeys) {
            const translations = fileData[msgKey];
            for (const lang of Object.keys(translations)) {
                if (translations[lang] && translations[lang].trim() !== "") {
                    // Only care if translation is NOT empty
                    activeLanguages.add(lang);
                }
            }
        }

        // For each active language, check if the file exists
        for (const lang of activeLanguages) {
            if (!ALLOWED_LANGUAGES.includes(lang)) {
                continue; // Skip unknown language keys if any
            }

            // Reconstruct path:
            // 1. Replace {lang} in normalized path with actual lang
            const relativePath = normalizedPath.replace(/\{lang\}/g, lang);
            
            // 2. Full path = rootDir + / + lang + / + relativePath
            // Note: The aggregator scanned `rootDir/lang/...`. 
            // So the file `dav/lang/{lang}/install/index.php` for `ru`
            // is at `rootDir/ru/dav/lang/ru/install/index.php`.
            const fullPath = path.join(rootDir, lang, relativePath);

            checkedCount++;

            if (!fs.existsSync(fullPath)) {
                console.error(`[MISSING] Lang: ${lang} | File: ${fullPath}`);
                console.error(`          (Source Key: ${normalizedPath})`);
                missingCount++;
            }
        }
    }

    console.log('\n--- Verification Results ---');
    console.log(`Checked File Paths: ${checkedCount}`);
    console.log(`Missing Files: ${missingCount}`);

    if (missingCount === 0) {
        console.log('✅ All required files exist.');
    } else {
        console.log('❌ Some files are missing.');
        process.exit(1);
    }
}

// Entry point
const args = process.argv.slice(2);
const rootDir = args[0] ? path.resolve(args[0]) : path.resolve('./business50');
// Try to find json in rootDir if not provided
const defaultJson = path.join(rootDir, 'localization.json');
const jsonPath = args[1] ? path.resolve(args[1]) : defaultJson;

verifyFilesExist(rootDir, jsonPath);
