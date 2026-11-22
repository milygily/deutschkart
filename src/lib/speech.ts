'use client';

/**
 * Bulletproof German Speech Engine for Desktop, Android & iOS Safari/PWA.
 *
 * - iOS / iPadOS (Safari & Home Screen PWA): Uses real HTML5 <audio> via /api/tts
 *   (cached permanently in CacheStorage so replays are 0ms!) because iOS WebKit
 *   mutes speechSynthesis in Silent Mode and frequently breaks speechSynthesis in PWAs.
 *   Automatically falls back to Web Speech API if /api/tts is unavailable.
 * - Android & Desktop: Uses mobile-hardened native Web Speech API (instant 0ms)
 *   whenever a German voice is installed, with an automatic 750ms watchdog fallback
 *   to /api/tts <audio> if Web Speech fails, stays silent, or lacks a German voice.
 */

export type SpeechPlayState = 'loading' | 'playing' | 'idle';

let activeStateCb: ((state: SpeechPlayState) => void) | null = null;

function setPlayState(cb: ((state: SpeechPlayState) => void) | undefined, state: SpeechPlayState) {
  if (cb) cb(state);
}
let cachedGermanVoice: SpeechSynthesisVoice | null = null;
let voicesInitialized = false;
let voicesLoaded = false;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
let nativeSpeechBroken = false;
let speakSeq = 0;

let sharedAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;
let activeObjectUrl: string | null = null;

// Tiny 44-byte valid silent WAV data URI used to unlock iOS Safari/PWA audio synchronously inside user gesture
const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

const TTS_CACHE_NAME = 'deutschkart-tts-v2';

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports MacIntel with touch points
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia?.('(display-mode: standalone)').matches;
}

function initVoicesListener() {
  if (voicesInitialized || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  voicesInitialized = true;
  const refresh = () => {
    const list = window.speechSynthesis.getVoices();
    if (list.length > 0) voicesLoaded = true;
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
    // Prevent fullscreen hijack on older iOS
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
          // Will unlock on next tap
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

  const url = `/api/tts?v=2&text=${encodeURIComponent(cleanText)}`;

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
      const cloned = res.clone();
      blob = await res.blob();
      if ('caches' in window) {
        caches
          .open(TTS_CACHE_NAME)
          .then((cache) => cache.put(url, cloned))
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
  allowServerFallback: boolean,
  onState?: (state: SpeechPlayState) => void
) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    if (allowServerFallback) void playServerTts(cleanText, rate, mySeq, onState);
    return;
  }

  try {
    const synth = window.speechSynthesis;

    // Only cancel when actually speaking/pending (calling cancel() when idle triggers iOS Safari silence bug)
    if (synth.speaking || synth.pending) {
      synth.cancel();
    }
    if (synth.paused) {
      synth.resume();
    }

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
    let started = false;

    utterance.onstart = () => {
      started = true;
      if (mySeq === speakSeq) setPlayState(onState, 'playing');
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
    };

    utterance.onend = () => {
      if (activeUtterance === utterance) activeUtterance = null;
      if (mySeq === speakSeq) setPlayState(onState, 'idle');
    };

    utterance.onerror = (ev) => {
      if (activeUtterance === utterance) activeUtterance = null;
      if (watchdogTimer) {
        clearTimeout(watchdogTimer);
        watchdogTimer = null;
      }
      if (ev.error === 'canceled' || ev.error === 'interrupted') return;
      if (allowServerFallback && mySeq === speakSeq) {
        nativeSpeechBroken = true;
        void playServerTts(cleanText, rate, mySeq, onState);
      } else if (mySeq === speakSeq) {
        setPlayState(onState, 'idle');
      }
    };

    synth.speak(utterance);

    if (allowServerFallback) {
      watchdogTimer = setTimeout(() => {
        watchdogTimer = null;
        if (!started && mySeq === speakSeq) {
          nativeSpeechBroken = true;
          try {
            synth.cancel();
          } catch {
            // ignore
          }
          void playServerTts(cleanText, rate, mySeq, onState);
        }
      }, 750);
    }
  } catch {
    if (allowServerFallback) {
      nativeSpeechBroken = true;
      void playServerTts(cleanText, rate, mySeq, onState);
    } else {
      setPlayState(onState, 'idle');
    }
  }
}

export function speakGerman(
  text: string,
  rate = 0.92,
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

  if (watchdogTimer) {
    clearTimeout(watchdogTimer);
    watchdogTimer = null;
  }

  if (sharedAudio && !sharedAudio.paused) {
    try {
      sharedAudio.pause();
    } catch {
      // ignore
    }
  }

  // Always unlock HTML5 audio synchronously inside user gesture (required on iOS Safari & PWA)
  primeMobileAudio();

  const hasSpeech = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const missingGermanVoice = voicesLoaded && !pickBestLocalGermanVoice();

  // On iOS / iPadOS (or standalone PWA, or devices without a German voice pack),
  // play real HTML5 <audio> directly via /api/tts (cached in CacheStorage) so sound ALWAYS works
  // even with iPhone Silent switch on or broken PWA speechSynthesis!
  if (isIOSDevice() || isStandalonePWA() || !hasSpeech || nativeSpeechBroken || missingGermanVoice) {
    void playServerTts(cleanText, rate, mySeq, onState).then((ok) => {
      if (!ok && mySeq === speakSeq && hasSpeech) {
        speakWithWebSpeech(cleanText, rate, mySeq, false, onState);
      }
    });
    return;
  }

  // On Desktop & Android browser with German voice: instant 0ms native speech + 750ms watchdog fallback
  speakWithWebSpeech(cleanText, rate, mySeq, true, onState);
}
