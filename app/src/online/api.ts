import type { GameState } from '../game/turnEngine';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
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
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const body = await resp.json().catch(() => ({}));
  if (resp.status === 404) return { status: 'no-account', email };
  if (!resp.ok) throw new Error(body.error ?? `Request failed (${resp.status})`);
  return body as LoginResult;
}

export function signup(email: string, displayName: string): Promise<{ status: string; player: PlayerInfo }> {
  return request('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, displayName }),
  });
}

export async function fetchMe(): Promise<PlayerInfo | null> {
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
  status: 'invited' | 'joined';
  joinedAt: string | null;
}

export interface LobbyState {
  id: string;
  status: string;
  createdBy: string;
  seatCount: number;
  seats: SeatInfo[];
  allJoined: boolean;
}

export function createGame(seatCount: number): Promise<LobbyState> {
  return request<{ game: LobbyState }>('/games', {
    method: 'POST',
    body: JSON.stringify({ seatCount }),
  }).then((r) => r.game);
}

export function fetchGame(gameId: string): Promise<LobbyState> {
  return request<{ game: LobbyState }>(`/games/${gameId}`).then((r) => r.game);
}

export function joinGame(gameId: string): Promise<LobbyState> {
  return request<{ game: LobbyState }>(`/games/${gameId}/join`, { method: 'POST' }).then((r) => r.game);
}

export function startGame(gameId: string): Promise<GameState> {
  return request<{ game: GameState }>(`/games/${gameId}/start`, { method: 'POST' }).then((r) => r.game);
}
