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

// Resolves once the most recently spoken utterance actually finishes (onend/onerror) — set
// synchronously inside speak() itself (not deferred to when the browser actually starts talking),
// so a caller that awaits waitForAnnouncer() right after triggering an announcement always gets
// the correct pending promise, never a stale already-resolved one. Exists for callers that drive
// their own pacing off real speech duration instead of a guessed fixed delay — see vs-computer's
// AI turn, whose fixed delay was firing the computer's next action before a longer announcement
// (e.g. a bonus-roll or capture sentence) had finished, audibly cutting it off.
let pendingSpeech: Promise<void> = Promise.resolve();

export function waitForAnnouncer(): Promise<void> {
  return pendingSpeech;
}

// Setting utter.lang = 'kn-IN' alone is only a hint — when no installed voice actually matches,
// browsers commonly substitute a default (typically English-ish) voice anyway rather than
// refusing to speak. That substitute voice can't pronounce Kannada script: in practice it reads
// through any Latin-script run it recognizes (e.g. a player's own name) and then produces nothing
// audible for the Kannada portion that follows — exactly the "only the name gets announced,
// instructions missing" symptom this was built to fix. Checking for a real Kannada voice and
// assigning it explicitly (utter.voice, not just utter.lang) is the only reliable way to know
// Kannada speech will actually work.
function findKannadaVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('kn')) ?? null;
}

function speak(text: string, rate = 1, pitch = 1, voice: SpeechSynthesisVoice | null = null): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    pendingSpeech = Promise.resolve();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) {
    utter.voice = voice;
    utter.lang = voice.lang;
  } else {
    utter.lang = 'en-US';
  }
  utter.rate = rate;
  utter.pitch = pitch;
  pendingSpeech = new Promise((resolve) => {
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    // Safety net: some environments (headless browsers, certain devices) never fire onend/
    // onerror at all, which would otherwise wedge any caller awaiting waitForAnnouncer() forever
    // — vs-computer's AI turn needs this to resolve before taking its next action. Capped well
    // above any real announcement's spoken length, so it only ever matters when events are truly
    // silent.
    setTimeout(resolve, 8000);
  });
  // Chrome (and Android WebView) has a known race where speak() called immediately after
  // cancel() starts the new utterance but truncates it after only the first word or two, before
  // the cancel has actually finished. A tiny delay lets the cancel land first.
  setTimeout(() => {
    // iOS Safari can leave the speech engine stuck in a 'paused' state (e.g. after the tab was
    // backgrounded, or after a prior cancel()) without ever un-pausing itself — a paused engine
    // silently swallows every speak() call after it, with no error. Cheap to clear defensively
    // right before every real announcement rather than trying to detect exactly when it happened.
    if (synth.paused) synth.resume();
    synth.speak(utter);
  }, 60);
}

// Every announce* function below goes through this rather than calling speak() directly: it
// picks Kannada only when a real Kannada voice is actually installed (see findKannadaVoice above)
// and otherwise falls back to the English phrasing of the same key, so the spoken announcement is
// always a complete, intelligible sentence — never a partial Kannada readout. The on-screen text
// (banner, labels) is unaffected by this fallback; it always shows the selected language exactly,
// this only concerns what gets spoken aloud.
function speakLocalized(key: string, args: unknown[], rate = 1, pitch = 1): void {
  if (getLanguage() === 'kn') {
    const voice = findKannadaVoice();
    if (voice) {
      speak(translate(key, 'kn', ...args), rate, pitch, voice);
      return;
    }
  }
  speak(translate(key, 'en', ...args), rate, pitch, null);
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
// gesture that caused it. Priming both APIs on tap/click/key anywhere on the page keeps them
// unlocked for the rest of the session on browsers that require an initial gesture but don't
// re-require one for every later call.
//
// Deliberately NOT a one-shot: an earlier version primed once (`{ once: true }`) and permanently
// marked itself unlocked regardless of whether priming actually succeeded, so a gesture that
// happened to fail silently (e.g. the very first tap on a page still mid-navigation from an
// invite link, or a WebKit quirk) could leave a player unlockable for the rest of the session —
// plausibly why some devices (reported: a 2nd player joining from an iPhone) never heard
// announcements even though the same broadcast-triggered speak() call worked correctly on other
// connected devices. Instead, every qualifying gesture cheaply re-primes: resumes the audio
// context and un-pauses speech synthesis if either drifted back to a suspended/paused state
// (which backgrounding the tab — locking the phone, switching apps — is known to cause on iOS),
// and (only until it succeeds once) attempts the actual unlock utterance.
let voicePrimed = false;
let listenersInstalled = false;

function primeOnGesture(): void {
  try {
    const ctx = getCtx();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  } catch {
    // Best-effort — retried on the next gesture regardless.
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    if (synth.paused) synth.resume();
    if (voicePrimed) return;
    // A genuinely-empty utterance is a silent no-op on some WebKit versions (no onstart/onend
    // ever fires), which doesn't count as real speech usage for Safari's per-page activation
    // grant — a single space is inaudible at volume 0 but still gets processed as a real
    // utterance.
    const utter = new SpeechSynthesisUtterance(' ');
    utter.volume = 0;
    utter.onend = () => {
      voicePrimed = true;
    };
    utter.onerror = () => {
      voicePrimed = true;
    };
    synth.speak(utter);
  } catch {
    // Left unprimed — the next gesture retries automatically, since these listeners are never
    // removed.
  }
}

export function unlockAudioOnFirstInteraction(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  document.addEventListener('pointerdown', primeOnGesture);
  document.addEventListener('keydown', primeOnGesture);
  document.addEventListener('touchend', primeOnGesture);
  // Backgrounding (locking the phone, switching apps mid-game) is the other main trigger for a
  // stuck-suspended audio context / stuck-paused speech engine on mobile — re-priming the moment
  // the tab becomes visible again means a still-connected player isn't left silently unlockable
  // for the rest of the game just because their next real announcement happens to arrive before
  // their next tap does.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') primeOnGesture();
  });
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
// (shared with the on-screen turn banner, so speech and text never drift apart) — speakLocalized
// picks the right key for the current language (falling back to English if Kannada speech isn't
// actually available, see above) and speaks it.
export function announceRoll(playerName: string, label: string, isBonus: boolean): void {
  if (isBonus) {
    chime('bonus');
    speakLocalized('banner.rollBonus', [playerName, label], 1.15, 1.3);
  } else {
    speakLocalized('banner.rollResult', [playerName, label]);
  }
}

// Spoken the moment a new turn begins.
export function announceTurnStart(playerName: string): void {
  speakLocalized('banner.turnStart', [playerName]);
}

// Spoken whenever a stuck turn (or a finish reached with pool values still unplayed) gets undone
// — otherwise this only ever showed up as on-screen text, easy to miss mid-game. Combined with
// the next turn's own announcement into one utterance rather than firing both separately, since
// speak() always cancels-and-replaces (no queueing) — a second call right after this one would
// just cut it off before it finished.
export function announceTurnReverted(revertedPlayerName: string, nextPlayerName: string): void {
  speakLocalized('banner.turnReverted', [revertedPlayerName, nextPlayerName]);
}

// Capturing always grants a bonus roll (§5.6) — say so, not just the capture itself, so this
// announcement is a complete instruction like the others.
export function announceCapture(playerName: string, count: number): void {
  chime('capture');
  speakLocalized('banner.captured', [playerName, count], 1.1, 1.15);
}

// A short spoken nudge for UI-only guidance (e.g. "pick a value first") — no chime, doesn't
// touch the persistent game message, just a transient voice hint. Takes a strings.ts key (not
// pre-translated text) like every other announce* function, so it can apply the same
// Kannada-voice-availability fallback — the caller still uses t(key) separately for the on-screen
// hint text, which always shows the selected language regardless of what gets spoken.
export function announceHint(key: string): void {
  speakLocalized(key, []);
}

export function announceFinish(playerName: string, place: number): void {
  if (place === 1) {
    chime('win');
    speakLocalized('banner.won', [playerName], 1, 1.2);
  } else {
    chime('finish');
    speakLocalized('banner.finished', [playerName, place]);
  }
}
