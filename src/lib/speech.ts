'use client';

let cachedGermanVoice: SpeechSynthesisVoice | null = null;

function pickBestGermanVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const germanVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('de'));
  if (!germanVoices.length) return null;

  // Prefer natural/enhanced system voices (Apple Anna/Helena/Petra, Google Deutsch, Microsoft Katja)
  const preferred = germanVoices.find((v) =>
    /anna|katja|conrad|google deutsch|helena|petra|marlene|enhanced|premium|natural/i.test(v.name)
  );
  return preferred || germanVoices.find((v) => v.lang === 'de-DE') || germanVoices[0];
}

export function speakGerman(text: string, rate = 0.92) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = rate;

    const voice = cachedGermanVoice || pickBestGermanVoice();
    if (voice) {
      cachedGermanVoice = voice;
      utterance.voice = voice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore speech synthesis failures on unsupported environments
  }
}
