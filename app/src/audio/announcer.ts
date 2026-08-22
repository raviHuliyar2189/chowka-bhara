// Spoken readouts (Web Speech API) plus short generated chimes (Web Audio API) for the
// game's key moments. No audio assets — tones are synthesized on the fly.

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

// onEnd (when given) fires once this utterance genuinely finishes — used by the idle nudge to
// chain its next repeat only after the current one has actually finished playing, rather than on
// a fixed interval that can outrace it (see the call site's own comment for why that mattered).
function speak(text: string, rate = 1, pitch = 1, onEnd?: () => void): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  // Hints the browser toward a Kannada voice for these (all-Kannada) announcements, where one
  // is installed; falls back to the default voice otherwise, same as before.
  utter.lang = 'kn-IN';
  utter.rate = rate;
  utter.pitch = pitch;
  if (onEnd) {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onEnd();
    };
    utter.onend = finish;
    utter.onerror = finish;
    // Safety net: some browsers occasionally never fire onend/onerror at all — don't let a
    // chained caller (the idle nudge) stall forever waiting for a callback that never comes.
    setTimeout(finish, 8000);
  }
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

// Non-bonus rolls only ever land on 1, 2, or 3 (bhara/chauka are always bonus — see dice.ts),
// so this only needs to cover that range.
const KANNADA_NUMBER: Record<number, string> = {
  1: 'ಒಂದು',
  2: 'ಎರಡು',
  3: 'ಮೂರು',
};

export function announceRoll(label: string, value: number, isBonus: boolean): void {
  if (isBonus) {
    chime('bonus');
    speak(`${label}! ಮತ್ತೆ ಎಸೆಯಿರಿ!`, 1.15, 1.3);
  } else {
    speak(KANNADA_NUMBER[value] ?? String(value));
  }
}

export function announceCapture(playerName: string, count: number): void {
  chime('capture');
  const what = count > 1 ? `${count} ಗರಗಳನ್ನು` : 'ಒಂದು ಗರವನ್ನು';
  speak(`${playerName} ${what} ಹೊಡೆದರು!`, 1.1, 1.15);
}

// A short spoken nudge for UI-only guidance (e.g. "pick a value first") — no chime, doesn't
// touch the persistent game message, just a transient voice hint.
export function announceHint(text: string): void {
  speak(text);
}

// Idle nudge: the current player hasn't rolled or moved in a while. Names the specific pending
// action (rather than a generic "play quickly") so the nudge is actually actionable — someone
// who stepped away mid-turn hears exactly what's still waiting on them. No chime — this repeats
// while they stay idle, and a chime on every repeat would get grating fast.
//
// onEnd is required (not optional) here on purpose: the caller uses it to schedule the *next*
// repeat only after this utterance actually finishes. A fixed setInterval instead would fire the
// next repeat's cancel()+speak() while this one might still be mid-playback — cutting it off
// right after the name (spoken first) but before the action (spoken after it) ever finished,
// which is exactly the "only says the name" symptom this was built to fix.
export function announceIdle(playerName: string, awaitingRoll: boolean, onEnd: () => void): void {
  const action = awaitingRoll ? 'ಬೇಗ ಕವಡೆ ಹಾಕಿ' : 'ಬೇಗ ಗರ ನಡೆಸಿ';
  speak(`${playerName}, ಈಗ ನಿಮ್ಮ ಆಟ. ${action}.`, 1, 1, onEnd);
}

const KANNADA_ORDINAL: Record<number, string> = {
  1: 'ಮೊದಲ',
  2: 'ಎರಡನೇ',
  3: 'ಮೂರನೇ',
  4: 'ನಾಲ್ಕನೇ',
};

function ordinal(n: number): string {
  return KANNADA_ORDINAL[n] ?? `${n}ನೇ`;
}

export function announceFinish(playerName: string, place: number): void {
  if (place === 1) {
    chime('win');
    speak(`${playerName} ಆಟವನ್ನು ಗೆದ್ದರು!`, 1, 1.2);
  } else {
    chime('finish');
    speak(`${playerName} ${ordinal(place)} ಸ್ಥಾನ ಪಡೆದರು.`);
  }
}
