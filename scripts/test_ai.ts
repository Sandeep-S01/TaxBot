import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import dotenv from 'dotenv';
import { allowRawDebugOutput, logData, logProviderError, printDevOnlyWarning } from './dev_logging';

// Load .env
dotenv.config();

printDevOnlyWarning('test_ai');

console.log('--- Environment Keys Checked ---');
console.log('Gemini_API_KEY (case-sensitive):', process.env.Gemini_API_KEY ? 'Present' : 'Missing');
console.log('GEMINI_API_KEY (all uppercase):', process.env.GEMINI_API_KEY ? 'Present' : 'Missing');
console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Present' : 'Missing');
console.log('--------------------------------\n');

async function testClaude() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log('Claude: Skipping test, key is missing.');
    return;
  }
  
  console.log('Testing Claude API...');
  const anthropic = new Anthropic({ apiKey: key });
  try {
    const res = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Say hello in 1 word' }],
    });
    logData('Claude success output', res.content[0].text);
  } catch (err: any) {
    logProviderError('Claude failed:', 'anthropic', 'test_claude', err);
  }
}

async function testGemini(apiKey: string | undefined, label: string) {
  if (!apiKey) {
    console.log(`Gemini (${label}): Skipping test, key is missing.`);
    return;
  }
  
  const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];
  for (const model of models) {
    console.log(`Testing Gemini API (${label}) with model ${model}...`);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{ parts: [{ text: 'Say hello in 1 word' }] }],
    };
    
    try {
      const res = await axios.post(url, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
      if (allowRawDebugOutput()) {
        logData(`Gemini (${label}) with model ${model} success output`, res.data?.candidates?.[0]?.content?.parts?.[0]?.text);
      } else {
        console.log(`Gemini (${label}) with model ${model} Success: response received`);
      }
    } catch (err: any) {
      logProviderError(`Gemini (${label}) with model ${model} failed:`, 'gemini', `test_gemini_${model}`, err);
    }
  }
}

async function listModels(apiKey: string | undefined) {
  if (!apiKey) {
    console.log('Skipping listModels, key is missing.');
    return;
  }
  console.log('Listing available models...');
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  try {
    const res = await axios.get(url);
    const modelNames = res.data?.models?.map((m: any) => m.name) || [];
    console.log('Models found:', { count: modelNames.length, names: modelNames.slice(0, 20) });
  } catch (err: any) {
    logProviderError('List models failed:', 'gemini', 'list_models', err);
  }
}

async function run() {
  await testClaude();
  console.log('');
  await listModels(process.env.GEMINI_API_KEY);
  console.log('');
  await testGemini(process.env.GEMINI_API_KEY, 'GEMINI_API_KEY');
}

run();
