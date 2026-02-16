import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { exec, spawnSync } from 'child_process';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const execAsync = promisify(exec);

const ALLOWED_LANGUAGES = [
    'en', 'ru', 'de', 'ua', 'kz', 'by',
    'fr', 'it', 'es', 'pl', 'tr',
    'br', 'la',
    'sc', 'tc', 'vn', 'ja', 'th', 'id',
    'hi'
];

async function createArchives(targetDir: string) {
    console.log(`Scanning directory: ${targetDir}`);

    if (!fs.existsSync(targetDir)) {
        console.error(`Error: Directory not found: ${targetDir}`);
        process.exit(1);
    }

    // Identify language directories
    const langDirs = fs.readdirSync(targetDir).filter(file => {
        const fullPath = path.join(targetDir, file);
        return fs.statSync(fullPath).isDirectory() && ALLOWED_LANGUAGES.includes(file);
    });

    if (langDirs.length === 0) {
        console.warn('No language directories found to archive.');
        return;
    }

    console.log(`Found languages: ${langDirs.join(', ')}`);

    for (const lang of langDirs) {
        const langPath = path.join(targetDir, lang);
        const archiveName = `file-${lang}.tar.gz`;
        const archivePath = path.join(targetDir, archiveName);

        console.log(`Archiving ${lang} -> ${archiveName}...`);

        try {
            // Using tar command
            // -c: create
            // -z: gzip
            // -f: file
            // -C: change directory (so the archive contains contents relative to lang folder, or the lang folder itself?)
            // Usually, these archives contain the contents OF the language folder, not the folder itself as root?
            // User requested "file-en.tar.gz".
            // If I extract file-en.tar.gz, do I expect a folder 'en' or just the contents?
            // Usually in Bitrix marketplace or updates, it's often the contents. 
            // BUT looking at 'business50', we have 'en', 'ru' folders.
            // If I untar file-en.tar.gz, I probably want it to dump into 'en/' or current dir.
            // Let's assume we want to archive the FOLDER 'en' so extracting it gives 'en/'.
            
            // Command: tar -czf file-en.tar.gz -C targetDir en
            const command = `tar -czf "${archivePath}" -C "${targetDir}" "${lang}"`;
            
            await execAsync(command);
            console.log(`✅ Created: ${archivePath}`);
            
            // Verify size
            const stats = fs.statSync(archivePath);
            console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        } catch (error) {
            console.error(`❌ Error archiving ${lang}:`, error);
        }
    }
    
    console.log('\nAll archives created successfully.');
}

// Entry point
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const skipVerify = process.argv.includes('--skip-verify');
const targetDir = args[0] ? path.resolve(args[0]) : path.resolve('./business100');

(async () => {
    if (!skipVerify) {
        const verifyScript = path.join(__dirname, 'verify_php_before_archives.ts');
        const result = spawnSync('npx', ['tsx', verifyScript, targetDir], {
            stdio: 'inherit',
        });
        if (result.status !== 0) {
            console.error('Run with --skip-verify to archive without verification.');
            process.exit(result.status ?? 1);
        }
    }
    await createArchives(targetDir);
})();
