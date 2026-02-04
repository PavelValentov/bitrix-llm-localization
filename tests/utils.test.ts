import { describe, it, expect, vi } from 'vitest';
import { extractMessages } from '../src/utils.js';

describe('extractMessages', () => {
    it('should extract simple messages', () => {
        const content = `<? $MESS['KEY'] = 'Value'; ?>`;
        const result = extractMessages(content);
        expect(result.get('KEY')).toBe('Value');
    });

    it('should handle double quotes', () => {
        const content = `<? $MESS["KEY"] = "Value"; ?>`;
        const result = extractMessages(content);
        expect(result.get('KEY')).toBe('Value');
    });

    it('should handle empty values', () => {
        const content = `<? $MESS['KEY'] = ''; ?>`;
        const result = extractMessages(content);
        expect(result.get('KEY')).toBe('');
    });

    it('should handle newlines in values', () => {
        const content = `<? $MESS['KEY'] = 'Line 1\nLine 2'; ?>`;
        const result = extractMessages(content);
        expect(result.get('KEY')).toBe('Line 1\nLine 2');
    });

    it('should handle escaped quotes', () => {
        const content = `<? $MESS['KEY'] = 'It\\'s me'; ?>`;
        const result = extractMessages(content);
        expect(result.get('KEY')).toBe("It's me");
    });
    
    it('should handle escaped backslashes', () => {
        const content = `<? $MESS['KEY'] = 'Back\\\\Slash'; ?>`; // 'Back\\Slash' in code -> "Back\\Slash" in memory?
        // PHP: 'Back\\Slash' -> Back\Slash
        // JS Regex: \\\\ matches \\.
        const result = extractMessages(content);
        expect(result.get('KEY')).toBe('Back\\Slash');
    });
});
