/**
 * E2E test: loads real MLX model, starts mlx-server, runs translation.
 * Skipped if model or venv not found.
 * Run: pnpm test:e2e
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const E2E_PORT = 18765;
const MODEL_PATH =
  process.env.MLX_MODEL_PATH ||
  path.join(process.env.HOME || '', '.lmstudio/models/lmstudio-community/Qwen3-8B-MLX-8bit');
const VENV_PYTHON = path.join(PROJECT_ROOT, 'mlx-server/venv/bin/python');
const MLX_SERVER = path.join(PROJECT_ROOT, 'mlx-server/mlx_server.py');
const E2E_INPUT = path.join(PROJECT_ROOT, 'tests/e2e-input.json');
const E2E_OUTPUT_DIR = path.join(PROJECT_ROOT, 'tests/e2e-output');

let serverProcess: ChildProcess | null = null;

async function waitForServer(url: string, maxWaitMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

const modelExists = fs.existsSync(MODEL_PATH);
const venvExists = fs.existsSync(VENV_PYTHON);

describe(
  'E2E: MLX translation with real model',
  { timeout: 180_000 },
  () => {
    beforeAll(async () => {
      if (!modelExists || !venvExists) return;

      // Create test input with realistic Bitrix24 strings
      const inputData = {
        'xdimport/install/components/bitrix/xdi.livefeed.point/lang/{lang}/component.php': {
          XLP_IM_ADD: {
            en: 'A new message "#title#" was posted from an external source to #group_name#.',
            ru: 'В группе #group_name# добавлено сообщение из внешнего источника "#title#".',
            ua: 'У групі #group_name# додано повідомлення із зовнішнього джерела "#title#".',
            tr: null,
          },
        },
        'xdimport/lang/{lang}/admin/lf_scheme_edit.php': {
          LFP_SCHEME_EDIT_ACTIVE: {
            en: 'Active',
            ru: 'Активность',
            ua: 'Активність',
            tr: null,
          },
          LFP_SCHEME_EDIT_ADD_TITLE: {
            en: 'New Activity Stream publishing connection',
            ru: 'Новое подключение для публикации в Живой ленте',
            ua: 'Нове підключення для публікації в Живий стрічці',
            tr: null,
          },
          LFP_SCHEME_EDIT_DAYS: {
            en: 'Publish on:',
            ru: 'Дни публикации:',
            ua: 'Дні публікації:',
            tr: null,
          },
          LFP_SCHEME_EDIT_DOM: {
            en: 'days of month (example: 1,10-20,25):',
            ru: 'дни месяца (например 1,10-20,25):',
            ua: 'Дні місяця (наприклад 1,10-20,25):',
            tr: null,
          },
          LFP_SCHEME_EDIT_DESTINATION: {
            en: 'Activity Stream event parameters',
            ru: 'Параметры события Живой ленты',
            ua: 'Параметри події Живої стрічки',
            tr: null,
          },
        },
      };
      await fs.promises.mkdir(path.dirname(E2E_INPUT), { recursive: true });
      await fs.promises.writeFile(E2E_INPUT, JSON.stringify(inputData, null, 2));

      // Start mlx-server
      serverProcess = spawn(VENV_PYTHON, [MLX_SERVER, '--model', MODEL_PATH, '--port', String(E2E_PORT)], {
        cwd: PROJECT_ROOT,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      serverProcess.stdout?.on('data', (d) => process.stdout.write(d.toString()));
      serverProcess.stderr?.on('data', (d) => process.stderr.write(d.toString()));

      const ready = await waitForServer(`http://127.0.0.1:${E2E_PORT}`, 120_000);
      if (!ready) {
        throw new Error('MLX server did not become ready within 120s');
      }
    });

    afterAll(async () => {
      if (serverProcess?.pid) {
        serverProcess.kill('SIGTERM');
        await new Promise((r) => setTimeout(r, 2000));
      }
      // Cleanup
      try {
        await fs.promises.unlink(E2E_INPUT);
      } catch {}
      try {
        const outFile = path.join(E2E_OUTPUT_DIR, path.relative(PROJECT_ROOT, E2E_INPUT));
        await fs.promises.unlink(outFile);
      } catch {}
    });

    it(
      'should translate via real MLX server and return valid Turkish translation',
      { timeout: 60_000 },
      async () => {
        if (!modelExists) {
          console.warn(`Skipping: model not found at ${MODEL_PATH}`);
          return;
        }
        if (!venvExists) {
          console.warn(`Skipping: venv not found at ${VENV_PYTHON}. Run ./run_translation.sh once to create it.`);
          return;
        }

        process.env.TRANSLATION_BACKEND = 'local-server';
        process.env.LOCAL_SERVER_URL = `http://127.0.0.1:${E2E_PORT}`;
        process.env.ENABLE_MODEL_THINKING = 'false';

        const { runTranslation } = await import('../scripts/translate.js');

        const inputRelative = path.relative(PROJECT_ROOT, E2E_INPUT);
        await runTranslation(inputRelative, ['tr'], E2E_OUTPUT_DIR);

        const outputFile = path.join(E2E_OUTPUT_DIR, inputRelative);
        const raw = await fs.promises.readFile(outputFile, 'utf-8');
        const data = JSON.parse(raw);

        // Verify all keys got translated
        const file1 = data['xdimport/install/components/bitrix/xdi.livefeed.point/lang/{lang}/component.php'];
        const file2 = data['xdimport/lang/{lang}/admin/lf_scheme_edit.php'];

        expect(file1).toBeDefined();
        expect(file2).toBeDefined();

        // Check XLP_IM_ADD (has placeholders)
        const tr1 = file1.XLP_IM_ADD?.tr;
        expect(tr1).toBeDefined();
        expect(typeof tr1).toBe('string');
        expect(tr1.length).toBeGreaterThan(0);
        expect(tr1).toContain('#title#');
        expect(tr1).toContain('#group_name#');
        // Should NOT contain <think> tags when thinking is disabled
        expect(tr1).not.toContain('<think>');
        expect(tr1).not.toContain('</think>');

        // Check short strings
        const tr2 = file2.LFP_SCHEME_EDIT_ACTIVE?.tr;
        expect(tr2).toBeDefined();
        expect(typeof tr2).toBe('string');
        expect(tr2.length).toBeGreaterThan(0);

        // Check medium complexity
        const tr3 = file2.LFP_SCHEME_EDIT_ADD_TITLE?.tr;
        expect(tr3).toBeDefined();
        expect(typeof tr3).toBe('string');
        expect(tr3.length).toBeGreaterThan(5);

        // Check punctuation preserved
        const tr4 = file2.LFP_SCHEME_EDIT_DAYS?.tr;
        expect(tr4).toBeDefined();
        expect(typeof tr4).toBe('string');

        // Check numbers and special chars preserved
        const tr5 = file2.LFP_SCHEME_EDIT_DOM?.tr;
        expect(tr5).toBeDefined();
        expect(typeof tr5).toBe('string');
        expect(tr5).toMatch(/1,10-20,25/);

        console.log('\n✅ Sample translations (thinking mode: disabled):');
        console.log(`  XLP_IM_ADD: ${tr1?.slice(0, 60)}...`);
        console.log(`  ACTIVE: ${tr2}`);
        console.log(`  ADD_TITLE: ${tr3?.slice(0, 50)}...`);
        console.log(`  DAYS: ${tr4}`);
        console.log(`  DOM: ${tr5}`);
      }
    );
  }
);
