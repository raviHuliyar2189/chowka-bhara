import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '../game/turnEngine';
import type { PlayerId } from '../game/paths';
import { canFormGatti, canMovePiece } from '../game/rules';
import { useT } from '../i18n/strings';
import { getLanguage } from '../i18n/language';
import { announceHint } from '../audio/announcer';
import { isVoiceCommandsSupported } from './capability';
import { matchIntent } from './phrases';

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
  press: () => void;
  release: () => void;
  confirmResign: () => void;
}

const CONFIRM_RESIGN_TIMEOUT_MS = 4000;
const FEEDBACK_CLEAR_MS = 2200;

// One shared hook rather than one copy per gameplay page — HotseatPage.tsx, VsComputerPage.tsx,
// and OnlinePlay.tsx already define handleRoll/handleSelectValue/handleSelectPiece/
// handleFormGatti/handleResign with identical signatures (only the bodies differ: local reducer
// calls vs. socket emits), so this hook only ever needs those references, never their internals.
export function useVoiceCommands(args: UseVoiceCommandsArgs): VoiceCommandsState {
  const { enabled, game, viewerSeat, isMyTurn, resignAllowed, onRoll, onSelectValue, onSelectPiece, onFormGatti, onResign } =
    args;
  const t = useT();
  const supported = useMemo(() => isVoiceCommandsSupported(), []);

  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef<VoiceStatus>('idle');

  function setStatusBoth(next: VoiceStatus) {
    statusRef.current = next;
    setStatus(next);
  }

  function showFeedback(key: string, ...msgArgs: unknown[]) {
    const text = t(key, ...msgArgs);
    setFeedback(text);
    announceHint(key);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => setFeedback(null), FEEDBACK_CLEAR_MS);
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
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `game` is narrowed non-null by press() before this is ever wired up as onresult's handler —
  // taken as a parameter (not read from the outer closure) so that narrowing is explicit here too.
  function handleTranscript(rawTranscript: string, game: GameState) {
    const intent = matchIntent(rawTranscript);

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

    switch (intent.kind) {
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
        showFeedback('voiceCmd.notRecognized');
      }
    }
  }

  function press() {
    if (!enabled || !supported || !game || recognitionRef.current) return;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = getLanguage() === 'kn' ? 'kn-IN' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setStatusBoth('processing');
      handleTranscript(transcript, game);
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setStatusBoth('error');
        showFeedback('voiceCmd.micPermissionDenied');
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setStatusBoth('unrecognized');
        showFeedback('voiceCmd.notRecognized');
      } else {
        setStatusBoth('idle');
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      // Only fall back to idle here if nothing else already moved status on (onresult sets
      // 'processing' then resolves to a final status synchronously; onerror resolves its own).
      if (statusRef.current === 'listening') setStatusBoth('idle');
    };

    recognitionRef.current = recognition;
    setStatusBoth('listening');
    setFeedback(null);
    recognition.start();
  }

  function release() {
    recognitionRef.current?.stop();
  }

  return { supported, status, feedback, press, release, confirmResign };
}
