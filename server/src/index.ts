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

// (redeploy trigger — no functional change)
const app = express();

app.use(cors({ origin: env.appUrl }));
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
  cors: { origin: env.appUrl },
});
setIo(io);
registerConnectionHandlers(io);

httpServer.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
