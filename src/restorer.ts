import * as fs from 'fs';
import * as path from 'path';
import { ALLOWED_LANGUAGES, TranslationMap } from './utils.js';

export async function restore(data: TranslationMap, targetDir: string): Promise<number> {
    console.log(`Target Directory: ${targetDir}`);

    if (!fs.existsSync(targetDir)) {
        console.log(`Creating target directory: ${targetDir}`);
        fs.mkdirSync(targetDir, { recursive: true });
    }

    const files = Object.keys(data);
    console.log(`Total files to process: ${files.length}`);

    // Detect active languages
    console.log('Detecting active languages...');
    const activeLanguages = new Set<string>();
    
    for (const file of files) {
        const fileData = data[file];
        const keys = Object.keys(fileData);
        if (keys.length > 0) {
            const firstKey = keys[0];
            const langs = Object.keys(fileData[firstKey]);
            for (const lang of langs) {
                if (ALLOWED_LANGUAGES.includes(lang)) {
                    activeLanguages.add(lang);
                }
            }
            break; 
        }
    }
    
    if (activeLanguages.size === 0) {
        console.warn("Warning: No active languages detected.");
    } else {
        console.log(`Active languages detected: ${Array.from(activeLanguages).join(', ')}`);
    }

    let processedFiles = 0;
    let writtenFiles = 0;

    for (const normalizedPath of files) {
        const fileTranslations = data[normalizedPath];
        const messageKeys = Object.keys(fileTranslations);

        for (const lang of activeLanguages) {
            const relativePath = normalizedPath.replace(/\{lang\}/g, lang);
            const fullPath = path.join(targetDir, lang, relativePath);

            let phpContent = `<?php\n`;
            let hasContent = false;

            for (const msgKey of messageKeys) {
                const value = fileTranslations[msgKey][lang];
                
                if (value !== null && value !== undefined) {
                    // PHP double-quoted string: escape \, $, " (any language may contain $ or " in text/code examples)
                    const safeValue = value
                        .replace(/\\/g, '\\\\')
                        .replace(/\$/g, '\\$')
                        .replace(/"/g, '\\"');
                    phpContent += `$MESS["${msgKey}"] = "${safeValue}";\n`;
                    hasContent = true;
                }
            }
            phpContent += `?>`;

            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, phpContent);
            writtenFiles++;
        }
        processedFiles++;
        
        if (processedFiles % 1000 === 0) {
            // In a library, maybe don't pollute stdout? 
            // Or use a callback/logger injection. For now, keep simple.
        }
    }

    return writtenFiles;
}
