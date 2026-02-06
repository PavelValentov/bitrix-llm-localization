import OpenAI from 'openai';
import { config } from './src/config.js';

const client = new OpenAI({ apiKey: config.openai.apiKey });
console.log('client.beta keys:', Object.keys(client.beta));
