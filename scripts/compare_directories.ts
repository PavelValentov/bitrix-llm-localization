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

async function compareDirectories(dir1: string, dir2: string) {
    console.log(`Comparing Directory 1: ${dir1}`);
    console.log(`Comparing Directory 2: ${dir2}`);

    if (!fs.existsSync(dir1)) {
        console.error(`Error: Directory 1 not found: ${dir1}`);
        process.exit(1);
    }
    if (!fs.existsSync(dir2)) {
        console.error(`Error: Directory 2 not found: ${dir2}`);
        process.exit(1);
    }

    // Helper to get relative file list for a root dir
    async function getFileList(rootDir: string): Promise<Set<string>> {
        const fileSet = new Set<string>();
        
        // Find language dirs
        const langDirs = fs.readdirSync(rootDir).filter(file => {
            const fullPath = path.join(rootDir, file);
            return fs.statSync(fullPath).isDirectory() && ALLOWED_LANGUAGES.includes(file);
        });

        for (const lang of langDirs) {
            const langPath = path.join(rootDir, lang);
            // fast-glob returns string[]
            const files = await fg('**/*.php', { cwd: langPath });
            
            for (const file of files) {
                // Store as "lang/path/to/file.php"
                fileSet.add(`${lang}/${file}`);
            }
        }
        return fileSet;
    }

    console.log('Scanning Directory 1...');
    const files1 = await getFileList(dir1);
    console.log(`Files in Dir 1: ${files1.size}`);

    console.log('Scanning Directory 2...');
    const files2 = await getFileList(dir2);
    console.log(`Files in Dir 2: ${files2.size}`);

    console.log('\n--- Comparison Results ---');

    // Check files present in Dir 1 but missing in Dir 2
    let missingInDir2: string[] = [];
    for (const file of files1) {
        if (!files2.has(file)) {
            missingInDir2.push(file);
        }
    }

    // Check files present in Dir 2 but missing in Dir 1
    let missingInDir1: string[] = [];
    for (const file of files2) {
        if (!files1.has(file)) {
            missingInDir1.push(file);
        }
    }

    console.log(`Files in ${path.basename(dir1)} but NOT in ${path.basename(dir2)}: ${missingInDir2.length}`);
    
    if (missingInDir2.length > 0) {
        console.log('\n--- Missing Files Content Preview ---');
        // Preview content of first 20 missing files
        const limit = 20; 
        for (let i = 0; i < Math.min(missingInDir2.length, limit); i++) {
            const relativeFile = missingInDir2[i];
            const fullPath = path.join(dir1, relativeFile);
            
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const preview = content.length > 150 ? content.substring(0, 150).replace(/\n/g, ' ') + '...' : content.replace(/\n/g, ' ');
                console.log(`[${i+1}] ${relativeFile}`);
                console.log(`    Content: "${preview}"\n`);
            } catch (err) {
                console.error(`    Error reading file: ${err}`);
            }
        }
    }

    console.log(`Files in ${path.basename(dir2)} but NOT in ${path.basename(dir1)}: ${missingInDir1.length}`);

    if (missingInDir1.length > 0) {
        console.log('\n--- Unexpected Extra Files in Target ---');
        const limit = 20; 
        for (let i = 0; i < Math.min(missingInDir1.length, limit); i++) {
            const relativeFile = missingInDir1[i];
            const fullPath = path.join(dir2, relativeFile);
            
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const preview = content.length > 150 ? content.substring(0, 150).replace(/\n/g, ' ') + '...' : content.replace(/\n/g, ' ');
                console.log(`[${i+1}] ${relativeFile}`);
                console.log(`    Content: "${preview}"\n`);
            } catch (err) {
                console.error(`    Error reading file: ${err}`);
            }
        }
        if (missingInDir1.length > limit) {
            console.log(`... and ${missingInDir1.length - limit} more files.`);
        }
    }

    if (missingInDir1.length === 0 && missingInDir2.length === 0) {
        console.log('\n✅ Directories match perfectly (file list).');
    }
}

// Entry point
const args = process.argv.slice(2);
const dir1 = args[0] ? path.resolve(args[0]) : path.resolve('./business50');
const dir2 = args[1] ? path.resolve(args[1]) : path.resolve('./business100');

compareDirectories(dir1, dir2);
