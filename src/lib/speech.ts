'use client';

/**
 * Studio-Quality Human German Speech Engine for iOS, Android, PWA & Desktop.
 *
 * - Primary: Plays pre-warmed Human Neural German MP3s (Seraphina & Conrad) from our
 *   Frankfurt Vercel Blob CDN (/api/tts?v=3&text=...) and caches them permanently in
 *   browser CacheStorage so repeat plays are instant (0ms) and work even in iPhone Silent Mode / PWA!
 * - Automatic Fallback: If offline or /api/tts is unavailable, falls back seamlessly to
 *   mobile-hardened native Web Speech API (de-DE).
 */

export type SpeechPlayState = 'loading' | 'playing' | 'idle';

let activeStateCb: ((state: SpeechPlayState) => void) | null = null;
let cachedGermanVoice: SpeechSynthesisVoice | null = null;
let voicesInitialized = false;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speakSeq = 0;

let sharedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let activeObjectUrl: string | null = null;

// Tiny 44-byte valid silent WAV data URI used to unlock iOS Safari/PWA audio synchronously inside user gesture
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const TTS_CACHE_NAME = 'deutschkart-tts-v3';

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

function primeMobileAudio() {
  if (typeof window === 'undefined') return;
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'auto';
    sharedAudio.setAttribute('playsinline', 'true');
  }
  if (!audioUnlocked) {
    try {
      sharedAudio.src = SILENT_WAV_DATA_URI;
      const p = sharedAudio.play();
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

async function playServerTts(
  text: string,
  rate: number,
  seq: number,
  onState?: (state: SpeechPlayState) => void
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const cleanText = text.trim();
  if (!cleanText) return false;

  const url = `/api/tts?v=3&text=${encodeURIComponent(cleanText)}`;

  try {
    let blob: Blob | null = null;

    if ('caches' in window) {
      try {
        const cache = await caches.open(TTS_CACHE_NAME);
        const cached = await cache.match(url);
        if (cached && cached.ok) {
          blob = await cached.blob();
        }
      } catch {
        // ignore cache read failure
      }
    }

    if (!blob) {
      setPlayState(onState, 'loading');
      const res = await fetch(url);
      if (!res.ok) {
        setPlayState(onState, 'idle');
        return false;
      }
      blob = await res.blob();
      if ('caches' in window && blob.size > 44) {
        const cleanResp = new Response(blob, {
          status: 200,
          headers: { 'Content-Type': res.headers.get('content-type') || blob.type || 'audio/mpeg' },
        });
        caches
          .open(TTS_CACHE_NAME)
          .then((cache) => cache.put(url, cleanResp))
          .catch(() => {});
      }
    }

    if (seq !== speakSeq) return true;

    if (!sharedAudio) {
      sharedAudio = new Audio();
      sharedAudio.setAttribute('playsinline', 'true');
    }
    sharedAudio.pause();
    if (activeObjectUrl) {
      URL.revokeObjectURL(activeObjectUrl);
      activeObjectUrl = null;
    }

    const objUrl = URL.createObjectURL(blob);
    activeObjectUrl = objUrl;
    sharedAudio.src = objUrl;
    sharedAudio.playbackRate = Math.max(0.55, Math.min(1.5, rate));
    sharedAudio.onended = () => {
      if (seq === speakSeq) setPlayState(onState, 'idle');
    };
    sharedAudio.onerror = () => {
      if (seq === speakSeq) setPlayState(onState, 'idle');
    };
    setPlayState(onState, 'playing');
    await sharedAudio.play();
    audioUnlocked = true;
    return true;
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

  if (activeStateCb && activeStateCb !== onState) {
    activeStateCb('idle');
  }
  activeStateCb = onState || null;

  initVoicesListener();
  speakSeq += 1;
  const mySeq = speakSeq;

  if (sharedAudio && !sharedAudio.paused) {
    try {
      sharedAudio.pause();
    } catch {
      // ignore
    }
  }

  // Unlock HTML5 audio synchronously inside user gesture (critical for iOS Safari & PWA)
  primeMobileAudio();

  const hasSpeech = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

  // Use our studio-quality Human Neural German voices (Seraphina & Conrad) on ALL devices!
  // Falls back to native Web Speech automatically if offline or unavailable.
  void playServerTts(cleanText, rate, mySeq, onState).then((ok) => {
    if (!ok && mySeq === speakSeq && hasSpeech) {
      speakWithWebSpeech(cleanText, rate, mySeq, onState);
    }
  });
}
