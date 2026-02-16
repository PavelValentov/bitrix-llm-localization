/**
 * Full PHP syntax check for all localization files (all languages).
 * - Runs php -l on every .php file (parallel).
 * - Checks that no $MESS value contains an unescaped double quote (any language).
 *
 * Usage: pnpm check-php-syntax <target-dir>
 * Example: pnpm check-php-syntax output/business50
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import fg from 'fast-glob';
import { ALLOWED_LANGUAGES } from '../src/utils.js';

const PHP_LINT_CONCURRENCY = 16;

const USAGE = `
Usage: pnpm check-php-syntax <target-dir>

Full syntax check for all PHP localization files (all languages):
  1. php -l on every .php file (requires PHP in PATH)
  2. Unescaped quote check: no " inside $MESS["KEY"] = "value"; without \\ (any lang)

Exits with code 1 on any failure.

Examples:
  pnpm check-php-syntax output/business50
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

function runPhpLintOne(fullPath: string): Promise<{ ok: true } | { ok: false; error: string }> {
    return new Promise((resolve) => {
        const proc = spawn('php', ['-l', fullPath], { stdio: ['ignore', 'pipe', 'pipe'] });
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

/** Match $MESS["key"] = " for key extraction. */
const MESS_START_REGEX = /\$MESS\s*\[\s*"([^"]+)"\s*\]\s*=\s*"/;

/**
 * Detect unescaped double quote in $MESS value (any language).
 * Scans after = " for " not preceded by \ (before ";).
 */
function findUnescapedQuoteInMessValues(content: string): { lineNum: number; key: string } | null {
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const startMatch = line.match(MESS_START_REGEX);
        if (!startMatch) continue;
        const key = startMatch[1];
        const valueStart = (startMatch.index ?? 0) + startMatch[0].length;
        let j = valueStart;
        while (j < line.length) {
            const ch = line[j];
            if (ch === '\\') {
                j += 2;
                continue;
            }
            if (ch === '"') {
                if (line[j + 1] === ';') {
                    break;
                }
                return { lineNum: i + 1, key };
            }
            j++;
        }
    }
    return null;
}

async function main() {
    const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
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
        console.error('Error: No language directories (en, ru, tr, ...) found.');
        process.exit(1);
    }

    const allEntries: { fullPath: string; relativeLabel: string }[] = [];
    for (const lang of langDirs) {
        const langPath = path.join(targetDir, lang);
        const phpFiles = await fg('**/*.php', { cwd: langPath });
        for (const file of phpFiles) {
            allEntries.push({
                fullPath: path.join(langPath, file),
                relativeLabel: `${lang}/${file}`,
            });
        }
    }

    const totalFiles = allEntries.length;
    if (totalFiles === 0) {
        console.log('No PHP files found.');
        process.exit(0);
    }

    console.log(`Full PHP syntax check: ${targetDir} (${totalFiles} files, langs: ${langDirs.join(', ')})\n`);

    const failures: { file: string; check: string; message: string }[] = [];

    if (hasPhpInPath()) {
        console.log(`1. php -l (${PHP_LINT_CONCURRENCY} parallel)...`);
        const lintFailures = await phpLintParallel(allEntries);
        for (const { file, error } of lintFailures) {
            failures.push({ file, check: 'php -l', message: error });
        }
        console.log(`   ${lintFailures.length} syntax error(s).\n`);
    } else {
        console.log('1. php -l skipped (PHP not in PATH).\n');
    }

    console.log('2. Unescaped double-quote check (all languages)...');
    let quoteErrors = 0;
    for (let i = 0; i < allEntries.length; i++) {
        const { fullPath, relativeLabel } = allEntries[i];
        let content: string;
        try {
            content = fs.readFileSync(fullPath, 'utf-8');
        } catch {
            continue;
        }
        const bad = findUnescapedQuoteInMessValues(content);
        if (bad) {
            failures.push({
                file: relativeLabel,
                check: 'unescaped "',
                message: `line ${bad.lineNum}, key ${bad.key}: double quote in value must be escaped as \\"`,
            });
            quoteErrors++;
        }
        if ((i + 1) % 5000 === 0) {
            console.log(`   Checked ${i + 1} / ${totalFiles}...`);
        }
    }
    console.log(`   ${quoteErrors} unescaped-quote error(s).\n`);

    if (failures.length > 0) {
        console.error(`❌ Failed (${failures.length}):\n`);
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

    console.log(`✅ All ${totalFiles} files passed (syntax + escaping).`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
