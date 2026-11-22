'use client';

/**
 * Studio-Quality Human German Speech Engine for iOS, Android, PWA & Desktop.
 *
 * - Zero-Latency Preloading: `preloadGermanAudio(texts)` resolves all lesson words & sentences
 *   in ONE single batch DB lookup (`POST /api/tts`), downloads MP3s directly from our Frankfurt
 *   Vercel Blob CDN into permanent browser `CacheStorage` + warm RAM (`memoryObjectUrls`), so
 *   tapping any word plays synchronously in < 5ms (just like native Duolingo)!
 * - Automatic Fallback: If offline or a brand-new text isn't preloaded yet, fetches on demand
 *   or falls back seamlessly to mobile-hardened native Web Speech API (de-DE).
 */

export type SpeechPlayState = 'loading' | 'playing' | 'idle';

export interface PreloadAudioOptions {
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

let activeStateCb: ((state: SpeechPlayState) => void) | null = null;
let cachedGermanVoice: SpeechSynthesisVoice | null = null;
let voicesInitialized = false;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speakSeq = 0;

let sharedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let currentlyPlayingKey: string | null = null;

// Warm in-memory object URL cache: canonicalKey -> blob: URL (synchronous 0ms playback on tap!)
const memoryObjectUrls = new Map<string, string>();
const MAX_MEMORY_AUDIO = 350;

// In-flight deduplication so tapping a word while preload is downloading it shares the exact request
const inflightDownloads = new Map<string, Promise<string | null>>();

// Tiny 44-byte valid silent WAV data URI used to unlock iOS Safari/PWA audio synchronously inside user gesture
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const TTS_CACHE_NAME = 'deutschkart-tts-v3';

export function canonicalizeTtsKey(rawText: string): string {
  return rawText
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 260)
    .toLowerCase()
    .replace(/^[.,!?;:„“"'«»()[\]]+|[.,!?;:„“"'«»()[\]]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cacheRequestUrl(canonicalKey: string): string {
  return `/api/tts?v=3&text=${encodeURIComponent(canonicalKey)}`;
}

function storeMemoryObjectUrl(key: string, blob: Blob): string {
  const existing = memoryObjectUrls.get(key);
  if (existing) {
    // Refresh LRU recency
    memoryObjectUrls.delete(key);
    memoryObjectUrls.set(key, existing);
    return existing;
  }

  const objUrl = URL.createObjectURL(blob);
  memoryObjectUrls.set(key, objUrl);

  if (memoryObjectUrls.size > MAX_MEMORY_AUDIO) {
    for (const [oldestKey, oldestUrl] of memoryObjectUrls.entries()) {
      if (oldestKey === currentlyPlayingKey) continue;
      memoryObjectUrls.delete(oldestKey);
      try {
        URL.revokeObjectURL(oldestUrl);
      } catch {
        // ignore
      }
      if (memoryObjectUrls.size <= MAX_MEMORY_AUDIO) break;
    }
  }

  return objUrl;
}

function setPlayState(cb: ((state: SpeechPlayState) => void) | undefined, state: SpeechPlayState) {
  if (cb) cb(state);
}

function initVoicesListener() {
  if (voicesInitialized || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voicesInitialized = true;
  const refresh = () => {
    cachedGermanVoice = pickBestLocalGermanVoice();
  };
  refresh();
  if (typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
  }
}

function pickBestLocalGermanVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const germanVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('de'));
  if (!germanVoices.length) return null;

  const localGerman = germanVoices.filter((v) => v.localService);
  const pool = localGerman.length > 0 ? localGerman : germanVoices;

  const preferred = pool.find((v) =>
    /anna|katja|conrad|google deutsch|helena|petra|marlene|markus|viktor/i.test(v.name)
  );
  return preferred || pool.find((v) => v.lang.toLowerCase() === 'de-de') || pool[0];
}

function ensureSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    sharedAudio.setAttribute('playsinline', 'true');
  }
  return sharedAudio;
}

function primeMobileAudio() {
  if (typeof window === 'undefined') return;
  const audio = ensureSharedAudio();
  if (!audioUnlocked) {
    try {
      audio.src = SILENT_WAV_DATA_URI;
      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          audioUnlocked = true;
        }).catch(() => {
          // Will unlock on next gesture
        });
      }
    } catch {
      // ignore
    }
  }
}

async function readFromCacheStorage(canonicalKey: string): Promise<string | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    const cached = await cache.match(cacheRequestUrl(canonicalKey));
    if (cached && cached.ok) {
      const blob = await cached.blob();
      if (blob.size > 44) {
        return storeMemoryObjectUrl(canonicalKey, blob);
      }
    }
  } catch {
    // ignore cache read failure
  }
  return null;
}

async function fetchAndCacheAudio(
  canonicalKey: string,
  fetchUrl: string,
  signal?: AbortSignal
): Promise<string | null> {
  const existingMem = memoryObjectUrls.get(canonicalKey);
  if (existingMem) return existingMem;

  const existingInflight = inflightDownloads.get(canonicalKey);
  if (existingInflight) return existingInflight;

  const task = (async (): Promise<string | null> => {
    try {
      const res = await fetch(fetchUrl, { signal });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size <= 44) return null;

      if ('caches' in window) {
        const cleanResp = new Response(blob, {
          status: 200,
          headers: {
            'Content-Type': res.headers.get('content-type') || blob.type || 'audio/mpeg',
          },
        });
        caches
          .open(TTS_CACHE_NAME)
          .then((cache) => cache.put(cacheRequestUrl(canonicalKey), cleanResp))
          .catch(() => {});
      }

      return storeMemoryObjectUrl(canonicalKey, blob);
    } catch {
      return null;
    } finally {
      inflightDownloads.delete(canonicalKey);
    }
  })();

  inflightDownloads.set(canonicalKey, task);
  return task;
}

/**
 * Preload all German words & sentences for a lesson/deck into permanent browser CacheStorage
 * and warm RAM so tapping any word plays in 0ms with zero network wait!
 */
export async function preloadGermanAudio(
  texts: string[],
  options?: PreloadAudioOptions
): Promise<void> {
  if (typeof window === 'undefined' || !texts.length) return;
  const signal = options?.signal;
  const onProgress = options?.onProgress;

  // Deduplicate while preserving priority order (first exercises first!)
  const orderedKeys: string[] = [];
  const seen = new Set<string>();
  for (const raw of texts) {
    if (!raw || typeof raw !== 'string') continue;
    const key = canonicalizeTtsKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    orderedKeys.push(key);
  }

  const total = orderedKeys.length;
  if (total === 0) return;

  let loaded = 0;
  const uncachedKeys: string[] = [];

  // 1. Hydrate everything already cached on this phone (RAM or CacheStorage) in parallel — 0 network!
  let cache: Cache | null = null;
  if ('caches' in window) {
    try {
      cache = await caches.open(TTS_CACHE_NAME);
    } catch {
      cache = null;
    }
  }

  if (signal?.aborted) return;

  await Promise.all(
    orderedKeys.map(async (key) => {
      if (memoryObjectUrls.has(key)) {
        loaded += 1;
        return;
      }
      if (cache) {
        try {
          const hit = await cache.match(cacheRequestUrl(key));
          if (hit && hit.ok) {
            const blob = await hit.blob();
            if (blob.size > 44) {
              storeMemoryObjectUrl(key, blob);
              loaded += 1;
              return;
            }
          }
        } catch {
          // ignore
        }
      }
      uncachedKeys.push(key);
    })
  );

  if (signal?.aborted) return;
  onProgress?.(loaded, total);
  if (uncachedKeys.length === 0) return;

  // Preserve original priority order for uncached keys
  const uncachedSet = new Set(uncachedKeys);
  const prioritizedMissing = orderedKeys.filter((k) => uncachedSet.has(k));

  // 2. Resolve direct Frankfurt Vercel Blob CDN URLs in ONE batch call (max 250 per chunk)
  const resolvedUrls: Record<string, string> = {};
  for (let i = 0; i < prioritizedMissing.length; i += 220) {
    if (signal?.aborted) return;
    const chunk = prioritizedMissing.slice(i, i + 220);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: chunk }),
        signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { urls?: Record<string, string> };
        if (data?.urls) {
          Object.assign(resolvedUrls, data.urls);
        }
      }
    } catch {
      if (signal?.aborted) return;
    }
  }

  // Build download queue only for items that exist on our CDN
  const downloadQueue: Array<{ key: string; url: string }> = [];
  for (const key of prioritizedMissing) {
    const cdnUrl = resolvedUrls[key];
    if (cdnUrl) {
      downloadQueue.push({ key, url: cdnUrl });
    } else {
      // Not pre-warmed on CDN yet; count as done for progress bar (will synthesize on-demand if tapped)
      loaded += 1;
    }
  }

  onProgress?.(loaded, total);
  if (downloadQueue.length === 0 || signal?.aborted) return;

  // 3. Download directly from Frankfurt CDN with 6 parallel workers (0 serverless calls!)
  let cursor = 0;
  const CONCURRENCY = Math.min(6, downloadQueue.length);

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (!signal?.aborted) {
        const idx = cursor++;
        if (idx >= downloadQueue.length) break;
        const item = downloadQueue[idx];
        await fetchAndCacheAudio(item.key, item.url, signal);
        loaded += 1;
        if (!signal?.aborted) {
          onProgress?.(Math.min(loaded, total), total);
        }
      }
    })
  );
}

function playObjectUrlNow(
  key: string,
  objUrl: string,
  rate: number,
  seq: number,
  onState?: (state: SpeechPlayState) => void
): Promise<boolean> {
  try {
    const audio = ensureSharedAudio();
    const clampedRate = Math.max(0.55, Math.min(1.5, rate));

    if (audio.src === objUrl) {
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // ignore
      }
    } else {
      audio.pause();
      audio.src = objUrl;
    }

    currentlyPlayingKey = key;
    audio.playbackRate = clampedRate;
    audio.onended = () => {
      if (seq === speakSeq) setPlayState(onState, 'idle');
    };
    audio.onerror = () => {
      if (seq === speakSeq) setPlayState(onState, 'idle');
    };

    setPlayState(onState, 'playing');
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      return playPromise
        .then(() => {
          audioUnlocked = true;
          return true;
        })
        .catch(() => {
          if (seq === speakSeq) setPlayState(onState, 'idle');
          return false;
        });
    }
    audioUnlocked = true;
    return Promise.resolve(true);
  } catch {
    if (seq === speakSeq) setPlayState(onState, 'idle');
    return Promise.resolve(false);
  }
}

async function playServerTtsAsync(
  canonicalKey: string,
  originalText: string,
  rate: number,
  seq: number,
  onState?: (state: SpeechPlayState) => void
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Check browser persistent CacheStorage
    let objUrl = await readFromCacheStorage(canonicalKey);

    // 2. Otherwise download (joining any in-flight preload if already downloading!)
    if (!objUrl) {
      setPlayState(onState, 'loading');
      const url = `/api/tts?v=3&text=${encodeURIComponent(originalText)}`;
      objUrl = await fetchAndCacheAudio(canonicalKey, url);
    }

    if (!objUrl) {
      if (seq === speakSeq) setPlayState(onState, 'idle');
      return false;
    }

    if (seq !== speakSeq) return true;
    return await playObjectUrlNow(canonicalKey, objUrl, rate, seq, onState);
  } catch {
    if (seq === speakSeq) setPlayState(onState, 'idle');
    return false;
  }
}

function speakWithWebSpeech(
  cleanText: string,
  rate: number,
  mySeq: number,
  onState?: (state: SpeechPlayState) => void
) {
  if (
    typeof window === 'undefined' ||
    !('speechSynthesis' in window) ||
    typeof SpeechSynthesisUtterance === 'undefined'
  ) {
    setPlayState(onState, 'idle');
    return;
  }

  try {
    const synth = window.speechSynthesis;
    if (synth.speaking || synth.pending) synth.cancel();
    if (synth.paused) synth.resume();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'de-DE';
    utterance.rate = rate;
    utterance.volume = 1;

    const voice = cachedGermanVoice || pickBestLocalGermanVoice();
    if (voice && voice.localService) {
      cachedGermanVoice = voice;
      utterance.voice = voice;
    }

    activeUtterance = utterance;

    utterance.onstart = () => {
      if (mySeq === speakSeq) setPlayState(onState, 'playing');
    };
    utterance.onend = () => {
      if (activeUtterance === utterance) activeUtterance = null;
      if (mySeq === speakSeq) setPlayState(onState, 'idle');
    };
    utterance.onerror = () => {
      if (activeUtterance === utterance) activeUtterance = null;
      if (mySeq === speakSeq) setPlayState(onState, 'idle');
    };

    synth.speak(utterance);
  } catch {
    setPlayState(onState, 'idle');
  }
}

export function stopGermanAudio() {
  if (typeof window === 'undefined') return;
  speakSeq += 1;
  if (sharedAudio && !sharedAudio.paused) {
    try {
      sharedAudio.pause();
    } catch {
      // ignore
    }
  }
  if ('speechSynthesis' in window) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore
    }
  }
  if (activeStateCb) {
    activeStateCb('idle');
    activeStateCb = null;
  }
}

export function speakGerman(
  text: string,
  rate = 0.96,
  onState?: (state: SpeechPlayState) => void
) {
  if (typeof window === 'undefined') return;
  const cleanText = text.trim();
  if (!cleanText) return;
  const key = canonicalizeTtsKey(cleanText);
  if (!key) return;

  if (activeStateCb && activeStateCb !== onState) {
    activeStateCb('idle');
  }
  activeStateCb = onState || null;

  initVoicesListener();
  speakSeq += 1;
  const mySeq = speakSeq;

  const hasSpeech = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

  // FAST PATH (0ms!): If already preloaded into RAM, start playback SYNCHRONOUSLY inside this tap!
  const readyObjUrl = memoryObjectUrls.get(key);
  if (readyObjUrl) {
    // Refresh LRU order
    memoryObjectUrls.delete(key);
    memoryObjectUrls.set(key, readyObjUrl);

    void playObjectUrlNow(key, readyObjUrl, rate, mySeq, onState).then((ok) => {
      if (!ok && mySeq === speakSeq && hasSpeech) {
        speakWithWebSpeech(cleanText, rate, mySeq, onState);
      }
    });
    return;
  }

  // ASYNC PATH: Unlock HTML5 audio synchronously inside user gesture while fetching from CacheStorage/CDN
  if (sharedAudio && !sharedAudio.paused) {
    try {
      sharedAudio.pause();
    } catch {
      // ignore
    }
  }
  primeMobileAudio();

  void playServerTtsAsync(key, cleanText, rate, mySeq, onState).then((ok) => {
    if (!ok && mySeq === speakSeq && hasSpeech) {
      speakWithWebSpeech(cleanText, rate, mySeq, onState);
    }
  });
}
