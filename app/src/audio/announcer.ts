// Spoken readouts (Web Speech API) plus short generated chimes (Web Audio API) for the
// game's key moments. No audio assets — tones are synthesized on the fly.

import { getLanguage } from '../i18n/language';
import { translate } from '../i18n/strings';

let enabled = true;

export function setAnnouncerEnabled(v: boolean): void {
  enabled = v;
  if (!v && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isAnnouncerEnabled(): boolean {
  return enabled;
}

function speak(text: string, rate = 1, pitch = 1): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  // Matches the current language setting. Kannada TTS is attempted at the user's explicit
  // request even though many devices/browsers have no Kannada voice installed (which either
  // fails to speak at all or mangles the text through a fallback voice) — English remains the
  // more reliable choice, but Kannada is no longer avoided outright.
  utter.lang = getLanguage() === 'kn' ? 'kn-IN' : 'en-US';
  utter.rate = rate;
  utter.pitch = pitch;
  // Chrome (and Android WebView) has a known race where speak() called immediately after
  // cancel() starts the new utterance but truncates it after only the first word or two, before
  // the cancel has actually finished. A tiny delay lets the cancel land first.
  setTimeout(() => synth.speak(utter), 60);
}

type AudioContextCtor = typeof AudioContext;
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

// Mobile browsers (notably iOS Safari) can silently drop speech/audio triggered by code that
// isn't directly, synchronously inside a user gesture — which online play's roll/capture/finish
// announcements aren't, since they fire off a socket broadcast arriving asynchronously after the
// gesture that caused it. Priming both APIs on the very first tap/click/key anywhere on the page
// (well before any of that) keeps them unlocked for the rest of the session on browsers that
// require an initial gesture but don't re-require one for every later call.
let unlocked = false;
export function unlockAudioOnFirstInteraction(): void {
  if (unlocked || typeof window === 'undefined') return;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    try {
      const ctx = getCtx();
      if (ctx && ctx.state === 'suspended') void ctx.resume();
      if ('speechSynthesis' in window) {
        const utter = new SpeechSynthesisUtterance('');
        utter.volume = 0;
        window.speechSynthesis.speak(utter);
      }
    } catch {
      // Best-effort — if this fails, later real announcements just fall back to whatever the
      // browser's default gesture policy allows.
    }
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}

function tone(ctx: AudioContext, freq: number, start: number, duration: number, peak = 0.18): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function chime(kind: 'bonus' | 'capture' | 'finish' | 'win'): void {
  if (!enabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  if (kind === 'bonus') {
    tone(ctx, 523.25, 0, 0.15);
    tone(ctx, 659.25, 0.1, 0.18);
    tone(ctx, 783.99, 0.2, 0.25);
  } else if (kind === 'capture') {
    tone(ctx, 880, 0, 0.08, 0.22);
    tone(ctx, 440, 0.06, 0.15, 0.18);
  } else if (kind === 'finish') {
    tone(ctx, 659.25, 0, 0.15);
    tone(ctx, 880, 0.12, 0.2);
  } else {
    tone(ctx, 523.25, 0, 0.15);
    tone(ctx, 659.25, 0.12, 0.15);
    tone(ctx, 783.99, 0.24, 0.15);
    tone(ctx, 1046.5, 0.36, 0.35);
  }
}

// Full sentence, not just the bare value — states the result AND what to do next, so the
// announcement is a complete instruction on its own. Phrase templates live in i18n/strings.ts
// (shared with the on-screen turn banner, so speech and text never drift apart) — this just picks
// the right key for the current language and speaks it.
export function announceRoll(playerName: string, label: string, isBonus: boolean): void {
  const lang = getLanguage();
  if (isBonus) {
    chime('bonus');
    speak(translate('banner.rollBonus', lang, playerName, label), 1.15, 1.3);
  } else {
    speak(translate('banner.rollResult', lang, playerName, label));
  }
}

// Spoken the moment a new turn begins.
export function announceTurnStart(playerName: string): void {
  speak(translate('banner.turnStart', getLanguage(), playerName));
}

// Spoken whenever a stuck turn (or a finish reached with pool values still unplayed) gets undone
// — otherwise this only ever showed up as on-screen text, easy to miss mid-game. Combined with
// the next turn's own announcement into one utterance rather than firing both separately, since
// speak() always cancels-and-replaces (no queueing) — a second call right after this one would
// just cut it off before it finished.
export function announceTurnReverted(revertedPlayerName: string, nextPlayerName: string): void {
  speak(translate('banner.turnReverted', getLanguage(), revertedPlayerName, nextPlayerName));
}

// Capturing always grants a bonus roll (§5.6) — say so, not just the capture itself, so this
// announcement is a complete instruction like the others.
export function announceCapture(playerName: string, count: number): void {
  chime('capture');
  speak(translate('banner.captured', getLanguage(), playerName, count), 1.1, 1.15);
}

// A short spoken nudge for UI-only guidance (e.g. "pick a value first") — no chime, doesn't
// touch the persistent game message, just a transient voice hint.
export function announceHint(text: string): void {
  speak(text);
}

export function announceFinish(playerName: string, place: number): void {
  const lang = getLanguage();
  if (place === 1) {
    chime('win');
    speak(translate('banner.won', lang, playerName), 1, 1.2);
  } else {
    chime('finish');
    speak(translate('banner.finished', lang, playerName, place));
  }
}
