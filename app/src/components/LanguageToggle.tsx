import { useLanguage } from '../i18n/useLanguage';
import { setLanguage } from '../i18n/language';

// The EN / ಕನ್ನಡ pill pair (§16) — shared markup between the global AppHeader (App.tsx, shown on
// login/setup/lobby screens) and ModeSelect's own inline copy (right-aligned next to "How do you
// want to play?", at the user's explicit request to move it there instead of the standalone top
// bar for that screen specifically — see REQUIREMENTS.md's Decisions log). Just the toggle itself;
// callers control layout/alignment around it.
export default function LanguageToggle() {
  const lang = useLanguage();
  return (
    <span className="lang-toggle">
      <button
        className={`lang-btn${lang === 'en' ? ' active' : ''}`}
        onClick={() => setLanguage('en')}
        disabled={lang === 'en'}
      >
        EN
      </button>
      <button
        className={`lang-btn${lang === 'kn' ? ' active' : ''}`}
        onClick={() => setLanguage('kn')}
        disabled={lang === 'kn'}
      >
        ಕನ್ನಡ
      </button>
    </span>
  );
}
