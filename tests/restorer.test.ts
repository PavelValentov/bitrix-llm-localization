import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restore } from '../src/restorer.js';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('fs');

describe('restorer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should restore files for all active languages', async () => {
        const targetDir = '/app/business100';
        const data = {
            'module/lang/{lang}/file.php': {
                'KEY': {
                    'en': 'Hello',
                    'ru': 'Привет'
                }
            }
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        await restore(data, targetDir);

        // Should detect active languages en, ru
        // Should create file for en
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join(targetDir, 'en', 'module/lang/en/file.php'),
            expect.stringContaining(`$MESS["KEY"] = "Hello";`)
        );

        // Should create file for ru
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join(targetDir, 'ru', 'module/lang/ru/file.php'),
            expect.stringContaining(`$MESS["KEY"] = "Привет";`)
        );
    });

    it('should create empty files for missing translations (symmetry)', async () => {
        const targetDir = '/app/business100';
        const data = {
            'module/lang/{lang}/file.php': {
                'KEY': {
                    'en': 'Hello',
                    'ru': null // Missing
                }
            }
        };

        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        await restore(data, targetDir);

        // Should create file for ru, but empty content
        expect(fs.writeFileSync).toHaveBeenCalledWith(
            path.join(targetDir, 'ru', 'module/lang/ru/file.php'),
            expect.stringContaining(`<?php\n?>`)
        );
        
        // Ensure KEY is NOT written for RU
        expect(fs.writeFileSync).not.toHaveBeenCalledWith(
            path.join(targetDir, 'ru', 'module/lang/ru/file.php'),
            expect.stringContaining(`$MESS["KEY"]`)
        );
    });

    it('should use <?php (not short tag <? ) for PHP 8 compatibility', async () => {
        const targetDir = '/app/out';
        const data = { 'lang/{lang}/file.php': { 'K': { 'tr': 'Değer' } } };
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        await restore(data, targetDir);

        const written = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(written.startsWith('<?php\n')).toBe(true);
        expect(written).not.toMatch(/^<\?\n/);
    });

    it('should escape double quotes in values to avoid ParseError', async () => {
        const targetDir = '/app/out';
        const data = {
            'module/lang/{lang}/filter_tools.php': {
                FILTER_ERROR_LOGIC: {
                    tr: 'Use "VEYA" or "VE" in the filter.',
                },
            },
        };
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        await restore(data, targetDir);

        const written = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(written).toContain('\\"VEYA\\"');
        expect(written).toContain('\\"VE\\"');
        // Value must not contain unescaped " that would close the PHP string early
        expect(written).toContain('$MESS["FILTER_ERROR_LOGIC"] = "Use \\"VEYA\\" or \\"VE\\" in the filter.";');
    });

    it('should escape $ in values so PHP does not interpolate variables', async () => {
        const targetDir = '/app/out';
        const data = {
            'main/lang/{lang}/step1.php': {
                KEY: {
                    en: "Use \\$_SERVER['DOCUMENT_ROOT'] in path.",
                },
            },
        };
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);
        vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
        vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

        await restore(data, targetDir);

        const written = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(written).toContain('\\$_SERVER');
    });
});
