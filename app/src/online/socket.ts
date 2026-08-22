import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function connectSocket(): Socket {
  return io(API_URL, { auth: { token: getToken() } });
}
