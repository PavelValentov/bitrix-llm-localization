#!/usr/bin/env node
/**
 * Debug script to see what's being sent to MLX server
 */

import { config } from './src/config.js';

console.log('=== Configuration ===');
console.log('Backend:', config.translationBackend);
console.log('Batch Size:', config.batchSize);
console.log('Max Response Tokens:', config.maxResponseTokens);
console.log('Enable Thinking:', config.localServer.enableThinking);
console.log('Type of enableThinking:', typeof config.localServer.enableThinking);
console.log();

// Simulate request body
const body = {
  messages: [
    { role: 'system', content: config.systemPrompt },
    { role: 'user', content: 'Test' },
  ],
  max_tokens: config.maxResponseTokens,
  temperature: 0.3,
  enable_thinking: config.localServer.enableThinking,
};

console.log('=== Request Body ===');
console.log(JSON.stringify(body, null, 2));
console.log();

console.log('=== Verification ===');
console.log('enable_thinking value:', body.enable_thinking);
console.log('enable_thinking type:', typeof body.enable_thinking);
console.log('enable_thinking === false:', body.enable_thinking === false);
console.log('enable_thinking === true:', body.enable_thinking === true);
