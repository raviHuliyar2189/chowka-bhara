import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../game/turnEngine';
import type { PlayerId } from '../game/paths';
import { canFormGatti, canMovePiece } from '../game/rules';
import { useT } from '../i18n/strings';
import { announceHint } from '../audio/announcer';
import { isVoiceCommandsSupported } from './capability';
import { matchIntent, type VoiceIntent } from './phrases';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'unrecognized' | 'confirm-resign' | 'error';

export interface UseVoiceCommandsArgs {
  // The page's own voice on/off toggle — a disabled hook still reports `supported` correctly
  // (so the toggle itself can be shown), it just never actually starts listening.
  enabled: boolean;
  // Nullable because HotseatPage.tsx calls every hook unconditionally even during its setup
  // screen, before a game exists — press() is simply a no-op until game is non-null.
  game: GameState | null;
  viewerSeat: PlayerId;
  isMyTurn: boolean;
  resignAllowed: boolean;
  // Whether this game offers roll-back at all (a per-game setting; always false in Vs Computer),
  // and whether there's actually a move of this player's own to undo right now — mirrors
  // DiceTray's own showRollback/canRollback split so voice and the button agree on availability.
  showRollback: boolean;
  canRollback: boolean;
  onRollback: () => void;
  onRoll: () => void;
  onSelectValue: (index: number) => void;
  onSelectPiece: (pieceId: number) => void;
  onFormGatti: (pos: number) => void;
  onResign: () => void;
}

export interface VoiceCommandsState {
  supported: boolean;
  status: VoiceStatus;
  feedback: string | null;
  // Raw debug readout of the last press: every alternative the recognizer returned and the command
  // it was matched to. Unlike `feedback` it is shown for every press, success or not, and stays
  // until the next press.
  heard: string | null;
  press: () => void;
  release: () => void;
  confirmResign: () => void;
}

const CONFIRM_RESIGN_TIMEOUT_MS = 4000;
const RELEASE_GRACE_MS = 700;

function describeIntent(intent: VoiceIntent): string {
  switch (intent.kind) {
    case 'select-value':
      return `select value ${intent.value}`;
    case 'select-piece':
      return `select piece ${intent.pieceNumber}`;
    case 'number':
      return `number ${intent.value}`;
    case 'unrecognized':
      return 'not recognized';
    default:
      return intent.kind;
  }
}

// One shared hook rather than one copy per gameplay page — HotseatPage.tsx, VsComputerPage.tsx,
// and OnlinePlay.tsx already define handleRoll/handleSelectValue/handleSelectPiece/
// handleFormGatti/handleResign with identical signatures (only the bodies differ: local reducer
// calls vs. socket emits), so this hook only ever needs those references, never their internals.
export function useVoiceCommands(args: UseVoiceCommandsArgs): VoiceCommandsState {
  const {
    enabled,
    game,
    viewerSeat,
    isMyTurn,
    resignAllowed,
    showRollback,
    canRollback,
    onRollback,
    onRoll,
    onSelectValue,
    onSelectPiece,
    onFormGatti,
    onResign,
  } = args;
  const t = useT();
  const supported = useMemo(() => isVoiceCommandsSupported(), []);

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [heard, setHeard] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<VoiceStatus>('idle');

  function setStatusBoth(next: VoiceStatus) {
    statusRef.current = next;
    setStatus(next);
  }

  function showFeedback(key: string, ...msgArgs: unknown[]) {
    const text = t(key, ...msgArgs);
    setFeedback(text);
    announceHint(key);
    // Deliberately no auto-clear timer: the message (and the button state it explains) stays until the
    // next press() clears it, so the player can read what was heard / why it failed at their own pace.
  }

  function clearConfirmTimeout() {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = null;
    }
  }

  function doResign() {
    clearConfirmTimeout();
    onResign();
    setStatusBoth('idle');
    setFeedback(null);
  }

  function confirmResign() {
    if (statusRef.current === 'confirm-resign') doResign();
  }

  // Cleanup on unmount — stop any open session and pending timers so nothing fires after the
  // page (or game) this hook was set up for is gone.
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      clearConfirmTimeout();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `game` is narrowed non-null by press() before this is ever wired up as onresult's handler —
  // taken as a parameter (not read from the outer closure) so that narrowing is explicit here too.
  // `transcripts` is every alternative the recognizer offered (see press()'s maxAlternatives),
  // most-confident first — tried in order, first one that actually matches something wins. This
  // covers a real reported case where the top guess for a multi-word phrase like "piece 3" came
  // back empty/garbled while a lower-ranked alternative had the real words.
  function handleTranscript(transcripts: string[], game: GameState) {
    let intent: VoiceIntent = { kind: 'unrecognized' };
    let matchedTranscript = '';
    // Two passes: a real command in *any* alternative beats a bare number in an earlier one (a
    // number is the loosest match there is — it shouldn't shadow "roll back" ranked second).
    for (const wantNumber of [false, true]) {
      for (const t of transcripts) {
        const candidate = matchIntent(t);
        if (candidate.kind === 'unrecognized' || (candidate.kind === 'number') !== wantNumber) continue;
        intent = candidate;
        matchedTranscript = t;
        break;
      }
      if (intent.kind !== 'unrecognized') break;
    }
    // For diagnostic feedback when nothing matched — show whatever the recognizer's top,
    // non-empty guess was, even though it didn't match anything.
    const rawTranscript = matchedTranscript || transcripts.find((t) => t.trim()) || '';

    setHeard(
      `Heard: ${transcripts.length ? transcripts.map((t) => `"${t}"`).join(' | ') : '(nothing)'} → ${describeIntent(intent)}`,
    );

    // A pending resign confirmation is resolved by hearing "resign" a second time; hearing
    // anything else cancels the pending confirmation and falls through to handle the new intent
    // normally, rather than leaving the player stuck until the timeout.
    if (statusRef.current === 'confirm-resign') {
      clearConfirmTimeout();
      if (intent.kind === 'resign') {
        doResign();
        return;
      }
    }

    // A bare number ("3") — keywords like "piece"/"select" are optional at explicit request, since
    // pronunciation made them unreliable — means whatever the game is waiting for right now:
    //  - no dice value picked yet  -> a dice value ("select value 3");
    //  - a value already picked    -> a piece ("piece 3"), unless that piece can't use the picked
    //    value and the number is another value still in the pool, in which case the player is
    //    switching to that value instead.
    if (intent.kind === 'number') {
      const n = intent.value;
      if (!isMyTurn) {
        setStatusBoth('unrecognized');
        showFeedback('voiceCmd.notYourTurn');
        return;
      }
      if (game.phase === 'awaiting-roll') {
        setStatusBoth('unrecognized');
        showFeedback('voiceCmd.rollFirst');
        return;
      }
      if (game.phase === 'awaiting-selection') {
        if (game.selectedPoolIndex === null) {
          intent = { kind: 'select-value', value: n };
        } else {
          const player = game.players.find((p) => p.id === viewerSeat);
          const piece = player?.pieces.find((p) => p.id === n);
          const selectedVal = game.pool[game.selectedPoolIndex];
          const pieceCanMove = !!player && !!piece && canMovePiece(game.players, player, piece, selectedVal);
          intent =
            !pieceCanMove && game.pool.includes(n)
              ? { kind: 'select-value', value: n }
              : { kind: 'select-piece', pieceNumber: n };
        }
      }
    }

    switch (intent.kind) {
      case 'rollback': {
        if (!showRollback) {
          setStatusBoth('unrecognized');
          showFeedback('voiceCmd.rollbackUnavailable');
          return;
        }
        if (!canRollback) {
          setStatusBoth('unrecognized');
          showFeedback('voiceCmd.nothingToRollBack');
          return;
        }
        onRollback();
        setStatusBoth('idle');
        setFeedback(null);
        return;
      }
      case 'roll': {
        if (game.phase !== 'awaiting-roll' || !isMyTurn) {
          setStatusBoth('unrecognized');
          showFeedback('voiceCmd.notYourTurn');
          return;
        }
        onRoll();
        setStatusBoth('idle');
        setFeedback(null);
        return;
      }
      case 'select-value': {
        // Also covers a pending bonus reroll (a Bhara/Chauka result keeps phase at
        // 'awaiting-roll' even though its value already shows in the pool) — the reducer itself
        // would just no-op in that phase anyway, but checking here gives real feedback instead
        // of silently doing nothing.
        const index = game.phase === 'awaiting-selection' ? game.pool.indexOf(intent.value) : -1;
        if (index === -1) {
          setStatusBoth('unrecognized');
          showFeedback('voiceCmd.valueUnavailable');
          return;
        }
        onSelectValue(index);
        setStatusBoth('idle');
        setFeedback(null);
        return;
      }
      case 'select-piece': {
        const player = game.players.find((p) => p.id === viewerSeat);
        const piece = player?.pieces.find((p) => p.id === intent.pieceNumber);
        if (!player || !piece) {
          setStatusBoth('unrecognized');
          showFeedback('voiceCmd.noSuchPiece', intent.pieceNumber);
          return;
        }
        if (game.selectedPoolIndex === null) {
          setStatusBoth('unrecognized');
          showFeedback('hint.selectValueFirst');
          return;
        }
        const selectedVal = game.pool[game.selectedPoolIndex];
        if (!canMovePiece(game.players, player, piece, selectedVal)) {
          setStatusBoth('unrecognized');
          showFeedback('voiceCmd.pieceNoLegalMove', intent.pieceNumber);
          return;
        }
        onSelectPiece(piece.id);
        setStatusBoth('idle');
        setFeedback(null);
        return;
      }
      case 'form-gatti': {
        const player = game.players.find((p) => p.id === viewerSeat);
        const selectedVal = game.selectedPoolIndex !== null ? game.pool[game.selectedPoolIndex] : null;
        const positions = player ? new Set(player.pieces.map((p) => p.pos)) : new Set<number>();
        let gattiPos: number | null = null;
        if (player && selectedVal === 2) {
          for (const pos of positions) {
            if (canFormGatti(player, pos, 2)) {
              gattiPos = pos;
              break;
            }
          }
        }
        if (gattiPos === null) {
          setStatusBoth('unrecognized');
          showFeedback('voiceCmd.noGattiAvailable');
          return;
        }
        onFormGatti(gattiPos);
        setStatusBoth('idle');
        setFeedback(null);
        return;
      }
      case 'resign': {
        if (!resignAllowed) {
          setStatusBoth('unrecognized');
          showFeedback('voiceCmd.resignNotAllowed');
          return;
        }
        setStatusBoth('confirm-resign');
        showFeedback('voiceCmd.confirmResignPrompt');
        confirmTimeoutRef.current = setTimeout(() => {
          setStatusBoth('idle');
          setFeedback(null);
        }, CONFIRM_RESIGN_TIMEOUT_MS);
        return;
      }
      case 'unrecognized':
      default: {
        setStatusBoth('unrecognized');
        // A real reported case: onresult fires (not onerror) but with a genuinely empty
        // transcript — the recognizer's own best guess was blank rather than raising 'no-speech'.
        // Without this check it fell into the generic notRecognized(undefined) branch, showing
        // the same plain "Didn't catch that" as a true recognizer failure with no way to tell the
        // two apart.
        const heard = rawTranscript.trim();
        if (heard) showFeedback('voiceCmd.notRecognized', heard);
        else showFeedback('voiceCmd.noSpeechDetected');
      }
    }
  }

  function press() {
    if (!enabled || !supported || !game || recognitionRef.current) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    // Limited to English only for now, regardless of the app's own language setting — Kannada
    // recognition (kn-IN) was unreliable enough in practice that it's being deferred rather than
    // shipped half-working. The phrase lists in phrases.ts still include the Kannada/romanized
    // variants unchanged, so re-enabling later is just switching this back to a getLanguage()-
    // based choice, not rebuilding the matcher.
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    // More than one candidate transcript — a real reported case had the recognizer's own top
    // guess come back empty for a multi-word phrase ("piece 3") while a short one-word phrase
    // ("roll") kept transcribing fine; checking a few alternatives costs nothing and gives the
    // matcher a chance at whichever candidate actually has content.
    recognition.maxAlternatives = 8;

    // Which lifecycle events fired — only used to explain a session that ends with no result and no
    // error (see onend), which otherwise leaves the debug line blank.
    const seen = { result: false, error: false, audio: false, speech: false };
    recognition.onaudiostart = () => {
      seen.audio = true;
    };
    recognition.onspeechstart = () => {
      seen.speech = true;
    };
    recognition.onresult = (event) => {
      seen.result = true;
      const result = event.results[0];
      const transcripts: string[] = [];
      if (result) {
        for (let i = 0; i < result.length; i++) {
          const t = result[i]?.transcript;
          if (t) transcripts.push(t);
        }
      }
      setStatusBoth('processing');
      handleTranscript(transcripts, game);
    };
    recognition.onerror = (event) => {
      seen.error = true;
      recognitionRef.current = null;
      if (event.error !== 'aborted') setHeard(`Heard: (nothing) → error: ${event.error}`);
      // Distinct from a transcript that didn't match anything (handleTranscript's own
      // 'unrecognized' case, which does have text to show) — these are the recognizer failing
      // *before* ever producing a transcript. 'aborted' is release() calling stop() early on
      // purpose, so it gets no feedback at all — that's an intentional cancel, not a failure.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setStatusBoth('error');
        showFeedback('voiceCmd.micPermissionDenied');
      } else if (event.error === 'no-speech') {
        setStatusBoth('unrecognized');
        showFeedback('voiceCmd.noSpeechDetected');
      } else if (event.error !== 'aborted') {
        setStatusBoth('unrecognized');
        showFeedback('voiceCmd.recognitionError', event.error);
      } else {
        setStatusBoth('idle');
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      if (!seen.result && !seen.error) {
        setHeard(
          `Heard: (nothing) → session ended with no result (mic opened: ${seen.audio ? 'yes' : 'no'}, speech detected: ${seen.speech ? 'yes' : 'no'})`,
        );
      }
      // Only fall back to idle here if nothing else already moved status on (onresult sets
      // 'processing' then resolves to a final status synchronously; onerror resolves its own).
      if (statusRef.current === 'listening') setStatusBoth('idle');
    };

    recognitionRef.current = recognition;
    setStatusBoth('listening');
    setFeedback(null);
    setHeard(null);
    recognition.start();
  }

  // A one-word command ("3") is over in a fraction of a second, and stopping the recognizer the
  // instant the finger lifts often cut it off before it had captured or transcribed anything —
  // result: nothing heard. So stopping is deferred slightly, letting trailing audio and a still-
  // starting session finish; the recognizer also ends by itself once it detects the speech has ended.
  function release() {
    const rec = recognitionRef.current;
    if (!rec) return;
    setTimeout(() => {
      if (recognitionRef.current === rec) rec.stop();
    }, RELEASE_GRACE_MS);
  }

  return { supported, status, feedback, heard, press, release, confirmResign };
}
