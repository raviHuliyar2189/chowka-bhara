import { useSyncExternalStore } from 'react';

// Whether the global app header (title/version on the welcome page only now, plus the language
// toggle everywhere else — see App.tsx's AppHeader) should render at all. The live gameplay screen
// (board + dice visible) hides it entirely so that vertical space goes to the board instead (see
// REQUIREMENTS.md's Decisions log for this change) — each of Hotseat/VsComputer/OnlinePlay flips
// this on for exactly as long as it's showing that view, via useHideAppChrome below. Plain
// module-level singleton, same pattern as i18n/language.ts's own `current` + listeners — there's
// exactly one of these, not something scoped per-subtree, so a Context Provider would add ceremony
// without buying anything.
let hidden = false;
const listeners = new Set<() => void>();

export function isChromeHidden(): boolean {
  return hidden;
}

export function setChromeHidden(next: boolean): void {
  if (next === hidden) return;
  hidden = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Re-renders App.tsx's header whenever any page flips the flag.
export function useChromeHidden(): boolean {
  return useSyncExternalStore(subscribe, isChromeHidden, isChromeHidden);
}
