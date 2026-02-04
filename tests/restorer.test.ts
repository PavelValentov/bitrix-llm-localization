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
            expect.stringContaining(`<?\n?>`)
        );
        
        // Ensure KEY is NOT written for RU
        expect(fs.writeFileSync).not.toHaveBeenCalledWith(
            path.join(targetDir, 'ru', 'module/lang/ru/file.php'),
            expect.stringContaining(`$MESS["KEY"]`)
        );
    });
});
