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

function speak(text: string, rate = 1, pitch = 1): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  // English, not Kannada — many devices/browsers have no Kannada voice installed, which either
  // fails to speak at all or mangles the text through a fallback voice that can't pronounce it.
  // An English voice is close to universally available, so the announcement actually gets heard
  // in full. The on-screen text (game.message, hints) stays Kannada; only what's spoken changed.
  utter.lang = 'en-US';
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
// announcement is a complete instruction on its own.
export function announceRoll(playerName: string, label: string, isBonus: boolean): void {
  if (isBonus) {
    chime('bonus');
    speak(`${playerName} rolled ${label}! Bonus roll — roll again.`, 1.15, 1.3);
  } else {
    speak(`${playerName} rolled ${label}. Move your piece.`);
  }
}

// Spoken the moment a new turn begins.
export function announceTurnStart(playerName: string, awaitingRoll: boolean): void {
  const action = awaitingRoll ? 'roll the dice' : 'move your piece';
  speak(`${playerName}, it's your turn — ${action}.`);
}

// Spoken whenever a stuck turn (or a finish reached with pool values still unplayed) gets undone
// — otherwise this only ever showed up as on-screen text, easy to miss mid-game. Combined with
// the next turn's own announcement into one utterance rather than firing both separately, since
// speak() always cancels-and-replaces (no queueing) — a second call right after this one would
// just cut it off before it finished.
export function announceTurnReverted(revertedPlayerName: string, nextPlayerName: string): void {
  speak(
    `${revertedPlayerName} couldn't play out all the dice — that turn is undone. ${nextPlayerName}, it's your turn — roll the dice.`
  );
}

// Capturing always grants a bonus roll (§5.6) — say so, not just the capture itself, so this
// announcement is a complete instruction like the others.
export function announceCapture(playerName: string, count: number): void {
  chime('capture');
  const what = count > 1 ? `${count} pieces` : 'a piece';
  speak(`${playerName} captured ${what}! Roll again.`, 1.1, 1.15);
}

// A short spoken nudge for UI-only guidance (e.g. "pick a value first") — no chime, doesn't
// touch the persistent game message, just a transient voice hint.
export function announceHint(text: string): void {
  speak(text);
}

function ordinal(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

export function announceFinish(playerName: string, place: number): void {
  if (place === 1) {
    chime('win');
    speak(`${playerName} won the game!`, 1, 1.2);
  } else {
    chime('finish');
    speak(`${playerName} finished in ${ordinal(place)} place.`);
  }
}
