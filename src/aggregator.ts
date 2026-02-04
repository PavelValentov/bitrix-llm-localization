import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { ALLOWED_LANGUAGES, TranslationMap, extractMessages } from './utils.js';

export async function aggregate(rootDir: string): Promise<TranslationMap> {
    console.log(`Scanning root directory: ${rootDir}`);
    
    const translationMap: TranslationMap = {};
    
    if (!fs.existsSync(rootDir)) {
        throw new Error(`Directory not found: ${rootDir}`);
    }

    const langDirs = fs.readdirSync(rootDir).filter(file => {
        const fullPath = path.join(rootDir, file);
        return fs.statSync(fullPath).isDirectory() && ALLOWED_LANGUAGES.includes(file);
    });

    if (langDirs.length === 0) {
        console.warn('No valid language directories found.');
        return {};
    }

    console.log(`Found languages: ${langDirs.join(', ')}`);

    const langPathRegexGlobal = new RegExp(`\\/lang\\/(${ALLOWED_LANGUAGES.join('|')})\\/`, 'gi');

    // 1. First Pass: Collect all translations
    for (const lang of langDirs) {
        const langPath = path.join(rootDir, lang);
        console.log(`Processing language: ${lang}...`);
        
        const phpFiles = await fg('**/*.php', { cwd: langPath });
        console.log(`  Found ${phpFiles.length} PHP files in ${lang}`);

        for (const file of phpFiles) {
            const fullPath = path.join(langPath, file);
            let relativePath = file.split(path.sep).join('/');
            let normalizedPath = relativePath.replace(langPathRegexGlobal, '/lang/{lang}/');
            
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const messages = extractMessages(content);
                
                if (!translationMap[normalizedPath]) {
                    translationMap[normalizedPath] = {};
                }

                if (messages.size > 0) {
                    for (const [key, value] of messages) {
                        if (!translationMap[normalizedPath][key]) {
                            translationMap[normalizedPath][key] = {};
                        }
                        translationMap[normalizedPath][key][lang] = value;
                    }
                }
            } catch (err) {
                console.error(`  Error reading/parsing ${file}:`, err);
            }
        }
    }

    // 2. Second Pass: Sort keys and fill missing languages
    console.log('Sorting and filling missing translations...');
    
    const allFiles = Object.keys(translationMap).sort();
    const sortedTranslationMap: TranslationMap = {};
    
    for (const filePath of allFiles) {
        const fileData = translationMap[filePath];
        const messageKeys = Object.keys(fileData).sort(); 
        
        const sortedFileData: { [key: string]: { [lang: string]: string | null } } = {};

        for (const msgKey of messageKeys) {
            const messageData = fileData[msgKey];
            
            // Fill missing languages with NULL
            for (const lang of langDirs) {
                if (!messageData.hasOwnProperty(lang)) {
                    messageData[lang] = null;
                }
            }
            sortedFileData[msgKey] = messageData;
        }
        
        sortedTranslationMap[filePath] = sortedFileData;
    }

    return sortedTranslationMap;
}
