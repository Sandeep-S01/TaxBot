import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import dotenv from 'dotenv';

// Load .env
dotenv.config();

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
    console.log('Claude Success:', res.content[0].text);
  } catch (err: any) {
    console.error('Claude Failed with error:', err.message);
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
      console.log(`Gemini (${label}) with model ${model} Success:`, res.data?.candidates?.[0]?.content?.parts?.[0]?.text);
      // If we find a working one, we can note it!
    } catch (err: any) {
      const errMsg = err.response?.data?.error?.message || err.message;
      console.error(`Gemini (${label}) with model ${model} Failed with error:`, errMsg);
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
    console.log('Models found:', res.data?.models?.map((m: any) => m.name));
  } catch (err: any) {
    console.error('List models failed with error:', err.response?.data || err.message);
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
