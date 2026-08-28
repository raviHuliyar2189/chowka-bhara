import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from './socket';
import { rematchGame, fetchGame } from './api';
import { VoiceChatManager } from './voiceChat';
import type { GameState } from '../game/turnEngine';
import { moverOfLastMove } from '../game/turnEngine';
import { hasAnyLegalMove } from '../game/rules';
import { computePlacements } from '../game/session';
import type { PlayerId } from '../game/paths';
import Board from '../components/Board';
import DiceTray from '../components/DiceTray';
import AppControlsPanel from '../components/AppControlsMenu';
import ReportBugModal from '../components/ReportBugModal';
import ResignModal from '../components/ResignModal';
import {
  announceRoll,
  announceTurnStart,
  announceTurnReverted,
  announceCapture,
  announceFinish,
  announceGattiFormed,
  announceHint,
  announceStuckPool,
  setAnnouncerEnabled,
} from '../audio/announcer';
import { useT } from '../i18n/strings';
import { setChromeHidden } from '../ui/appChrome';

// Disabled at explicit request — voice relies on a STUN-only WebRTC setup with no TURN server
// (see ICE_SERVERS in voiceChat.ts), so any mid-call network change (WiFi/cellular switch, a
// backgrounded tab getting suspended and resumed, etc.) permanently breaks the connection with no
// way to recover, even though the underlying internet connection is fine — a real, reported issue
// with no cheap fix. Pending: either a TURN server (ongoing hosting cost) or ICE-restart handling
// (free, but only helps if the new network path is itself stable). The implementation underneath
// is untouched — flip this back to true once one of those lands, nothing else needs to change.
const VOICE_CHAT_ENABLED = false;

interface Props {
  gameId: string;
  initialState: GameState;
  mySeat: PlayerId;
  // Per-game "Resignation Allowed?" toggle, set at online game creation (see OnlineSetup.tsx) —
  // mirrors hotseat's own toggle. Gates whether the Resign Game button appears below.
  resignAllowed: boolean;
  // Called when this player actively chooses to leave the game-over screen — back to online setup.
  onExit: () => void;
}

// Online-mode gameplay screen — reuses the exact same Board/DiceTray components the local
// hotseat game uses, just driven by the server's broadcast state instead of a local reducer.
// Every action (roll, pick a value, pick a piece, rollback, resign) is sent to the server over
// the socket and applied there; this component only ever renders whatever comes back.
export default function OnlinePlay({ gameId, initialState, mySeat, resignAllowed, onExit }: Props) {
  const t = useT();
  const [game, setGame] = useState<GameState>(initialState);
  const [hint, setHint] = useState<{ text: string; key: number } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [showReportBug, setShowReportBug] = useState(false);
  // Purely informational — resigning is unconditional (the resigning player is already out by the
  // time the server's resign:notice broadcast arrives), same as hotseat's own copy of this state.
  const [resignedPlayerName, setResignedPlayerName] = useState<string | null>(null);
  // Set locally, right when this device's own Resign Game click fires — distinct from
  // resignedPlayerName above, which the resign:notice broadcast sets for *any* player's
  // resignation (everyone sees the same acknowledgment). This one specifically means "it was me,"
  // so a "Leave Game" option can be offered once the game keeps going without this seat — see the
  // resignedStillWatching notice below for why that's needed here but not in hotseat/Vs Computer
  // (there, resigning doesn't strand anyone on a separate device with nothing left to do).
  const [iResigned, setIResigned] = useState(false);
  const [rematching, setRematching] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  // Which seats currently have a live connection — a per-player online/offline indicator (§13).
  // Starts empty (not "everyone offline," just "not known yet") until the first presence:update
  // arrives right after this device's own join is acknowledged.
  const [connectedSeats, setConnectedSeats] = useState<PlayerId[]>([]);
  // Real-time voice chat (§13) — who's currently in the voice channel (not the same as
  // connectedSeats: a player can be connected to the game without having opted into voice), this
  // device's own joined/muted state, per-peer remote audio streams to actually play, and a
  // mic-permission-or-similar error to surface if joining fails.
  const [voiceParticipants, setVoiceParticipants] = useState<PlayerId[]>([]);
  const [inVoice, setInVoice] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Partial<Record<PlayerId, MediaStream>>>({});
  // This device's own real WebRTC connection state to each other voice participant — see
  // Board.tsx's voiceConnectionStates prop for why roster membership alone isn't enough to claim
  // voice is actually working.
  const [peerConnectionStates, setPeerConnectionStates] = useState<
    Partial<Record<PlayerId, RTCPeerConnectionState>>
  >({});
  // A remote peer's audio element can fail to autoplay under a browser's autoplay policy — the
  // WebRTC connection itself completes fine (roster/mic indicators look correct), the track just
  // never becomes audible, silently. This tracks whether that's happened, so a real button click
  // (a guaranteed-valid user gesture) can retry play() on every current audio element.
  const [audioBlocked, setAudioBlocked] = useState(false);
  const audioElsRef = useRef<Map<PlayerId, HTMLAudioElement>>(new Map());
  const voiceRef = useRef<VoiceChatManager | null>(null);
  const socketRef = useRef<Socket | null>(null);
  // The persistent turn banner (replaces reading game.message directly — see i18n/strings.ts)
  // initialized from the rejoining state's own current player, same reasoning as prevRevertSeq
  // below not starting at 0.
  const [banner, setBanner] = useState(() => t('banner.turnStart', initialState.players[initialState.currentTurnIndex].name));
  // Starts from the rejoining/initial state's own revertSeq (not 0) — a player who rejoins mid-
  // game after several reverts already happened shouldn't get a spurious "reverted" announcement
  // on their very first turn-start effect firing. See HotseatPage.tsx's own copy of this ref for
  // the full reasoning (avoiding a race between two speak() calls on the same state transition).
  const prevRevertSeq = useRef(initialState.revertSeq);
  // See HotseatPage.tsx's own copy of this ref — lets the finish effect below tell exactly which
  // id(s) are newly ranked and skip forfeits/eliminations, since insertIntoRankings can insert a
  // finish ahead of an earlier removal rather than always at the array's end. Initialized from the
  // rejoining state's own rankings so a mid-game rejoin doesn't replay past finishes.
  const prevRankingIds = useRef<PlayerId[]>(initialState.rankings);

  // OnlinePlay only ever mounts once live play has actually started (see OnlineGamePage.tsx — the
  // lobby/waiting-room is a separate component), so the board is on screen for this component's
  // entire lifetime — hide the global app header the whole time, same reasoning as HotseatPage.tsx/
  // VsComputerPage.tsx's own conditional copies of this.
  useEffect(() => {
    setChromeHidden(true);
    return () => setChromeHidden(false);
  }, []);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    // Room membership is per-connection, not per-player — socket.io-client reconnects
    // automatically after any transient drop (a network blip, backgrounding on mobile, briefly
    // losing signal), but a reconnect gets a brand-new underlying connection that was never told
    // to join this game's room. Without re-joining here, a client can end up fully connected yet
    // silently outside the room forever after — still "online," but never receiving another
    // game-updated broadcast again (this was a real reported bug: one player stopped hearing any
    // announcements after some point in the game, with no error or visible sign anything was
    // wrong). 'connect' fires for the very first connection too, so this replaces what used to be
    // a single one-time emit outside any event handler.
    function joinRoom() {
      socket.emit('join-lobby-room', { gameId }, (ok: boolean) => {
        if (!ok) return;
        // Catch up on whatever happened while this device was disconnected/reconnecting — the
        // next move might not come from anyone for a while, so don't just wait for one.
        fetchGame(gameId)
          .then((fresh) => {
            if (fresh.state) setGame(fresh.state);
          })
          .catch(() => {});
      });
    }
    socket.on('connect', joinRoom);

    if (VOICE_CHAT_ENABLED) {
      voiceRef.current = new VoiceChatManager(socket, gameId, mySeat, {
        onRosterChange: setVoiceParticipants,
        onRemoteStream: (seat, stream) => {
          setRemoteStreams((prev) => {
            const next = { ...prev };
            if (stream) next[seat] = stream;
            else delete next[seat];
            return next;
          });
        },
        onPeerConnectionState: (seat, state) => {
          setPeerConnectionStates((prev) => ({ ...prev, [seat]: state }));
        },
        onError: (message) => {
          setVoiceError(message);
          setInVoice(false);
        },
      });
    }

    socket.on('game-updated', (state: GameState) => {
      setGame(state);
    });

    // Server-authoritative presence (§13) — broadcast whenever a seat's connection count changes
    // between zero and non-zero (see server/src/realtime/presence.ts), and sent once in full to
    // this socket specifically right after it joins, so a late joiner sees everyone else's current
    // status immediately rather than waiting for the next change.
    socket.on('presence:update', ({ connectedSeats: seats }: { connectedSeats: PlayerId[] }) => {
      setConnectedSeats(seats);
    });

    // Broadcast by the server alongside its own game-updated (see server/src/realtime/resign.ts)
    // — purely informational, shows the same acknowledgment modal hotseat shows locally.
    socket.on('resign:notice', ({ playerName }: { playerName: string }) => {
      setResignedPlayerName(playerName);
    });

    return () => {
      socket.off('connect', joinRoom);
      voiceRef.current?.destroy();
      voiceRef.current = null;
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Mobile browsers can leave a backgrounded tab's socket in limbo (throttled or fully suspended)
  // without ever firing 'disconnect', so joinRoom's own reconnect-triggered catch-up above never
  // runs — same class of bug as OnlineLobby.tsx's own copy of this fix (see its comment for the
  // reported case that prompted it), just here for a live game instead of the waiting room: a
  // player who alt-tabs away mid-game could otherwise come back to a stale board, having missed
  // an opponent's move entirely. Re-checking explicitly on every return to this tab, rather than
  // trusting the socket to notice on its own, closes that gap regardless of why it was backgrounded.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return;
      const socket = socketRef.current;
      if (socket && !socket.connected) socket.connect();
      fetchGame(gameId)
        .then((fresh) => {
          if (fresh.state) setGame(fresh.state);
        })
        .catch(() => {});
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [gameId]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint?.key]);

  useEffect(() => {
    if (game.rollHistory.length === 0) return;
    const last = game.rollHistory[game.rollHistory.length - 1];
    const name = game.players[game.currentTurnIndex].name;
    announceRoll(name, last.label, last.isBonus);
    setBanner(last.isBonus ? t('banner.rollBonus', name, last.label) : t('banner.rollResult', name, last.label));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.rollHistory.length]);

  // Display-only version of HotseatPage.tsx's/VsComputerPage.tsx's own stuck-pool effect: this
  // mode is server-authoritative, so the server (see server/src/realtime/gameplay.ts's
  // maybeScheduleStuckPoolRevert) is the one actually holding the revert for the same delay and
  // then broadcasting the reverted state — this effect only detects the same stuck condition off
  // the state already received and shows the banner/announcement while waiting for that broadcast
  // to arrive, never mutates anything itself.
  useEffect(() => {
    if (game.phase !== 'awaiting-selection' || game.pool.length === 0) return;
    const player = game.players[game.currentTurnIndex];
    if (hasAnyLegalMove(game.players, player, game.pool)) return;
    announceStuckPool(player.name);
    setBanner(t('banner.noLegalMove', player.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.phase, game.pool.length, game.currentTurnIndex]);

  // Spoken immediately when a new turn begins (not just after the 5s idle nudge) — keyed on
  // currentTurnIndex so it fires once per turn change, including the very first turn on mount.
  // Every connected player's device runs this independently off the same synced state, same as
  // the roll/capture/finish announcements above. If this turn change was caused by a revert
  // (stuck pool / finish-with-leftover-dice), that gets its own combined announcement instead —
  // see prevRevertSeq's own comment above.
  useEffect(() => {
    if (game.phase !== 'awaiting-roll') return;
    const name = game.players[game.currentTurnIndex].name;
    if (game.revertSeq !== prevRevertSeq.current) {
      announceTurnReverted(game.lastRevertedPlayer, name);
      setBanner(t('banner.turnReverted', game.lastRevertedPlayer, name));
    } else {
      announceTurnStart(name);
      setBanner(t('banner.turnStart', name));
    }
    prevRevertSeq.current = game.revertSeq;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.currentTurnIndex, game.revertSeq]);

  useEffect(() => {
    if (game.eventSeq === 0) return;
    announceCapture(game.lastCapturePlayer, game.lastCaptureCount);
    setBanner(t('banner.captured', game.lastCapturePlayer, game.lastCaptureCount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.eventSeq]);

  useEffect(() => {
    if (game.gattiSeq === 0) return;
    announceGattiFormed(game.lastGattiPlayer);
    setBanner(t('banner.gattiFormed', game.lastGattiPlayer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.gattiSeq]);

  useEffect(() => {
    const prevIds = prevRankingIds.current;
    const newIds = game.rankings.filter((id) => !prevIds.includes(id));
    prevRankingIds.current = game.rankings;
    for (const id of newIds) {
      const player = game.players.find((p) => p.id === id);
      if (!player || player.hasLost) continue;
      const place = game.rankings.indexOf(id) + 1;
      announceFinish(player.name, place);
      setBanner(place === 1 ? t('banner.won', player.name) : t('banner.finished', player.name, place));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.rankings.length]);

  function handleRoll() {
    socketRef.current?.emit('game:roll', { gameId });
  }
  function handleSelectValue(index: number) {
    socketRef.current?.emit('game:select-value', { gameId, index });
  }
  function handleSelectPiece(pieceId: number) {
    socketRef.current?.emit('game:select-piece', { gameId, pieceId });
  }
  function handleFormGatti(pos: number) {
    socketRef.current?.emit('game:form-gatti', { gameId, pos });
  }
  function handleRollback() {
    socketRef.current?.emit('game:rollback', { gameId });
  }
  function handlePieceClickedBeforeValue() {
    const text = t('hint.selectValueFirst');
    announceHint('hint.selectValueFirst');
    setHint({ text, key: Date.now() });
  }
  function handleResign() {
    setIResigned(true);
    socketRef.current?.emit('game:resign', { gameId });
  }
  async function handleJoinVoice() {
    setVoiceError(null);
    await voiceRef.current?.join();
    if (voiceRef.current?.isJoined()) setInVoice(true);
  }
  function handleLeaveVoice() {
    voiceRef.current?.leave();
    setInVoice(false);
    setMuted(false);
    setRemoteStreams({});
    setPeerConnectionStates({});
    setAudioBlocked(false);
  }
  // Retries play() on every current peer's audio element from inside a real click handler — a
  // guaranteed-valid user gesture, unlike the moment a remote track first arrives (which can be
  // well after the "Join Voice" click that granted mic access, so browsers are free to block it).
  function handleEnableAudioPlayback() {
    for (const el of audioElsRef.current.values()) {
      el.play().catch(() => {});
    }
    setAudioBlocked(false);
  }
  function handleToggleMute() {
    const next = !muted;
    setMuted(next);
    voiceRef.current?.setMuted(next);
  }
  async function handleRematch() {
    setRematching(true);
    setRematchError(null);
    try {
      await rematchGame(gameId);
      // No local transition here on purpose — the game-updated broadcast (already listened for
      // above) carries the fresh state to every participant, the same way for the clicker as for
      // everyone else, so this screen naturally re-renders back into live gameplay.
    } catch (err) {
      setRematchError(err instanceof Error ? err.message : t('online.rematchFailed'));
      setRematching(false);
    }
  }
  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setAnnouncerEnabled(next);
  }

  // Held back while a resign acknowledgment is showing (e.g. this resignation was the one that
  // ended the game) — same ordering as hotseat's own showResults/resignedPlayerName gating, so
  // the "so-and-so resigned" notice always appears before the placements screen, not skipped.
  if (game.phase === 'game-over' && !resignedPlayerName) {
    const placements = computePlacements(game);
    return (
      <div className="setup-inline">
        <div className="modal">
          <h2>{t('online.gameOver')}</h2>
          <ol>
            {placements.map((p) => (
              <li key={p.playerId}>
                <strong>{p.name}</strong> — {p.isLoss ? t('results.loss') : t('results.place', p.place)}
              </li>
            ))}
          </ol>
          {rematchError && <p className="online-error">{rematchError}</p>}
          <div className="actions-row">
            <button className="action-btn btn-start" onClick={handleRematch} disabled={rematching}>
              {rematching ? t('online.starting') : t('online.rematch')}
            </button>
            <button className="action-btn btn-abort" onClick={onExit}>
              {t('online.exit')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isMyTurn = game.players[game.currentTurnIndex].id === mySeat;
  const lastMover = moverOfLastMove(game);
  const canRollback = lastMover !== null && lastMover.id === mySeat;

  return (
    <div className="container">
      <div className="board-container">
        {game.eventSeq > 0 && (
          <div key={game.eventSeq} className="capture-toast">
            {t('game.captureToast', game.lastCapturePlayer, game.lastCaptureCount)}
          </div>
        )}
        <Board
          game={game}
          onSelectPiece={handleSelectPiece}
          onSelectStats={() => {}}
          onPieceClickedBeforeValue={handlePieceClickedBeforeValue}
          onFormGatti={handleFormGatti}
          viewerSeat={mySeat}
          connectedSeats={connectedSeats}
          voiceParticipants={voiceParticipants}
          voiceConnectionStates={peerConnectionStates}
        />
      </div>
      <div className="play-area">
        <div className={`announcer${hint ? ' announcer-hint' : ''}`}>{hint ? hint.text : banner}</div>
        {/* This seat has no moves left in a game that's still going for everyone else — offer a
           way out instead of leaving them stuck spectating with nothing to do. Not shown once the
           acknowledgment modal (resignedPlayerName) is still up, so it doesn't compete for
           attention before that's been dismissed. */}
        {iResigned && !resignedPlayerName && (
          <div className="online-notice">
            <p>{t('online.resignedStillWatching')}</p>
            <button className="action-btn btn-abort" onClick={onExit}>
              {t('online.leaveGame')}
            </button>
          </div>
        )}
        <DiceTray
          game={game}
          onRoll={handleRoll}
          onSelectValue={handleSelectValue}
          showRollback={true}
          canRollback={canRollback}
          onRollback={handleRollback}
          isMyTurn={isMyTurn}
          resignAllowed={resignAllowed}
          onResign={handleResign}
        />
        <AppControlsPanel soundOn={soundOn} onToggleSound={toggleSound} onReportBug={() => setShowReportBug(true)}>
          {/* Voice call setup (§13) — join/leave, mute, and the autoplay-blocked recovery button
              all belong here per the App Controls consolidation; the connection-failure text below
              stays outside this section since it's status the player needs to see without
              scrolling past it, same reasoning as the mic icon's own hover title not being enough
              on a phone (see the "voice not heard" bug fix). Disabled — see VOICE_CHAT_ENABLED's
              own comment at the top of this file. */}
          {VOICE_CHAT_ENABLED && (
            <div className="app-controls-row app-controls-voice">
              {inVoice ? (
                <>
                  <button className="btn-debug-log" onClick={handleLeaveVoice} title={t('voice.leaveTitle')}>
                    {t('voice.leave')}
                  </button>
                  <button
                    className={`btn-sound in-game-sound ${muted ? 'is-off' : 'is-on'}`}
                    onClick={handleToggleMute}
                    title={muted ? t('voice.unmuteTitle') : t('voice.muteTitle')}
                  >
                    {muted ? t('voice.muted') : t('voice.unmuted')}
                  </button>
                </>
              ) : (
                <button className="btn-debug-log" onClick={handleJoinVoice} title={t('voice.joinTitle')}>
                  {t('voice.join')}
                </button>
              )}
              {inVoice && audioBlocked && (
                <button className="btn-debug-log voice-audio-blocked" onClick={handleEnableAudioPlayback}>
                  {t('voice.enableAudio')}
                </button>
              )}
            </div>
          )}
        </AppControlsPanel>
        {VOICE_CHAT_ENABLED && voiceError && <p className="online-error">{voiceError}</p>}
        {/* A hover-only tooltip (the per-player mic icon's title) isn't discoverable on a phone —
            this is the same "voice connection failed" fact as plain, always-visible text instead,
            since this app's players are mostly on mobile (see the "voice not heard" bug this and
            voiceConnectionStates above were both added to fix). */}
        {VOICE_CHAT_ENABLED &&
          inVoice &&
          game.players
            .filter((p) => p.id !== mySeat && peerConnectionStates[p.id] === 'failed')
            .map((p) => (
              <p key={p.id} className="online-error">
                {t('voice.connectFailedNamed', p.name)}
              </p>
            ))}
      </div>

      {/* One hidden audio element per connected voice peer — never rendered visibly, this is
          purely how a received MediaStream actually gets played out loud. Relying on the
          `autoPlay` attribute alone isn't enough: the WebRTC handshake can take long enough after
          the "Join Voice" click that the browser's autoplay policy no longer honors it, silently
          leaving the peer connected (roster/mic indicators look fine) but inaudible — so play() is
          called explicitly here, and a rejection surfaces the "tap to enable audio" fallback above
          (a real click always satisfies the browser's user-gesture requirement). */}
      {Object.entries(remoteStreams).map(([seat, stream]) => (
        <audio
          key={seat}
          ref={(el) => {
            if (!el) {
              audioElsRef.current.delete(seat as PlayerId);
              return;
            }
            audioElsRef.current.set(seat as PlayerId, el);
            if (el.srcObject !== stream) el.srcObject = stream as MediaStream;
            el.play().catch(() => setAudioBlocked(true));
          }}
          autoPlay
          playsInline
          style={{ display: 'none' }}
        />
      ))}

      {resignedPlayerName && (
        <ResignModal playerName={resignedPlayerName} onDismiss={() => setResignedPlayerName(null)} />
      )}
      {showReportBug && (
        <ReportBugModal mode="online" gameId={gameId} debugLog={game.debugLog} onClose={() => setShowReportBug(false)} />
      )}
    </div>
  );
}
