import dotenv from 'dotenv';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// Load environment variables from .env file
const dotenvResult = dotenv.config();

// Count loaded variables
let loadedVarsCount = 0;
if (dotenvResult.parsed) {
  loadedVarsCount = Object.keys(dotenvResult.parsed).length;
  console.log(`✅ Loaded ${loadedVarsCount} variables from .env file`);
} else {
  // Try to read .env file directly to count variables
  try {
    const envPath = path.join(process.cwd(), '.env');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envLines = envContent.split('\n')
      .filter(line => line.trim() && !line.startsWith('#') && line.includes('='));
    loadedVarsCount = envLines.length;
    console.log(`✅ Found ${loadedVarsCount} variables in .env file (already loaded)`);
  } catch {
    console.log('⚠️  No .env file found (using environment variables)');
  }
}

const envSchema = z.object({
  TRANSLATION_BACKEND: z.enum(['api', 'local', 'local-server']).default('api'),
  // API backend (OpenAI-compatible)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_BASE_URL: z.string().optional(),
  // Local backend (LM Studio)
  LOCAL_LLM_URL: z.string().default('http://localhost:1234/v1'),
  LOCAL_LLM_MODEL: z.string().default('gpt-oss-20b-MLX-8bit'),
  // Local MLX server (our Python mlx-server)
  LOCAL_SERVER_URL: z.string().default('http://127.0.0.1:8765'),
  LOCAL_SERVER_RELOAD_EVERY_BATCHES: z.coerce.number().int().min(0).default(10),
  ENABLE_MODEL_THINKING: z.string().optional().default('false').transform(val => val === 'true'),
  MAX_RESPONSE_TOKENS: z.coerce.number().int().positive().default(16384),
});

const processEnv = envSchema.safeParse(process.env);

if (!processEnv.success) {
  console.error("❌ Invalid environment variables:", processEnv.error.format());
  process.exit(1);
}

const env = processEnv.data;

// Validate API key only when using API backend
if (env.TRANSLATION_BACKEND === 'api' && !env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is required when TRANSLATION_BACKEND=api");
  process.exit(1);
}

export const config = {
  translationBackend: env.TRANSLATION_BACKEND,
  openai: {
    apiKey: env.OPENAI_API_KEY ?? '',
    model: env.OPENAI_MODEL,
    baseURL: env.OPENAI_BASE_URL,
  },
  local: {
    url: env.LOCAL_LLM_URL,
    model: env.LOCAL_LLM_MODEL,
  },
  localServer: {
    url: env.LOCAL_SERVER_URL,
    reloadEveryBatches: env.LOCAL_SERVER_RELOAD_EVERY_BATCHES,
    enableThinking: env.ENABLE_MODEL_THINKING,
  },
  maxResponseTokens: env.MAX_RESPONSE_TOKENS,
  // Dynamic batch sizing: use half of max_tokens for prompt
  maxPromptTokens: Math.floor(env.MAX_RESPONSE_TOKENS / 2),
  systemPrompt: `You are a professional translator for Bitrix24 CRM software. 
Your task is to translate the items in the User Message.
Each item in the JSON list has:
- KEY: The identifier.
- FILENAME: Context for where this string appears.
- CONTEXT: Existing translations (use these as reference).
- TARGETS: A list of language codes (e.g. "en", "de") that you MUST generate translations for.

Rules:
1. For each item, generate translations for ALL languages listed in 'targets'.
2. Preserve all technical placeholders (e.g., #NAME#, #ID#, #LINK_START#).
3. Keep the JSON structure exactly as provided.
4. Output ONLY valid JSON object: { "items": [{ "key": "...", "translations": [{ "lang": "...", "text": "..." }] }] }.
5. If a string is technically untranslatable (like a pure number), return it as is.
6. Use ALL available context translations AND the filename to infer the best meaning.`,
};
