import { Router } from 'express';
import { pool } from '../db/pool';
import { readSession, requireAuth } from '../auth/middleware';

export const bugReportsRouter = Router();
bugReportsRouter.use(readSession, requireAuth);

const VALID_MODES = new Set(['hotseat', 'vs-computer', 'online', 'develop-test']);

// POST /bug-reports — the collated report a player composes via ReportBugModal.tsx (their own
// observation/expected/suggestion text plus this game's debugLog), saved for later analysis
// rather than only ever leaving the device via a manual clipboard-paste-into-WhatsApp as before.
// gameId is only meaningful for online (the one mode with a server-side game row); hotseat/
// vs-computer/develop-test always send it as null.
bugReportsRouter.post('/bug-reports', async (req, res) => {
  const { mode, gameId, observation, expected, suggestion, debugLog } = req.body ?? {};

  if (typeof mode !== 'string' || !VALID_MODES.has(mode)) {
    res.status(400).json({ error: 'A valid mode is required.' });
    return;
  }
  if (gameId !== null && gameId !== undefined && typeof gameId !== 'string') {
    res.status(400).json({ error: 'gameId must be a string or null.' });
    return;
  }
  if (!Array.isArray(debugLog) || !debugLog.every((line) => typeof line === 'string')) {
    res.status(400).json({ error: 'debugLog must be an array of strings.' });
    return;
  }

  await pool.query(
    `insert into bug_reports (reporter_id, mode, game_id, observation, expected, suggestion, debug_log)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      req.player!.playerId,
      mode,
      gameId ?? null,
      typeof observation === 'string' ? observation : '',
      typeof expected === 'string' ? expected : '',
      typeof suggestion === 'string' ? suggestion : '',
      debugLog.join('\n'),
    ]
  );

  res.status(201).json({ ok: true });
});
