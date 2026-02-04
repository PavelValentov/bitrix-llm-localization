import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';

// Helper to detect encoding and convert to UTF-8
async function convertFileToUtf8(filePath: string): Promise<boolean> {
    try {
        const buffer = fs.readFileSync(filePath);
        
        // Detect encoding
        const result = jschardet.detect(buffer);
        const encoding = result.encoding;
        
        // If it's already likely UTF-8 or ASCII, skip (unless we want to be 100% sure)
        // ASCII is compatible with UTF-8.
        if (encoding === 'ascii' || encoding === 'UTF-8') {
            // Already good
            return false; 
        }

        // Common Bitrix encodings
        if (encoding === 'windows-1251' || encoding === 'KOI8-R') {
            console.log(`Converting ${filePath} from ${encoding} to UTF-8`);
            const content = iconv.decode(buffer, encoding);
            fs.writeFileSync(filePath, content, { encoding: 'utf-8' });
            return true;
        }
        
        // Fallback: If confidence is high, trust it.
        if (result.confidence > 0.9 && encoding && iconv.encodingExists(encoding)) {
             console.log(`Converting ${filePath} from ${encoding} (confidence: ${result.confidence}) to UTF-8`);
             const content = iconv.decode(buffer, encoding);
             fs.writeFileSync(filePath, content, { encoding: 'utf-8' });
             return true;
        }

        return false;
    } catch (err) {
        console.error(`Error converting ${filePath}:`, err);
        return false;
    }
}

async function convertAllFiles(rootDir: string) {
    console.log(`Scanning for PHP files in: ${rootDir}`);
    
    // Find ALL php files, not just in lang dirs, to be safe? 
    // Or just lang dirs? User said "all files". 
    // Usually localization files are the ones with encoding issues.
    // Let's stick to .php files to avoid corrupting binary assets.
    
    const files = await fg('**/*.php', { cwd: rootDir });
    console.log(`Found ${files.length} PHP files.`);
    
    let convertedCount = 0;
    
    for (const file of files) {
        const fullPath = path.join(rootDir, file);
        const converted = await convertFileToUtf8(fullPath);
        if (converted) {
            convertedCount++;
        }
        
        if (convertedCount % 100 === 0 && convertedCount > 0) {
            process.stdout.write(`\rConverted ${convertedCount} files...`);
        }
    }
    
    console.log(`\nDone. Converted ${convertedCount} files to UTF-8.`);
}

const args = process.argv.slice(2);
const rootDir = args[0] ? path.resolve(args[0]) : path.resolve('./business50');

convertAllFiles(rootDir);
