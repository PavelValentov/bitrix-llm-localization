// Shared constants and types
export const ALLOWED_LANGUAGES = [
    'en', 'ru', 'de', 'ua', 'kz', 'by',
    'fr', 'it', 'es', 'pl', 'tr',
    'br', 'la',
    'sc', 'tc', 'vn', 'ja', 'th', 'id',
    'hi'
];

export interface TranslationMap {
    [filePath: string]: {
        [key: string]: {
            [lang: string]: string | null;
        }
    }
}

/**
 * Extracts $MESS assignments from PHP content.
 */
export function extractMessages(content: string): Map<string, string> {
    const messages = new Map<string, string>();
    
    // Regex matches $MESS['KEY'] = "Value"; handling quotes and basic escaping
    const regex = /\$MESS\s*\[\s*(['"])([^'"]+)\1\s*\]\s*=\s*(['"])((?:(?!\3|\\).|\\.|[\r\n])*)\3\s*;/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
        const key = match[2];
        const quoteType = match[3];
        let value = match[4] || '';
        
        if (quoteType === "'") {
            value = value.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
        } else {
            value = value.replace(/\\\\/g, "\\").replace(/\\"/g, '"').replace(/\\$/g, "$");
        }
        
        messages.set(key, value);
    }
    
    return messages;
}
