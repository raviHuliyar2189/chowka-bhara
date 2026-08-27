import type { GameState } from '../game/turnEngine';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// A bearer token in localStorage, not a cookie — the frontend (Vercel) and backend (Render) are
// different domains, which makes a session cookie a third-party cookie that browsers increasingly
// block by default. A token the client attaches itself sidesteps that entirely.
const TOKEN_KEY = 'chowka_token';

// Some in-app browsers (notably some versions of WhatsApp's/Instagram's own link-opening
// webview) run pages with restricted storage access, where localStorage.getItem/setItem throws
// a SecurityError instead of just being unavailable — exactly the context an invite link gets
// opened in. Guarded here the same way language.ts's own persistence already is, so a player on
// such a browser still reaches the sign-in screen (just without a token to auto-restore) instead
// of the whole app failing to render.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Best-effort — the session just won't survive a reload on a browser that blocks storage.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clear if storage was never writable to begin with.
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const resp = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    // A 401 on an authenticated request means the server has rejected this token outright — not
    // just "this specific action needs auth," since every route here already requires it (see
    // requireAuth's own comment: a validly-*signed* token can still point at a player that no
    // longer exists, e.g. after a data reset). Clearing it here means the next thing that calls
    // fetchMe() (a reload, most naturally) lands cleanly on the login screen instead of presenting
    // this same now-useless token again.
    if (resp.status === 401 && token) clearToken();
    throw new Error(body.error ?? `Request failed (${resp.status})`);
  }
  return body as T;
}

export interface PlayerInfo {
  id: string;
  email: string;
  displayName: string;
}

export type LoginResult = { status: 'logged-in'; player: PlayerInfo } | { status: 'no-account'; email: string };

// No password, no verification — the email alone identifies a returning player. A 404 response
// (status 'no-account') means the caller should offer sign-up instead.
export async function login(email: string): Promise<LoginResult> {
  const resp = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body = await resp.json().catch(() => ({}));
  if (resp.status === 404) return { status: 'no-account', email };
  if (!resp.ok) throw new Error(body.error ?? `Request failed (${resp.status})`);
  setToken(body.token);
  return body as LoginResult;
}

export async function signup(email: string, displayName: string): Promise<{ status: string; player: PlayerInfo }> {
  const body = await request<{ status: string; token: string; player: PlayerInfo }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, displayName }),
  });
  setToken(body.token);
  return body;
}

export async function fetchMe(): Promise<PlayerInfo | null> {
  if (!getToken()) return null;
  try {
    const result = await request<{ player: PlayerInfo }>('/auth/me');
    return result.player;
  } catch {
    return null;
  }
}

export interface SeatInfo {
  seat: string;
  playerId: string;
  displayName: string;
  email: string;
  status: 'joined' | 'declined';
  joinedAt: string | null;
}

export interface LobbyState {
  id: string;
  status: string;
  createdBy: string;
  createdByName: string;
  seatCount: number;
  resignAllowed: boolean;
  state: GameState | null;
  seats: SeatInfo[];
  joinedCount: number;
  canStart: boolean;
}

export function createGame(seatCount: number, resignAllowed: boolean): Promise<LobbyState> {
  return request<{ game: LobbyState }>('/games', {
    method: 'POST',
    body: JSON.stringify({ seatCount, resignAllowed }),
  }).then((r) => r.game);
}

export function fetchGame(gameId: string): Promise<LobbyState> {
  return request<{ game: LobbyState }>(`/games/${gameId}`).then((r) => r.game);
}

export function joinGame(gameId: string): Promise<LobbyState> {
  return request<{ game: LobbyState }>(`/games/${gameId}/join`, { method: 'POST' }).then((r) => r.game);
}

export function declineGame(gameId: string): Promise<LobbyState> {
  return request<{ game: LobbyState }>(`/games/${gameId}/decline`, { method: 'POST' }).then((r) => r.game);
}

export function abortLobby(gameId: string): Promise<void> {
  return request<void>(`/games/${gameId}/abort-lobby`, { method: 'POST' });
}

export function startGame(gameId: string): Promise<GameState> {
  return request<{ game: GameState }>(`/games/${gameId}/start`, { method: 'POST' }).then((r) => r.game);
}

export function rematchGame(gameId: string): Promise<GameState> {
  return request<{ game: GameState }>(`/games/${gameId}/rematch`, { method: 'POST' }).then((r) => r.game);
}
