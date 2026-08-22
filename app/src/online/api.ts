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

export function requestMagicLink(email: string): Promise<void> {
  return request('/auth/request-link', { method: 'POST', body: JSON.stringify({ email }) });
}

export interface ConfirmResult {
  status: 'needs-profile' | 'logged-in';
  email?: string;
  pendingToken?: string;
  player?: PlayerInfo;
}

export function confirmMagicLink(token: string): Promise<ConfirmResult> {
  return request(`/auth/confirm?token=${encodeURIComponent(token)}`);
}

export function completeProfile(
  pendingToken: string,
  displayName: string
): Promise<{ status: string; player: PlayerInfo }> {
  return request('/auth/complete-profile', {
    method: 'POST',
    body: JSON.stringify({ pendingToken, displayName }),
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

export function fetchPlayers(): Promise<PlayerInfo[]> {
  return request<{ players: PlayerInfo[] }>('/players').then((r) => r.players);
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
  seats: SeatInfo[];
  allJoined: boolean;
}

export function createGame(seats: Record<string, string>): Promise<LobbyState> {
  return request<{ game: LobbyState }>('/games', {
    method: 'POST',
    body: JSON.stringify({ seats }),
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
