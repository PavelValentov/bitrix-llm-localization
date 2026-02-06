import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_BASE_URL: z.string().optional(),
  TRANSLATION_BATCH_SIZE: z.coerce.number().int().positive().default(1),
});

const processEnv = envSchema.safeParse(process.env);

if (!processEnv.success) {
  console.error("❌ Invalid environment variables:", processEnv.error.format());
  process.exit(1);
}

export const config = {
  openai: {
    apiKey: processEnv.data.OPENAI_API_KEY,
    model: processEnv.data.OPENAI_MODEL,
    baseURL: processEnv.data.OPENAI_BASE_URL,
  },
  batchSize: processEnv.data.TRANSLATION_BATCH_SIZE,
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
