import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from './socket';
import { rematchGame, fetchGame } from './api';
import { VoiceChatManager } from './voiceChat';
import type { GameState } from '../game/turnEngine';
import { moverOfLastMove } from '../game/turnEngine';
import { computePlacements } from '../game/session';
import type { PlayerId } from '../game/paths';
import Board from '../components/Board';
import DiceTray from '../components/DiceTray';
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
  setAnnouncerEnabled,
} from '../audio/announcer';
import { useT } from '../i18n/strings';

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
      onError: (message) => {
        setVoiceError(message);
        setInVoice(false);
      },
    });

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
          <button className="action-btn btn-start" onClick={handleRematch} disabled={rematching}>
            {rematching ? t('online.starting') : t('online.rematch')}
          </button>
          <button className="action-btn btn-abort" style={{ marginTop: 8 }} onClick={onExit}>
            {t('online.exit')}
          </button>
        </div>
      </div>
    );
  }

  const isMyTurn = game.players[game.currentTurnIndex].id === mySeat;
  const lastMover = moverOfLastMove(game);
  const showRollback = lastMover !== null && lastMover.id === mySeat;

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
        />
      </div>
      <div className="play-area">
        <div className={`announcer${hint ? ' announcer-hint' : ''}`}>{hint ? hint.text : banner}</div>
        <DiceTray
          game={game}
          onRoll={handleRoll}
          onSelectValue={handleSelectValue}
          showRollback={showRollback}
          onRollback={handleRollback}
          isMyTurn={isMyTurn}
        />
        <div className="post-dice-actions">
          {resignAllowed && (
            <button className="action-btn btn-abort" onClick={handleResign}>
              {t('resign.gameButton')}
            </button>
          )}
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
          <button className="btn-debug-log" onClick={() => setShowReportBug(true)} title={t('game.reportBugTitle')}>
            {t('game.reportBug')}
          </button>
          <button
            className={`btn-sound in-game-sound ${soundOn ? 'is-on' : 'is-off'}`}
            onClick={toggleSound}
            title={soundOn ? t('setup.muteTitle') : t('setup.unmuteTitle')}
          >
            {soundOn ? t('game.soundOn') : t('game.muted')}
          </button>
        </div>
        {voiceError && <p className="online-error">{voiceError}</p>}
      </div>

      {/* One hidden auto-playing audio element per connected voice peer — never rendered visibly,
          this is purely how a received MediaStream actually gets played out loud. */}
      {Object.entries(remoteStreams).map(([seat, stream]) => (
        <audio
          key={seat}
          ref={(el) => {
            if (el) el.srcObject = stream as MediaStream;
          }}
          autoPlay
          style={{ display: 'none' }}
        />
      ))}

      {resignedPlayerName && (
        <ResignModal playerName={resignedPlayerName} onDismiss={() => setResignedPlayerName(null)} />
      )}
      {showReportBug && <ReportBugModal debugLog={game.debugLog} onClose={() => setShowReportBug(false)} />}
    </div>
  );
}
