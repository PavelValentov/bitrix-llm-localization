#!/usr/bin/env node
/**
 * Test script to verify configuration is loaded correctly
 * Run: node test-config.mjs
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load .env
dotenv.config();

console.log('=== Testing Configuration ===\n');

// Read .env file to show what's defined
try {
  const envContent = readFileSync('.env', 'utf-8');
  console.log('📄 .env file contents:');
  envContent.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .forEach(line => console.log('  ', line));
  console.log();
} catch (e) {
  console.log('⚠️  No .env file found');
  console.log();
}

// Show loaded environment variables
console.log('🔍 Environment Variables Loaded:');
console.log('  TRANSLATION_BACKEND:', process.env.TRANSLATION_BACKEND || '(not set)');
console.log('  TRANSLATION_BATCH_SIZE:', process.env.TRANSLATION_BATCH_SIZE || '(not set)');
console.log('  MAX_RESPONSE_TOKENS:', process.env.MAX_RESPONSE_TOKENS || '(not set)');
console.log('  ENABLE_MODEL_THINKING:', process.env.ENABLE_MODEL_THINKING || '(not set)');
console.log('  LOCAL_SERVER_URL:', process.env.LOCAL_SERVER_URL || '(not set)');
console.log('  LOCAL_SERVER_RELOAD_EVERY_BATCHES:', process.env.LOCAL_SERVER_RELOAD_EVERY_BATCHES || '(not set)');
console.log();

// Parse with Zod
import { z } from 'zod';

const envSchema = z.object({
  TRANSLATION_BACKEND: z.enum(['api', 'local', 'local-server']).default('api'),
  TRANSLATION_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  MAX_RESPONSE_TOKENS: z.coerce.number().int().positive().default(16384),
  ENABLE_MODEL_THINKING: z.string().optional().default('false').transform(val => val === 'true'),
  LOCAL_SERVER_URL: z.string().default('http://127.0.0.1:8765'),
  LOCAL_SERVER_RELOAD_EVERY_BATCHES: z.coerce.number().int().min(0).default(10),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.log('❌ Validation errors:');
  console.error(result.error.format());
  process.exit(1);
}

const env = result.data;

console.log('✅ Parsed Configuration:');
console.log('  Backend:', env.TRANSLATION_BACKEND);
console.log('  Batch Size:', env.TRANSLATION_BATCH_SIZE);
console.log('  Max Response Tokens:', env.MAX_RESPONSE_TOKENS);
console.log('  Enable Thinking:', env.ENABLE_MODEL_THINKING);
console.log('  Server URL:', env.LOCAL_SERVER_URL);
console.log('  Reload Every N Batches:', env.LOCAL_SERVER_RELOAD_EVERY_BATCHES);
console.log();

// Performance estimation
const stringsPerMinute = (60 / 4) * env.TRANSLATION_BATCH_SIZE; // 4 sec per batch estimate
console.log('📊 Performance Estimation:');
console.log(`  ~${stringsPerMinute} strings per minute`);
console.log(`  ~${Math.round(stringsPerMinute * 60)} strings per hour`);

if (env.TRANSLATION_BATCH_SIZE === 1) {
  console.log('  ⚠️  WARNING: Batch size is 1 (very slow!)');
  console.log('     Recommended: Set TRANSLATION_BATCH_SIZE=5 or higher');
}

if (env.ENABLE_MODEL_THINKING) {
  console.log('  ⚠️  WARNING: Thinking mode is ENABLED (2-3x slower!)');
  console.log('     Recommended: Set ENABLE_MODEL_THINKING=false');
}

console.log('\n=== Configuration Check Complete ===');
