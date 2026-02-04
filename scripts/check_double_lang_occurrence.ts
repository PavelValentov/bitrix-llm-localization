import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

const ALLOWED_LANGUAGES = [
    'en', 'ru', 'de', 'ua', 'kz', 'by',
    'fr', 'it', 'es', 'pl', 'tr',
    'br', 'la',
    'sc', 'tc', 'vn', 'ja', 'th', 'id',
    'hi'
];

async function checkDoubleLang(rootDir: string) {
    console.log(`Scanning root directory: ${rootDir}`);
    
    if (!fs.existsSync(rootDir)) {
        console.error(`Error: Directory not found: ${rootDir}`);
        process.exit(1);
    }

    const langDirs = fs.readdirSync(rootDir).filter(file => {
        const fullPath = path.join(rootDir, file);
        return fs.statSync(fullPath).isDirectory() && ALLOWED_LANGUAGES.includes(file);
    });

    if (langDirs.length === 0) {
        console.warn('No valid language directories found.');
        return;
    }

    console.log(`Found languages: ${langDirs.join(', ')}`);
    console.log('Checking for paths where the language code appears multiple times...\n');

    let issuesFound = 0;

    for (const lang of langDirs) {
        const langPath = path.join(rootDir, lang);
        
        // Find all PHP files
        const phpFiles = await fg('**/*.php', { cwd: langPath });
        
        for (const file of phpFiles) {
            // Normalize separator
            const relativePath = file.split(path.sep).join('/');
            
            // Check for multiple occurrences of the language code as a path segment
            // e.g. "/ru/" or starting with "ru/" or ending with "/ru"
            const segments = relativePath.split('/');
            
            // Count how many segments are exactly the language code
            const langOccurrences = segments.filter(seg => seg === lang).length;

            if (langOccurrences > 0) {
                // By definition, we are inside root/lang/, so 'file' is relative to that.
                // In a standard structure like 'module/lang/ru/file.php', 'ru' appears ONCE in the relative path.
                // If it appears > 1, that's definitely a duplicate.
                
                if (langOccurrences > 1) {
                    console.warn(`[DOUBLE LANG] ${lang} appears ${langOccurrences} times in: ${lang}/${relativePath}`);
                    issuesFound++;
                }
            }
            
            // Also check for multiple /lang/ segments, which might indicate nested structures
            const langDirCount = segments.filter(seg => seg === 'lang').length;
            if (langDirCount > 1) {
                 console.warn(`[DOUBLE LANG DIR] 'lang' appears ${langDirCount} times in: ${lang}/${relativePath}`);
                 issuesFound++;
            }
        }
    }

    console.log(`\nScan complete.`);
    if (issuesFound === 0) {
        console.log('✅ No paths found with multiple language code occurrences.');
    } else {
        console.log(`⚠️ Found ${issuesFound} potentially problematic paths.`);
    }
}

const args = process.argv.slice(2);
const rootDir = args[0] ? path.resolve(args[0]) : path.resolve('./business50');

checkDoubleLang(rootDir);
