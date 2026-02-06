import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export interface TranslationItem {
  key: string;
  fileName: string;
  context: Record<string, string>;
  targets: string[];
}

export class Translator {
  private client: OpenAI;
  private logFile: string;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: config.openai.baseURL,
    });
    
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

    const userPrompt = JSON.stringify(items, null, 2);
    
    // DEBUG LOGGING
    this.log('\n--- [LLM REQUEST] ---');
    this.log(new Date().toISOString());
    this.log('SYSTEM PROMPT:');
    this.log(config.systemPrompt);
    this.log('USER PROMPT (JSON):');
    this.log(userPrompt);
    this.log('---------------------\n');

    try {
      return await this.callLlm(userPrompt);
    } catch (error) {
      console.warn(`Translation failed, retrying once... Error: ${error}`);
      return await this.callLlm(userPrompt);
    }
  }

  private async callLlm(content: string): Promise<Record<string, Record<string, string>>> {
    const response = await this.client.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: config.systemPrompt
        },
        {
          role: 'user',
          content: content
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "translation_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    key: { type: "string" },
                    translations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          lang: { type: "string" },
                          text: { type: "string" }
                        },
                        required: ["lang", "text"],
                        additionalProperties: false
                      }
                    }
                  },
                  required: ["key", "translations"],
                  additionalProperties: false
                }
              }
            },
            required: ["items"],
            additionalProperties: false
          }
        }
      },
      temperature: 0.3,
    });

    const resultText = response.choices[0].message.content;
    
    // DEBUG LOGGING
    this.log('\n--- [LLM RESPONSE] ---');
    this.log(resultText || 'NO CONTENT');
    this.log('----------------------\n');

    if (!resultText) {
      throw new Error("Empty response from LLM");
    }

    // Since we use strict json_schema, the response SHOULD be valid JSON
    // But we wrap in try/catch just in case of refusal
    let parsed: any;
    try {
        parsed = JSON.parse(resultText);
    } catch (e) {
        // Fallback if structured output fails (rare with strict: true)
        throw new Error(`Failed to parse structured output: ${e}`);
    }

    // Convert structured output back to Map
    const result: Record<string, Record<string, string>> = {};
    if (parsed.items && Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
            const translations: Record<string, string> = {};
            if (item.translations && Array.isArray(item.translations)) {
                for (const t of item.translations) {
                    translations[t.lang] = t.text;
                }
            }
            result[item.key] = translations;
        }
    }

    return result;
  }
}
