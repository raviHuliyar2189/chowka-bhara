import { useEffect } from 'react';
import indiraPic from '../assets/Indira.jpg';
import { translate } from '../i18n/strings';

// Always the English string, regardless of the saved language setting — same reasoning as the
// Kannada dedication text below (this splash always appears before the language toggle is even
// reachable, so 'en' is simply a fixed choice here, not a live translation). Reads from strings.ts
// via translate() rather than a hardcoded literal so the version number has one source of truth.
// This used to live in the app-wide header (AppHeader in App.tsx), shown on every screen; moved
// here so that header no longer costs a line of vertical space the board could use instead (see
// REQUIREMENTS.md's Decisions log). The English app name itself ("Chowka Bhara") was dropped again
// shortly after — the Kannada title above already names the game, so it was redundant.
const APP_VERSION = translate('app.version', 'en');

interface Props {
  onDone: () => void;
}

const DISPLAY_MS = 5000;

export default function WelcomeScreen({ onDone }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, DISPLAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The dedication text is always Kannada, regardless of the saved language setting — this splash
  // is shown before the language toggle (reachable once the app header appears, after this screen)
  // is even reachable, so there's no choice to honor yet at this point. The version number below
  // it isn't a translation choice either way (see APP_VERSION above).
  return (
    <div className="welcome-screen">
      <h1 className="welcome-title">ಚೌಕಾ ಭಾರ</h1>
      <span className="welcome-app-version">{APP_VERSION}</span>
      <p className="welcome-message">ನಮ್ಮ ಪ್ರೀತಿಯ ಇಂದಿರತ್ತೆಯ ಸವಿ ನೆನಪಿಗೆ</p>
      <img className="welcome-pic welcome-pic-portrait" src={indiraPic} alt="Indiratte" />
    </div>
  );
}
