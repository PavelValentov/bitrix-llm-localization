import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { jsonrepair } from 'jsonrepair';
import { config } from './config.js';
import { cleanTranslation, validateTranslation } from './translation-utils.js';
import { estimateItemTokens, estimateResponseTokens } from './token-estimator.js';

export interface TranslationItem {
  key: string;
  fileName: string;
  context: Record<string, string>;
  targets: string[];
}

const SYSTEM_PROMPT = `You are a professional translator for Bitrix24 CRM software. 
Your task is to translate the items in the User Message.
Each item in the JSON list has:
- KEY: The identifier.
- FILENAME: Context for where this string appears.
- CONTEXT: Existing translations (use these as reference).
- TARGETS: A list of language codes (e.g. "en", "de") that you MUST generate translations for.

Rules:
1. For each item, generate translations for ALL languages listed in 'targets'.
2. Preserve all technical placeholders (e.g., #NAME#, #ID#, #LINK_START#, {0}, %s).
3. Keep the JSON structure exactly as provided.
4. Output ONLY valid JSON object: { "items": [{ "key": "...", "translations": [{ "lang": "...", "text": "..." }] }] }.
5. If a string is technically untranslatable (like a pure number), return it as is.
6. Use ALL available context translations AND the filename to infer the best meaning.`;

export class Translator {
  private client: OpenAI | null = null;
  private logFile: string;

  constructor() {
    if (config.translationBackend === 'api') {
      this.client = new OpenAI({
        apiKey: config.openai.apiKey,
        baseURL: config.openai.baseURL,
      });
    }

    const logDir = 'logs';
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    this.logFile = path.join(logDir, 'translation.log');
  }

  private log(message: string) {
    fs.appendFileSync(this.logFile, message + '\n');
  }

  async translateFileBatch(items: TranslationItem[]): Promise<Record<string, Record<string, string>>> {
    if (items.length === 0) {
      return {};
    }

    // Check for huge keys based on token estimation
    // If a single item would generate >50% of max_response_tokens, split by language
    const hasHugeKeys = items.some(item => {
      const itemTokens = estimateItemTokens(item);
      const responseTokens = estimateResponseTokens([item]);
      return responseTokens > config.maxResponseTokens * 0.5;
    });

    if (hasHugeKeys && items[0].targets.length > 1) {
      // Process huge keys one language at a time to avoid timeout/truncation
      const sampleItem = items.find(item => estimateResponseTokens([item]) > config.maxResponseTokens * 0.5);
      if (sampleItem) {
        const estimatedTokens = estimateResponseTokens([sampleItem]);
        console.warn(`⚠️  Detected huge key (~${estimatedTokens} response tokens), processing languages one-by-one...`);
      }
      return this.translateHugeKeysByLanguage(items);
    }

    const userPrompt = JSON.stringify(items, null, 2);

    this.log('\n--- [LLM REQUEST] ---');
    this.log(new Date().toISOString());
    this.log(`BACKEND: ${config.translationBackend}`);
    this.log('SYSTEM PROMPT:');
    this.log(SYSTEM_PROMPT);
    this.log('USER PROMPT (JSON):');
    this.log(userPrompt);
    this.log('---------------------\n');

    try {
      const raw = await this.callLlm(userPrompt);
      return this.postProcess(raw);
    } catch (error) {
      console.warn(`Translation failed, retrying once... Error: ${error}`);
      const raw = await this.callLlm(userPrompt);
      return this.postProcess(raw);
    }
  }

  private async translateHugeKeysByLanguage(items: TranslationItem[]): Promise<Record<string, Record<string, string>>> {
    const result: Record<string, Record<string, string>> = {};

    for (const item of items) {
      result[item.key] = {};

      // Process each target language separately
      for (const lang of item.targets) {
        const singleLangItem: TranslationItem = {
          ...item,
          targets: [lang]
        };

        this.log(`\n--- [HUGE KEY - SINGLE LANG: ${lang}] ---`);
        const userPrompt = JSON.stringify([singleLangItem], null, 2);
        this.log(new Date().toISOString());
        this.log(`Processing ${item.key} → ${lang}`);
        this.log('---------------------\n');

        try {
          const raw = await this.callLlm(userPrompt);
          const processed = this.postProcess(raw);
          if (processed[item.key] && processed[item.key][lang]) {
            result[item.key][lang] = processed[item.key][lang];
            console.log(`   ✓ ${lang}: ${processed[item.key][lang].length} chars`);
          }
        } catch (error) {
          console.warn(`   ✗ ${lang}: Failed (${error})`);
          this.log(`[ERROR] ${item.key}/${lang}: ${error}`);
        }
      }
    }

    return result;
  }

  private postProcess(raw: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    for (const [key, translations] of Object.entries(raw)) {
      result[key] = {};
      for (const [lang, text] of Object.entries(translations)) {
        const cleaned = cleanTranslation(text) ?? text;
        if (!validateTranslation(cleaned, lang)) {
          this.log(`[VALIDATE] Rejected ${key}/${lang}: ${cleaned}`);
        }
        result[key][lang] = cleaned;
      }
    }
    return result;
  }

  private batchCount = 0;

  private async callLlm(content: string): Promise<Record<string, Record<string, string>>> {
    if (config.translationBackend === 'local-server') {
      return this.callLocalServer(content);
    }
    if (config.translationBackend === 'local') {
      return this.callLocal(content);
    }
    return this.callApi(content);
  }

  private async callApi(content: string): Promise<Record<string, Record<string, string>>> {
    if (!this.client) throw new Error('OpenAI client not initialized');
    const response = await this.client.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'translation_response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    translations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          lang: { type: 'string' },
                          text: { type: 'string' },
                        },
                        required: ['lang', 'text'],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ['key', 'translations'],
                  additionalProperties: false,
                },
              },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
      temperature: 0.3,
    });

    return this.parseResponse(response.choices[0]?.message?.content);
  }

  private async callLocalServer(content: string): Promise<Record<string, Record<string, string>>> {
    const url = config.localServer.url.replace(/\/$/, '') + '/translate';

    // Reload every N batches (client-side trigger)
    const reloadEvery = config.localServer.reloadEveryBatches;
    if (reloadEvery > 0) {
      this.batchCount++;
      if (this.batchCount > 1 && this.batchCount % reloadEvery === 1) {
        const reloadUrl = config.localServer.url.replace(/\/$/, '') + '/reload';
        try {
          const reloadRes = await fetch(reloadUrl, { method: 'POST' });
          if (reloadRes.ok) {
            const msg = `🔄 Model reloaded after ${this.batchCount - 1} batches`;
            this.log(`[RELOAD] ${msg}`);
            console.log(msg);
            // Give server time to finish reload before next translate request (avoids "fetch failed")
            const reloadWaitMs = 8000;
            await new Promise((r) => setTimeout(r, reloadWaitMs));
            console.log(`   ⏳ Waited ${reloadWaitMs / 1000}s for server to stabilize`);
          }
        } catch (e) {
          this.log(`[RELOAD] Failed: ${e}`);
          console.warn(`[RELOAD] Failed: ${e}`);
        }
      }
    }

    const body = {
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: config.maxResponseTokens,
      temperature: 0.2,
      enable_thinking: config.localServer.enableThinking,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Local MLX server failed: ${res.status} ${res.statusText}\n${errText}`);
    }

    const json = (await res.json()) as { content?: string; error?: string };
    if (json.error) throw new Error(json.error);

    this.log('\n--- [LLM RESPONSE] ---');
    this.log(json.content ?? 'NO CONTENT');
    this.log('----------------------\n');

    return this.parseResponse(json.content);
  }

  private async callLocal(content: string): Promise<Record<string, Record<string, string>>> {
    const url = config.local.url.replace(/\/$/, '') + '/chat/completions';
    const body = {
      model: config.local.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      temperature: 0.3,
      stream: false,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Local LLM request failed: ${res.status} ${res.statusText}\n${errText}`);
    }

    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const resultText = json.choices?.[0]?.message?.content;

    this.log('\n--- [LLM RESPONSE] ---');
    this.log(resultText ?? 'NO CONTENT');
    this.log('----------------------\n');

    return this.parseResponse(resultText);
  }

  /**
   * Fix common model output issues: <think> wrappers, stray ,.0,, trailing junk.
   */
  private sanitizeJsonOutput(text: string): string {
    let s = text.trim();
    
    // Remove ALL <think>...</think> blocks (including empty ones)
    // This handles both filled and empty think tags from Qwen3
    s = s.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    // Also remove orphaned <think> or </think> tags
    s = s.replace(/<\/?think>/g, '').trim();
    
    // Remove orphaned ,.0, or ,.0] or ,.0} (model sometimes emits these)
    s = s.replace(/,(\s*\.0\s*)([,}\]])/g, '$2');
    
    // Remove trailing junk after last } (model may continue generating)
    const lastBrace = s.lastIndexOf('}');
    if (lastBrace >= 0) {
      const after = s.slice(lastBrace + 1).trim();
      if (after && !/^[\s,}\]]*$/.test(after)) {
        s = s.slice(0, lastBrace + 1);
      }
    }
    
    return s;
  }

  private parseResponse(resultText: string | null | undefined): Record<string, Record<string, string>> {
    if (!resultText?.trim()) {
      throw new Error('Empty response from LLM');
    }

    const sanitized = this.sanitizeJsonOutput(resultText);

    let parsed: { items?: Array<{ key?: string; translations?: Array<{ lang?: string; text?: string }> }> };
    try {
      parsed = JSON.parse(sanitized);
    } catch {
      try {
        parsed = JSON.parse(jsonrepair(sanitized));
      } catch (e) {
        throw new Error(`Failed to parse LLM output as JSON: ${e}`);
      }
    }

    const result: Record<string, Record<string, string>> = {};
    if (parsed?.items && Array.isArray(parsed.items)) {
      for (const item of parsed.items) {
        const key = item.key;
        if (!key) continue;
        const translations: Record<string, string> = {};
        if (item.translations && Array.isArray(item.translations)) {
          for (const t of item.translations) {
            if (t.lang && t.text != null) {
              translations[t.lang] = String(t.text);
            }
          }
        }
        result[key] = translations;
      }
    }

    return result;
  }
}
