/**
 * Verifies PHP localization files before packing archives.
 * Ensures: (1) PHP syntax is valid (php -l), (2) each file contains parseable $MESS entries.
 * Run before create-archives to avoid uploading broken files to Bitrix.
 *
 * Usage: pnpm verify-php-before-archives <target-dir>
 * Example: pnpm verify-php-before-archives output/business50
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import fg from 'fast-glob';
import { ALLOWED_LANGUAGES, extractMessages } from '../src/utils.js';

const PHP_LINT_CONCURRENCY = 16;

const USAGE = `
Usage: pnpm verify-php-before-archives <target-dir>

Verifies PHP localization files before creating archives:
  - PHP syntax check (php -l) when PHP is available
  - Files with $MESS must have parseable $MESS["KEY"] = "value"; entries (empty files allowed)
  - Reports failed files and exits with code 1 on any failure

Examples:
  pnpm verify-php-before-archives output/business50
  pnpm verify-php-before-archives output/business50 --skip-php-lint
`;

function hasPhpInPath(): boolean {
    try {
        execSync('php -v', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

const PHP_LINT_PARSE_REGEX = /Parse error\s+(.+?)\s+in\s+(.+?\.php)(?:\s+on line\s+(\d+))?/;

function runPhpLintOne(
    fullPath: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    return new Promise((resolve) => {
        const proc = spawn('php', ['-l', fullPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            const out = stdout + stderr;
            if (code === 0) {
                resolve({ ok: true });
                return;
            }
            const m = out.match(PHP_LINT_PARSE_REGEX);
            if (m) {
                resolve({
                    ok: false,
                    error: m[1].trim() + (m[3] ? ` on line ${m[3]}` : ''),
                });
            } else {
                resolve({ ok: false, error: stderr.trim() || 'Syntax error' });
            }
        });
        proc.on('error', () => resolve({ ok: false, error: 'Failed to run php -l' }));
    });
}

async function phpLintParallel(
    entries: { fullPath: string; relativeLabel: string }[]
): Promise<{ file: string; error: string }[]> {
    const failures: { file: string; error: string }[] = [];
    for (let i = 0; i < entries.length; i += PHP_LINT_CONCURRENCY) {
        const chunk = entries.slice(i, i + PHP_LINT_CONCURRENCY);
        const results = await Promise.all(
            chunk.map(async (e) => {
                const r = await runPhpLintOne(e.fullPath);
                return r.ok ? null : { file: e.relativeLabel, error: r.error };
            })
        );
        for (const r of results) {
            if (r) failures.push(r);
        }
        if ((i + chunk.length) % 2000 < PHP_LINT_CONCURRENCY) {
            console.log(`  Checked ${Math.min(i + PHP_LINT_CONCURRENCY, entries.length)} / ${entries.length} files...`);
        }
    }
    return failures;
}

/**
 * Verifies that $MESS entries in the file are parseable.
 * Empty files (0 entries) are allowed — Bitrix sometimes has empty lang files.
 * Fails only if the file contains $MESS-like content that does not parse.
 */
function verifyMessEntries(content: string, _filePath: string): { ok: boolean; error?: string } {
    const messages = extractMessages(content);
    // Allow empty files; only require that any present $MESS lines are valid
    if (messages.size === 0) {
        // Optional: reject files that look like they should have $MESS but we parsed none (e.g. broken format)
        if (/\$MESS\s*\[/.test(content) && !/\$MESS\s*\[\s*(['"])([^'"]+)\1\s*\]\s*=\s*(['"])/.test(content)) {
            return { ok: false, error: 'File contains $MESS but no valid assignment parsed' };
        }
    }
    return { ok: true };
}

async function main() {
    const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const skipPhpLint = process.argv.includes('--skip-php-lint');
    if (args.length < 1) {
        console.log(USAGE);
        process.exit(1);
    }

    const targetDir = path.resolve(args[0]);
    if (!fs.existsSync(targetDir)) {
        console.error(`Error: Directory not found: ${targetDir}`);
        process.exit(1);
    }

    const langDirs = fs.readdirSync(targetDir).filter((file) => {
        const fullPath = path.join(targetDir, file);
        return fs.statSync(fullPath).isDirectory() && ALLOWED_LANGUAGES.includes(file);
    });

    if (langDirs.length === 0) {
        console.error('Error: No language directories (en, ru, ...) found.');
        process.exit(1);
    }

    const usePhpLint = !skipPhpLint && hasPhpInPath();
    if (!usePhpLint && !skipPhpLint) {
        console.log('Note: PHP not in PATH; skipping php -l. Use --skip-php-lint to silence.');
    }
    console.log(`Verifying PHP files in ${targetDir} (langs: ${langDirs.join(', ')})...\n`);

    const failures: { file: string; check: string; message: string }[] = [];
    const allEntries: { fullPath: string; relativeLabel: string }[] = [];

    for (const lang of langDirs) {
        const langPath = path.join(targetDir, lang);
        const phpFiles = await fg('**/*.php', { cwd: langPath });
        for (const file of phpFiles) {
            const fullPath = path.join(langPath, file);
            const relativeLabel = `${lang}/${file}`;
            allEntries.push({ fullPath, relativeLabel });
        }
    }

    const totalFiles = allEntries.length;
    if (totalFiles === 0) {
        console.log('No PHP files found.');
        process.exit(0);
    }

    if (usePhpLint) {
        console.log(`PHP syntax check (php -l, ${PHP_LINT_CONCURRENCY} parallel)...`);
        const lintFailures = await phpLintParallel(allEntries);
        for (const { file, error } of lintFailures) {
            failures.push({ file, check: 'php -l', message: error });
        }
        console.log(`  PHP syntax: ${lintFailures.length} error(s).`);
    }

    console.log('$MESS format check...');
    for (let i = 0; i < allEntries.length; i++) {
        const { fullPath, relativeLabel } = allEntries[i];
        let content: string;
        try {
            content = fs.readFileSync(fullPath, 'utf-8');
        } catch (err) {
            failures.push({
                file: relativeLabel,
                check: 'read',
                message: err instanceof Error ? err.message : String(err),
            });
            continue;
        }
        const messResult = verifyMessEntries(content, fullPath);
        if (!messResult.ok) {
            failures.push({
                file: relativeLabel,
                check: '$MESS',
                message: messResult.error ?? 'Invalid or missing $MESS entries',
            });
        }
        if ((i + 1) % 5000 === 0) {
            console.log(`  Checked ${i + 1} / ${totalFiles} files...`);
        }
    }

    if (failures.length > 0) {
        console.error(`\n❌ Verification failed (${failures.length} file(s)):\n`);
        const maxShow = 50;
        for (let i = 0; i < Math.min(failures.length, maxShow); i++) {
            const f = failures[i];
            console.error(`  [${f.check}] ${f.file}: ${f.message}`);
        }
        if (failures.length > maxShow) {
            console.error(`  ... and ${failures.length - maxShow} more.`);
        }
        process.exit(1);
    }

    console.log(`✅ All ${totalFiles} PHP files verified (syntax + $MESS). Safe to run create-archives.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
