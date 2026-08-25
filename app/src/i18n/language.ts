// Global, app-wide language preference — one value for the whole app (not per-game), persisted
// across visits. Plain module-level singleton (same pattern announcer.ts's own `enabled` flag
// already uses) rather than React Context: there's exactly one of these, not something scoped
// per-subtree, so a Provider would add ceremony without buying anything.

export type Lang = 'en' | 'kn';

const STORAGE_KEY = 'chowka-language';

function readStored(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'kn' ? 'kn' : 'en';
  } catch {
    return 'en';
  }
}

let current: Lang = readStored();
const listeners = new Set<() => void>();

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Best-effort persistence only — the in-memory value still updates and the app still works
    // for this session even if storage is unavailable (private browsing, quota, etc.).
  }
  listeners.forEach((l) => l());
}

export function subscribeLanguage(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
