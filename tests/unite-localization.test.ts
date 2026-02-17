import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import * as path from 'path';

// Helpers mirror §4.6 (same logic as in scripts/unite-localization.ts)
function isEmptyOrMissing(val: string | null | undefined): boolean {
  return val == null || val === '';
}
function isWhitespaceOnly(val: string): boolean {
  return val.length > 0 && val.trim().length === 0;
}
function shouldReplaceWithNew(
  current: string | null | undefined,
  newVal: string | null | undefined
): boolean {
  if (isEmptyOrMissing(newVal)) return false;
  if (isEmptyOrMissing(current)) return true;
  if (isWhitespaceOnly(current) && newVal!.trim().length > 0) return true;
  return false;
}

describe('unite-localization §4.6 empty/whitespace', () => {
  it('isEmptyOrMissing: null, undefined, "" are missing', () => {
    expect(isEmptyOrMissing(null)).toBe(true);
    expect(isEmptyOrMissing(undefined)).toBe(true);
    expect(isEmptyOrMissing('')).toBe(true);
    expect(isEmptyOrMissing(' ')).toBe(false);
    expect(isEmptyOrMissing('a')).toBe(false);
  });

  it('isWhitespaceOnly: only spaces count as whitespace-only', () => {
    expect(isWhitespaceOnly('')).toBe(false);
    expect(isWhitespaceOnly('   ')).toBe(true);
    expect(isWhitespaceOnly(' \t\n ')).toBe(true);
    expect(isWhitespaceOnly(' a ')).toBe(false);
  });

  it('shouldReplaceWithNew: empty/missing → use new', () => {
    expect(shouldReplaceWithNew(null, 'x')).toBe(true);
    expect(shouldReplaceWithNew('', 'x')).toBe(true);
    expect(shouldReplaceWithNew(undefined, 'Real text')).toBe(true);
  });

  it('shouldReplaceWithNew: whitespace-only current + non-whitespace new → replace', () => {
    expect(shouldReplaceWithNew('   ', 'Real text')).toBe(true);
    expect(shouldReplaceWithNew('\t', 'x')).toBe(true);
  });

  it('shouldReplaceWithNew: non-whitespace current → do not replace (same key from another file)', () => {
    expect(shouldReplaceWithNew('Real text', 'Other')).toBe(false);
    expect(shouldReplaceWithNew('Real text', '   ')).toBe(false);
  });

  it('shouldReplaceWithNew: empty new never replaces', () => {
    expect(shouldReplaceWithNew('x', '')).toBe(false);
    expect(shouldReplaceWithNew('x', null)).toBe(false);
  });
});

describe('unite-localization CLI', () => {
  const scriptPath = path.join(process.cwd(), 'scripts/unite-localization.ts');
  const run = (args: string[]) =>
    spawnSync('npx', ['tsx', scriptPath, ...args], {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });

  it('prints usage and exits non-zero when no args', () => {
    const out = run([]);
    expect(out.stdout + out.stderr).toMatch(/Usage:/);
    expect(out.status).not.toBe(0);
  });

  it('prints usage and exits non-zero when one arg', () => {
    const out = run(['input/business50']);
    expect(out.stdout + out.stderr).toMatch(/Usage:/);
    expect(out.status).not.toBe(0);
  });

  it('accepts --fill-gaps flag (parsed, not shown as usage)', () => {
    const out = run(['nonexistent-dir', 'out-dir', '--fill-gaps']);
    expect(out.stdout + out.stderr).not.toMatch(/Usage:\s*pnpm unite-localization/);
    expect(out.stdout + out.stderr).toMatch(/Input directory not found|Error:/);
    expect(out.status).not.toBe(0);
  });
});
