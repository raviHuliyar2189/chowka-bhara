import { useSyncExternalStore } from 'react';
import { getLanguage, subscribeLanguage, type Lang } from './language';

// Re-renders the calling component whenever the global language changes (e.g. the header toggle
// is clicked on some other part of the tree) — the only React-aware piece of the language module,
// everything else (language.ts, strings.ts, announcer.ts) is plain, non-React code.
export function useLanguage(): Lang {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}
