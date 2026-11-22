import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { del, list, put } from '@vercel/blob';
import { neon } from '@neondatabase/serverless';

const execFileAsync = promisify(execFile);
const sql = neon(process.env.DATABASE_URL);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('❌ BLOB_READ_WRITE_TOKEN missing');
  process.exit(1);
}

const PYTHON_BIN =
  '/Users/amirrezaie/.gemini/antigravity/brain/4f2e334b-a791-42e8-9ec2-2fd1933f9ba4/scratch/tts-venv/bin/python3';
const PY_SCRIPT =
  '/Users/amirrezaie/.gemini/antigravity/brain/4f2e334b-a791-42e8-9ec2-2fd1933f9ba4/scratch/synth_neural_v3.py';
const TMP_DIR = path.join(os.tmpdir(), 'dk-neural-v3');
const MANIFEST_FILE = path.join(os.tmpdir(), 'dk-neural-v3-manifest.json');

const VOICES = ['de-DE-SeraphinaMultilingualNeural', 'de-DE-ConradNeural'];
const BATCH_SIZE = 250;
const UPLOAD_CONCURRENCY = 16;

function canonicalKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/^[.,!?;:„“"'«»()[\]]+|[.,!?;:„“"'«»()[\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashTextV3(text) {
  return crypto.createHash('sha256').update(`v3:${canonicalKey(text)}`).digest('hex').slice(0, 32);
}

// 1. Collect ALL unique German words & sentences across the entire platform
const [gRows, lRows, uRows, wRows, idRows, existingRows] = await Promise.all([
  sql`SELECT lesson_content, exercises FROM grammar_topics`,
  sql`SELECT exercises FROM course_lessons`,
  sql`SELECT guidebook_fa FROM course_units`,
  sql`SELECT word, article, example_de FROM global_words`,
  sql`SELECT expression_de, example_de FROM german_idioms`,
  sql`SELECT text_hash FROM tts_audio_cache WHERE blob_url LIKE '%/tts/v3/%'`,
]);

const existingV3 = new Set(existingRows.map((r) => r.text_hash));
const itemsMap = new Map();

const addItem = (raw, weight) => {
  const clean = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 260);
  const canon = canonicalKey(clean);
  if (!canon || !/[a-zA-ZäöüßÄÖÜ]/.test(canon)) return;
  const hash = hashTextV3(clean);
  if (existingV3.has(hash)) return;
  const prev = itemsMap.get(hash);
  // Deterministic 50/50 voice mix: Seraphina (Female) & Conrad (Male)
  const voice = VOICES[parseInt(hash.slice(0, 2), 16) % 2];
  itemsMap.set(hash, {
    hash,
    text: prev?.text || clean,
    voice,
    weight: (prev?.weight || 0) + weight,
  });
};

for (const row of [...lRows, ...gRows]) {
  for (const ex of row.exercises || []) {
    if (Array.isArray(ex.tokens)) ex.tokens.forEach((t) => addItem(t, 25));
    if (Array.isArray(ex.options)) ex.options.forEach((o) => addItem(o, 15));
    if (ex.targetDe) addItem(ex.targetDe, 12);
    if (ex.audioDe) addItem(ex.audioDe, 14);
    if (ex.fullSentenceDe) addItem(ex.fullSentenceDe, 12);
    if (ex.type === 'typing' && ex.answerDe) {
      addItem(`${ex.sentenceBefore || ''}${ex.answerDe}${ex.sentenceAfter || ''}`, 10);
    }
    if (Array.isArray(ex.pairs)) ex.pairs.forEach((p) => addItem(p.de, 12));
  }
}

for (const g of gRows) {
  for (const ex of g.lesson_content?.examples || []) {
    if (ex?.de) addItem(ex.de, 22);
  }
}

for (const u of uRows) {
  for (const kp of u.guidebook_fa?.keyPhrases || []) {
    if (kp?.de) addItem(kp.de, 12);
  }
}

for (const w of wRows) {
  addItem(w.word, 10);
  if (w.article) addItem(`${w.article} ${w.word}`, 10);
  if (w.example_de) addItem(w.example_de, 8);
}

for (const idm of idRows) {
  if (idm.expression_de) addItem(idm.expression_de, 18);
  if (idm.example_de) addItem(idm.example_de, 14);
}

const todo = [...itemsMap.values()].sort((a, b) => b.weight - a.weight);
console.log(
  `🎙️ Neural TTS v3 (Seraphina + Conrad): Already v3: ${existingV3.size} | Generating & uploading: ${todo.length} MP3 files...`
);

await fs.mkdir(TMP_DIR, { recursive: true });

let totalUploaded = 0;
let totalFailed = 0;

for (let start = 0; start < todo.length; start += BATCH_SIZE) {
  const batch = todo.slice(start, start + BATCH_SIZE);
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(batch), 'utf-8');

  // Step A: Fast async Python synthesis (12 concurrent Neural WebSockets)
  try {
    const { stdout } = await execFileAsync(PYTHON_BIN, [PY_SCRIPT, MANIFEST_FILE, TMP_DIR, '12'], {
      timeout: 180000,
    });
    process.stdout.write(`  [Batch ${Math.floor(start / BATCH_SIZE) + 1}/${Math.ceil(todo.length / BATCH_SIZE)}] ${stdout.trim()} -> uploading... `);
  } catch (err) {
    console.error(`  ⚠️ Synthesis batch error:`, err?.message || err);
  }

  // Step B: Parallel upload to Frankfurt Vercel Blob + Neon DB insert
  let batchOk = 0;
  for (let i = 0; i < batch.length; i += UPLOAD_CONCURRENCY) {
    const slice = batch.slice(i, i + UPLOAD_CONCURRENCY);
    await Promise.all(
      slice.map(async (item) => {
        const filePath = path.join(TMP_DIR, `${item.hash}.mp3`);
        try {
          const mp3 = await fs.readFile(filePath);
          if (mp3.byteLength < 200) throw new Error('Empty mp3');
          const blob = await put(`tts/v3/${item.hash}.mp3`, mp3, {
            access: 'public',
            addRandomSuffix: false,
            allowOverwrite: true,
            contentType: 'audio/mpeg',
            cacheControlMaxAge: 31536000,
          });
          await sql`
            INSERT INTO tts_audio_cache (text_hash, text_content, blob_url, byte_size)
            VALUES (${item.hash}, ${item.text}, ${blob.url}, ${mp3.byteLength})
            ON CONFLICT (text_hash) DO UPDATE SET
              blob_url = EXCLUDED.blob_url,
              byte_size = EXCLUDED.byte_size
          `;
          batchOk++;
          totalUploaded++;
        } catch {
          totalFailed++;
        } finally {
          await fs.unlink(filePath).catch(() => {});
        }
      })
    );
  }
  console.log(`✅ uploaded ${batchOk} (running total: ${totalUploaded}/${todo.length})`);
}

// Step C: Clean up old robotic v2 files from Vercel Blob & Neon to reclaim ~57 MB free space!
console.log('\n🧹 Cleaning up old robotic v2 audio files from Vercel Blob & Neon...');
let deletedBlobs = 0;
let cursor = undefined;
do {
  const page = await list({ prefix: 'tts/v2/', limit: 500, cursor });
  if (page.blobs.length > 0) {
    await del(page.blobs.map((b) => b.url));
    deletedBlobs += page.blobs.length;
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);

await sql`DELETE FROM tts_audio_cache WHERE blob_url LIKE '%/tts/v2/%'`;

const [finalStats] = await sql`
  SELECT COUNT(*)::int AS total, ROUND(COALESCE(SUM(byte_size), 0) / 1048576.0, 2) AS mb
  FROM tts_audio_cache
`;
console.log(
  `🎉 ALL DONE! Uploaded ${totalUploaded} Neural MP3s (failed: ${totalFailed}), cleaned ${deletedBlobs} old v2 files.\n📦 Final Vercel Blob + Neon TTS store: ${finalStats.total} human Neural German files (${finalStats.mb} MB / 1024 MB free)!`
);
