import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';

const execFileAsync = promisify(execFile);
const sql = neon(process.env.DATABASE_URL);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('❌ BLOB_READ_WRITE_TOKEN missing in .env.local');
  process.exit(1);
}

const CONCURRENCY = 8;

function canonicalKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/^[.,!?;:„“"'«»()[\]]+|[.,!?;:„“"'«»()[\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(text) {
  return crypto.createHash('sha256').update(`v2:${canonicalKey(text)}`).digest('hex').slice(0, 32);
}

async function renderGermanM4a(text, hash) {
  const tmpFile = path.join(os.tmpdir(), `dk-tts-${hash}.m4a`);
  try {
    await execFileAsync(
      'say',
      ['-v', 'Anna', '-r', '172', '-o', tmpFile, '--file-format=m4af', '--data-format=aac', text],
      { timeout: 15000 }
    );
    return await fs.readFile(tmpFile);
  } finally {
    await fs.unlink(tmpFile).catch(() => {});
  }
}

// 1. Gather ALL unique single words + grammar examples + idioms sorted by priority
const [gRows, lRows, wRows, idiomRows, existingRows] = await Promise.all([
  sql`SELECT lesson_content, exercises FROM grammar_topics`,
  sql`SELECT exercises FROM course_lessons`,
  sql`SELECT word FROM global_words`,
  sql`SELECT expression_de, example_de FROM german_idioms`,
  sql`SELECT text_hash FROM tts_audio_cache`,
]);

const existingHashes = new Set(existingRows.map((r) => r.text_hash));
const itemsByHash = new Map();

const register = (rawText, weight) => {
  const clean = String(rawText || '').trim().replace(/\s+/g, ' ').slice(0, 260);
  const canon = canonicalKey(clean);
  if (!canon || !/[a-zA-ZäöüßÄÖÜ]/.test(canon)) return;
  const hash = hashText(clean);
  if (existingHashes.has(hash)) return;
  const prev = itemsByHash.get(hash);
  itemsByHash.set(hash, {
    hash,
    text: prev?.text || clean,
    weight: (prev?.weight || 0) + weight,
  });
};

// Priority 1: Single words from exercises (word-bank, listening, cloze) -> highest weight!
const addSingleWord = (raw, weight) => {
  const clean = String(raw || '')
    .trim()
    .replace(/^[.,!?;:„“"'«»()[\]]+|[.,!?;:„“"'«»()[\]]+$/g, '');
  if (!clean || clean.includes(' ')) return;
  register(clean, weight);
};

for (const row of [...lRows, ...gRows]) {
  for (const ex of row.exercises || []) {
    if (Array.isArray(ex.tokens)) ex.tokens.forEach((t) => addSingleWord(t, 20));
    if (Array.isArray(ex.options)) ex.options.forEach((o) => addSingleWord(o, 12));
  }
}

// Priority 2: All single words from global_words flashcards
for (const w of wRows) addSingleWord(w.word, 8);

// Priority 3: All B1 grammar guidebook examples
for (const g of gRows) {
  const examples = g.lesson_content?.examples;
  if (Array.isArray(examples)) {
    for (const ex of examples) {
      if (ex?.de) register(ex.de, 15);
    }
  }
}

// Priority 4: All 55 German idioms & their conversation examples
for (const idm of idiomRows) {
  if (idm.expression_de) register(idm.expression_de, 14);
  if (idm.example_de) register(idm.example_de, 10);
}

const todo = [...itemsByHash.values()].sort((a, b) => b.weight - a.weight);
console.log(
  `🎙️ Pre-generating ${todo.length} German audio files (words + grammar examples + idioms) using Apple Anna (de_DE) -> Frankfurt Vercel Blob...`
);

let doneCount = 0;
let failCount = 0;

for (let i = 0; i < todo.length; i += CONCURRENCY) {
  const batch = todo.slice(i, i + CONCURRENCY);
  await Promise.all(
    batch.map(async (item) => {
      try {
        const m4a = await renderGermanM4a(item.text, item.hash);
        const blob = await put(`tts/v2/${item.hash}.m4a`, m4a, {
          access: 'public',
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: 'audio/mp4',
          cacheControlMaxAge: 31536000,
        });
        await sql`
          INSERT INTO tts_audio_cache (text_hash, text_content, blob_url, byte_size)
          VALUES (${item.hash}, ${item.text}, ${blob.url}, ${m4a.byteLength})
          ON CONFLICT (text_hash) DO NOTHING
        `;
        doneCount++;
        if (doneCount % 100 === 0 || doneCount === todo.length) {
          console.log(`  ✅ Uploaded ${doneCount}/${todo.length} audio files (latest: "${item.text.slice(0, 40)}")`);
        }
      } catch (err) {
        failCount++;
        console.warn(`  ⚠️ Failed "${item.text}": ${err?.message || err}`);
      }
    })
  );
}

const [totalRow] = await sql`
  SELECT COUNT(*)::int AS total, ROUND(COALESCE(SUM(byte_size), 0) / 1048576.0, 2) AS mb
  FROM tts_audio_cache
`;
console.log(
  `\n🎉 COMPLETE! Added: ${doneCount} | Failed: ${failCount} | Total in Vercel Blob + Neon: ${totalRow.total} files (${totalRow.mb} MB)`
);
