import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { aggregate } from '../src/aggregator.js';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

// Mock dependencies
vi.mock('fs');
vi.mock('fast-glob');

describe('aggregator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should aggregate translations from multiple languages', async () => {
        // Setup mocks
        const rootDir = '/app/business50';
        
        // Mock fs.existsSync
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        
        // Mock fs.readdirSync to return languages
        vi.spyOn(fs, 'readdirSync').mockReturnValue(['en', 'ru'] as any);
        
        // Mock fs.statSync
        vi.spyOn(fs, 'statSync').mockReturnValue({
            isDirectory: () => true
        } as any);

        // Mock fast-glob
        const enFile = 'module/lang/en/file.php';
        const ruFile = 'module/lang/ru/file.php';
        
        vi.mocked(fg).mockImplementation((pattern, options) => {
            if (options?.cwd === '/app/business50/en') return Promise.resolve([enFile]);
            if (options?.cwd === '/app/business50/ru') return Promise.resolve([ruFile]);
            return Promise.resolve([]);
        });

        // Mock fs.readFileSync
        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (typeof filePath !== 'string') return '';
            if (filePath.endsWith(enFile)) return `<? $MESS['KEY'] = 'Hello'; ?>`;
            if (filePath.endsWith(ruFile)) return `<? $MESS['KEY'] = 'Привет'; ?>`;
            return '';
        });

        const result = await aggregate(rootDir);

        // Normalized path should have {lang}
        const expectedPath = 'module/lang/{lang}/file.php';
        
        expect(result).toHaveProperty(expectedPath);
        expect(result[expectedPath]).toHaveProperty('KEY');
        expect(result[expectedPath]['KEY']).toEqual({
            en: 'Hello',
            ru: 'Привет'
        });
    });

    it('should fill missing translations with null', async () => {
        const rootDir = '/app/business50';
        vi.spyOn(fs, 'existsSync').mockReturnValue(true);
        vi.spyOn(fs, 'readdirSync').mockReturnValue(['en', 'ru'] as any);
        vi.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);

        // Only EN file exists
        const enFile = 'module/lang/en/only_en.php';
        
        vi.mocked(fg).mockImplementation((pattern, options) => {
            if (options?.cwd === '/app/business50/en') return Promise.resolve([enFile]);
            if (options?.cwd === '/app/business50/ru') return Promise.resolve([]);
            return Promise.resolve([]);
        });

        vi.spyOn(fs, 'readFileSync').mockImplementation((filePath) => {
            if (typeof filePath === 'string' && filePath.endsWith(enFile)) {
                return `<? $MESS['KEY'] = 'Hello'; ?>`;
            }
            return '';
        });

        const result = await aggregate(rootDir);
        const expectedPath = 'module/lang/{lang}/only_en.php';

        expect(result[expectedPath]['KEY']).toEqual({
            en: 'Hello',
            ru: null
        });
    });
});
