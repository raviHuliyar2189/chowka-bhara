import { createServer } from 'http';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import { env } from './env';
import { authRouter } from './auth/routes';
import { gamesRouter } from './games/routes';
import { bugReportsRouter } from './bugReports/routes';
import { setIo } from './realtime/io';
import { registerConnectionHandlers } from './realtime/connection';

const app = express();

// Allows the one fixed production origin (APP_URL) plus any Vercel Preview Deployment of this
// same project — those get a fresh, unpredictable URL per build (e.g.
// chowka-bhara-<hash>-chowka-dev.vercel.app), so no single static origin can ever cover them.
// Needed for testing a branch on Vercel's automatic preview URL against this backend before
// merging to main — without this, every request from a preview URL fails CORS with an opaque
// "Failed to fetch" and no way to allowlist the URL in advance.
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/chowka-bhara-[a-z0-9]+-chowka-dev\.vercel\.app$/;
function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // same-origin / non-browser requests (e.g. curl) send no Origin header
  return origin === env.appUrl || VERCEL_PREVIEW_ORIGIN.test(origin);
}
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    callback(null, isAllowedOrigin(origin));
  },
};

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/auth', authRouter);
app.use(gamesRouter);
app.use(bugReportsRouter);

// Express 5 forwards rejected promises from async route handlers here automatically — this is
// just the final safety net so a thrown/rejected error becomes a clean 500 instead of hanging
// the request or crashing the process.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
};
app.use(errorHandler);

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: corsOptions,
});
setIo(io);
registerConnectionHandlers(io);

httpServer.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
