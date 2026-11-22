import { neon } from '@neondatabase/serverless';
import { GoogleGenAI } from '@google/genai';

const dbUrl = process.env.DATABASE_URL?.trim();
const geminiKey = process.env.GEMINI_API_KEY?.trim();

console.log('=== Infrastructure Smoke Test ===\n');

// 1. Check env vars
if (!dbUrl || !geminiKey) {
  console.error('❌ Missing keys in .env.local:');
  if (!dbUrl) console.error('   - DATABASE_URL is empty');
  if (!geminiKey) console.error('   - GEMINI_API_KEY is empty');
  process.exit(1);
}

// 2. Test Neon PostgreSQL
console.log('1) Testing Neon PostgreSQL connection...');
try {
  const sql = neon(dbUrl);
  const rows = await sql`SELECT NOW() AS server_time, current_database() AS db_name, version() AS pg_version`;
  console.log('✅ Neon connected successfully!');
  console.log(`   Database : ${rows[0].db_name}`);
  console.log(`   Time     : ${rows[0].server_time}`);
  console.log(`   Version  : ${rows[0].pg_version.split(',')[0]}\n`);
} catch (err) {
  console.error('❌ Neon connection failed:', err.message);
  process.exit(1);
}

// 3. Test Google Gemini API (Free Tier)
console.log('2) Testing Google Gemini API (German -> Persian flashcard JSON)...');
try {
  const ai = new GoogleGenAI({ apiKey: geminiKey });

  // Try preferred fast/free-tier models in order (automatic fallback if one has temporary 503 load)
  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
  ];
  let response = null;
  let usedModel = null;
  let lastErr = null;

  const prompt = `Return ONLY valid JSON (no markdown fences) for the German word "Entscheidung" as a flashcard for a Persian speaker:
{
  "word": "Entscheidung",
  "article": "die",
  "plural": "Entscheidungen",
  "persianMeaning": "...",
  "englishMeaning": "...",
  "exampleDe": "...",
  "exampleFa": "..."
}`;

  for (const model of candidateModels) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json' },
      });
      usedModel = model;
      break;
    } catch (e) {
      console.log(`   ⚠️ ${model} failed: ${e.message}`);
      lastErr = e;
    }
  }

  if (!response) {
    console.log('\n   Fetching available models for this API key...');
    const pager = await ai.models.list();
    for await (const m of pager) {
      if (m.name?.includes('gemini')) {
        console.log(`   - ${m.name} (${m.displayName || ''})`);
      }
    }
    throw lastErr || new Error('No candidate Gemini model succeeded');
  }

  console.log(`✅ Gemini connected successfully! (Model: ${usedModel})`);
  console.log('   Sample Flashcard Output:');
  const parsed = JSON.parse(response.text);
  console.log(JSON.stringify(parsed, null, 2));
  console.log('\n🎉 All infrastructure checks passed!');
} catch (err) {
  console.error('❌ Gemini API test failed:', err.message);
  process.exit(1);
}
