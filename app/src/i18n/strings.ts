import { useCallback } from 'react';
import { useLanguage } from './useLanguage';
import type { Lang } from './language';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Entry = string | ((...args: any[]) => string);

function ordinalEn(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  return `${n}th`;
}

// Every user-facing string in the app lives here, keyed by a short dotted name grouped by the
// component/screen it belongs to. Static strings are plain values; anything with an interpolated
// value (a player name, a count, a link) is a function taking those values as plain args — no
// generic per-key typing, translate()/useT() below just forward whatever args were passed.
const STRINGS: Record<string, { en: Entry; kn: Entry }> = {
  // --- App header ---
  'app.title': { en: 'Chowka Bhara', kn: 'ಚೌಕಾ ಭಾರ' },
  'app.version': { en: 'Version 0.2', kn: 'ಆವೃತ್ತಿ 0.2' },

  // --- Auth (AuthGate / OnlineLogin / NeedsProfile) ---
  'auth.loading': { en: 'Loading…', kn: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ…' },
  'auth.signInTitle': { en: 'Sign In to Play', kn: 'ಆಡಲು ಸೈನ್ ಇನ್ ಮಾಡಿ' },
  'auth.signInPrompt': {
    en: 'Enter your email to log in, or to create a new account.',
    kn: 'ಲಾಗ್ ಇನ್ ಮಾಡಲು ಅಥವಾ ಹೊಸ ಖಾತೆ ರಚಿಸಲು ನಿಮ್ಮ ಇಮೇಲ್ ನಮೂದಿಸಿ.',
  },
  'auth.emailLabel': { en: 'Email:', kn: 'ಇಮೇಲ್:' },
  'auth.checking': { en: 'Checking…', kn: 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…' },
  'auth.continue': { en: 'Continue', kn: 'ಮುಂದುವರಿಸಿ' },
  'auth.loginFailed': { en: 'Could not log in.', kn: 'ಲಾಗ್ ಇನ್ ಆಗಲಿಲ್ಲ.' },
  'auth.noAccountTitle': {
    en: (email: string) => `No account yet for ${email}`,
    kn: (email: string) => `${email} ಗಾಗಿ ಇನ್ನೂ ಖಾತೆ ಇಲ್ಲ`,
  },
  'auth.pickDisplayName': {
    en: 'Pick a display name — this is what other players will see on the board.',
    kn: 'ಪ್ರದರ್ಶನ ಹೆಸರನ್ನು ಆಯ್ಕೆಮಾಡಿ — ಇತರ ಆಟಗಾರರು ಬೋರ್ಡ್‌ನಲ್ಲಿ ಇದನ್ನೇ ನೋಡುತ್ತಾರೆ.',
  },
  'auth.displayNameLabel': { en: 'Display Name:', kn: 'ಪ್ರದರ್ಶನ ಹೆಸರು:' },
  'auth.displayNameRequired': { en: 'A display name is required.', kn: 'ಪ್ರದರ್ಶನ ಹೆಸರು ಅಗತ್ಯವಿದೆ.' },
  'auth.creating': { en: 'Creating…', kn: 'ರಚಿಸಲಾಗುತ್ತಿದೆ…' },
  'auth.createAccount': { en: 'Create Account', kn: 'ಖಾತೆ ರಚಿಸಿ' },
  'auth.createAccountFailed': { en: 'Could not create your account.', kn: 'ನಿಮ್ಮ ಖಾತೆ ರಚಿಸಲಾಗಲಿಲ್ಲ.' },

  // --- Mode select ---
  'modeSelect.heading': { en: 'How do you want to play?', kn: 'ಹೇಗೆ ಆಡಬೇಕೆಂದಿದ್ದೀರಿ?' },
  'modeSelect.singlePlayer': { en: '🤖 Single player', kn: '🤖 ಒಬ್ಬ ಆಟಗಾರ' },
  'modeSelect.multiLocal': { en: '📱 Multiple players (Local)', kn: '📱 ಅನೇಕ ಆಟಗಾರರು (ಸ್ಥಳೀಯ)' },
  'modeSelect.multiOnline': { en: '🌐 Multiple Players (Online)', kn: '🌐 ಅನೇಕ ಆಟಗಾರರು (ಆನ್‌ಲೈನ್)' },
  'modeSelect.developTest': { en: '🛠️ Develop Test', kn: '🛠️ ಡೆವಲಪ್ ಟೆಸ್ಟ್' },

  // --- Setup (hotseat / develop test) ---
  'setup.title': { en: 'Select Players', kn: 'ಆಟಗಾರರನ್ನು ಆಯ್ಕೆಮಾಡಿ' },
  'setup.numberOfPlayers': { en: 'Number of Players:', kn: 'ಆಟಗಾರರ ಸಂಖ್ಯೆ:' },
  'setup.nPlayers': { en: (n: number) => `${n} Players`, kn: (n: number) => `${n} ಆಟಗಾರರು` },
  'setup.seatName': { en: (seat: string) => `${seat} Name:`, kn: (seat: string) => `${seat} ಹೆಸರು:` },
  'setup.namePlaceholder': { en: (n: number) => `Player ${n}`, kn: (n: number) => `ಆಟಗಾರ ${n}` },
  'setup.pickFromRoster': { en: '— choose from roster —', kn: '— ಪಟ್ಟಿಯಿಂದ ಆಯ್ಕೆಮಾಡಿ —' },
  'side.bottom': { en: 'Bottom', kn: 'ಕೆಳಗೆ' },
  'side.right': { en: 'Right', kn: 'ಬಲ' },
  'side.top': { en: 'Top', kn: 'ಮೇಲೆ' },
  'side.left': { en: 'Left', kn: 'ಎಡ' },
  'setup.announcements': { en: 'Announcements', kn: 'ಘೋಷಣೆಗಳು' },
  'setup.muteTitle': { en: 'Mute announcements', kn: 'ಘೋಷಣೆಗಳನ್ನು ಮ್ಯೂಟ್ ಮಾಡಿ' },
  'setup.unmuteTitle': { en: 'Unmute announcements', kn: 'ಘೋಷಣೆಗಳನ್ನು ಅನ್‌ಮ್ಯೂಟ್ ಮಾಡಿ' },
  'setup.soundOn': { en: '🔊 Sound: On', kn: '🔊 ಧ್ವನಿ: ಆನ್' },
  'setup.soundOff': { en: '🔇 Sound: Off', kn: '🔇 ಧ್ವನಿ: ಆಫ್' },
  'setup.rollbackQuestion': { en: 'Roll back last move', kn: 'ಕೊನೆಯ ನಡೆಯನ್ನು ಹಿಂತೆಗೆದುಕೊಳ್ಳಿ' },
  'setup.rollbackEnableTitle': { en: 'Enable roll-back', kn: 'ಹಿಂತೆಗೆತ ಸಕ್ರಿಯಗೊಳಿಸಿ' },
  'setup.rollbackDisableTitle': { en: 'Disable roll-back', kn: 'ಹಿಂತೆಗೆತ ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಿ' },
  'setup.rollbackOn': { en: '⟲ Roll Back: On', kn: '⟲ ಹಿಂತೆಗೆತ: ಆನ್' },
  'setup.rollbackOff': { en: '⟲ Roll Back: Off', kn: '⟲ ಹಿಂತೆಗೆತ: ಆಫ್' },
  'setup.resignAllowedQuestion': { en: 'Resignation Allowed?', kn: 'ರಾಜೀನಾಮೆಗೆ ಅನುಮತಿ?' },
  'setup.resignEnableTitle': { en: 'Enable resigning', kn: 'ರಾಜೀನಾಮೆ ಸಕ್ರಿಯಗೊಳಿಸಿ' },
  'setup.resignDisableTitle': { en: 'Disable resigning', kn: 'ರಾಜೀನಾಮೆ ನಿಷ್ಕ್ರಿಯಗೊಳಿಸಿ' },
  'setup.resignOn': { en: '🏳 Resign: Allowed', kn: '🏳 ರಾಜೀನಾಮೆ: ಅನುಮತಿಸಲಾಗಿದೆ' },
  'setup.resignOff': { en: '🏳 Resign: Not Allowed', kn: '🏳 ರಾಜೀನಾಮೆ: ಅನುಮತಿ ಇಲ್ಲ' },
  'setup.startGame': { en: 'Start Game', kn: 'ಆಟ ಪ್ರಾರಂಭಿಸಿ' },

  // --- Board editor (Develop Test) ---
  'editor.title': { en: 'Board Editor', kn: 'ಬೋರ್ಡ್ ಸಂಪಾದಕ' },
  'editor.instructions': {
    en: 'Drag pieces to any position on the board, then choose who resumes first.',
    kn: 'ಬೋರ್ಡ್‌ನಲ್ಲಿ ಯಾವುದೇ ಸ್ಥಳಕ್ಕೆ ಕಾಯಿಗಳನ್ನು ಎಳೆಯಿರಿ, ನಂತರ ಯಾರು ಮೊದಲು ಮುಂದುವರಿಸಬೇಕೆಂದು ಆಯ್ಕೆಮಾಡಿ.',
  },
  'editor.resumeAs': { en: 'Resume as:', kn: 'ಮುಂದುವರಿಸುವವರು:' },
  'editor.startFromHere': { en: 'Start Game From Here', kn: 'ಇಲ್ಲಿಂದ ಆಟ ಪ್ರಾರಂಭಿಸಿ' },
  'editor.resetPositions': { en: 'Reset Positions', kn: 'ಸ್ಥಾನಗಳನ್ನು ಮರುಹೊಂದಿಸಿ' },

  // --- Player status (Board.tsx) ---
  'status.playing': { en: 'Playing', kn: 'ಆಡುತ್ತಿದ್ದಾರೆ' },
  'status.lost': { en: 'Lost', kn: 'ಸೋತಿದ್ದಾರೆ' },
  'status.winner': { en: 'Winner', kn: 'ವಿಜೇತರು' },
  'status.second': { en: '2nd place', kn: '2ನೇ ಸ್ಥಾನ' },
  'status.third': { en: '3rd place', kn: '3ನೇ ಸ್ಥಾನ' },
  'status.declined': { en: 'Declined', kn: 'ನಿರಾಕರಿಸಿದ್ದಾರೆ' },
  'status.resignedSuffix': { en: (s: string) => `${s} (Resigned)`, kn: (s: string) => `${s} (ರಾಜೀನಾಮೆ)` },
  'status.notCaptured': { en: 'Not Captured', kn: 'ಸೆರೆ ಹಿಡಿದಿಲ್ಲ' },
  'status.captureDone': { en: 'Capture Done', kn: 'ಸೆರೆ ಹಿಡಿದಿದೆ' },
  'board.statsTitle': {
    en: (name: string, status: string, capture: string) => `${name}'s statistics — ${status} — ${capture}`,
    kn: (name: string, status: string, capture: string) => `${name} ಅವರ ಅಂಕಿಅಂಶಗಳು — ${status} — ${capture}`,
  },

  // --- Dice tray ---
  'dice.rollButton': { en: 'Roll the Dice', kn: 'ಕವಡೆ ಹಾಕಿ' },
  'dice.rollbackTitle': {
    en: 'Undo the last move and restore the pending dice value/piece choice',
    kn: 'ಕೊನೆಯ ನಡೆಯನ್ನು ರದ್ದುಗೊಳಿಸಿ ಮತ್ತು ಬಾಕಿ ಇರುವ ಗರ/ಕಾಯಿ ಆಯ್ಕೆಯನ್ನು ಮರುಸ್ಥಾಪಿಸಿ',
  },
  'dice.rollbackButton': { en: '⟲ Roll Back Last Move', kn: '⟲ ಕೊನೆಯ ನಡೆ ಹಿಂತೆಗೆದುಕೊಳ್ಳಿ' },
  'dice.currentTurn': { en: (name: string) => `${name}'s turn`, kn: (name: string) => `${name} ಅವರ ಸರದಿ` },
  'dice.movesRemaining': { en: 'Moves still to play:', kn: 'ನಡೆಸಬೇಕಾದ ಗರಗಳು:' },
  'dice.none': { en: 'None', kn: 'ಯಾವುದೂ ಇಲ್ಲ' },
  'dice.bonus': { en: ' (bonus)', kn: ' (ಬೋನಸ್)' },
  'dice.faceBlack': { en: 'Black', kn: 'ಕಪ್ಪು' },
  'dice.faceWhite': { en: 'White', kn: 'ಬಿಳಿ' },

  // --- Resign (hotseat / develop test) ---
  'resign.title': { en: 'Resign Information', kn: 'ರಾಜೀನಾಮೆ ಮಾಹಿತಿ' },
  'resign.message': {
    en: (name: string) =>
      `${name} accepted defeat and resigned. The player pieces will be removed from the board. Do you want to continue playing with remaining players`,
    kn: (name: string) =>
      `${name} ಸೋಲನ್ನು ಒಪ್ಪಿಕೊಂಡು ರಾಜೀನಾಮೆ ನೀಡಿದ್ದಾರೆ. ಆ ಆಟಗಾರನ ಕಾಯಿಗಳನ್ನು ಬೋರ್ಡ್‌ನಿಂದ ತೆಗೆದುಹಾಕಲಾಗುವುದು. ಉಳಿದ ಆಟಗಾರರೊಂದಿಗೆ ಆಟ ಮುಂದುವರಿಸಬೇಕೇ`,
  },
  'resign.continue': { en: 'Continue', kn: 'ಮುಂದುವರಿಸಿ' },
  'resign.gameButton': { en: 'Resign Game', kn: 'ಆಟದಿಂದ ರಾಜೀನಾಮೆ' },

  // --- Shared in-game controls (hotseat / vs-computer / online) ---
  'game.abortButton': { en: 'Abort Game', kn: 'ಆಟ ರದ್ದುಗೊಳಿಸಿ' },
  'game.reportBug': { en: '🐞 Report Bug', kn: '🐞 ದೋಷ ವರದಿ ಮಾಡಿ' },
  'game.reportBugTitle': { en: 'Report a bug', kn: 'ದೋಷವನ್ನು ವರದಿ ಮಾಡಿ' },
  'game.soundOn': { en: '🔊 Sound On', kn: '🔊 ಧ್ವನಿ ಆನ್' },
  'game.muted': { en: '🔇 Muted', kn: '🔇 ಮ್ಯೂಟ್ ಮಾಡಲಾಗಿದೆ' },
  'game.captureToast': {
    en: (player: string, count: number) => `${player} captured ${count} piece${count === 1 ? '' : 's'}!`,
    kn: (player: string, count: number) => `${player} ${count} ಕಾಯಿ ಸೆರೆ ಹಿಡಿದಿದ್ದಾರೆ!`,
  },

  // --- Vs Computer ---
  'vsComputer.title': { en: 'Play vs Computer', kn: 'ಕಂಪ್ಯೂಟರ್ ವಿರುದ್ಧ ಆಡಿ' },
  'vsComputer.yourName': { en: 'Your Name:', kn: 'ನಿಮ್ಮ ಹೆಸರು:' },
  'vsComputer.namePlaceholder': { en: 'e.g. Ravi', kn: 'ಉದಾ. ರವಿ' },

  // --- Results / session ---
  'results.gameFinished': { en: 'Game Finished!', kn: 'ಆಟ ಮುಗಿದಿದೆ!' },
  'results.gameAborted': { en: 'Game Aborted', kn: 'ಆಟ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ' },
  'results.place': { en: (place: number) => `Place ${place}`, kn: (place: number) => `${place}ನೇ ಸ್ಥಾನ` },
  'results.loss': { en: 'Loss', kn: 'ಸೋಲು' },
  'results.sessionSummary': {
    en: (n: number) => `Session Summary (${n} game${n === 1 ? '' : 's'})`,
    kn: (n: number) => `ಸೆಷನ್ ಸಾರಾಂಶ (${n} ಆಟ${n === 1 ? '' : 'ಗಳು'})`,
  },
  'results.player': { en: 'Player', kn: 'ಆಟಗಾರ' },
  'results.games': { en: 'Games', kn: 'ಆಟಗಳು' },
  'results.firstWinPct': { en: '1st Win %', kn: '1ನೇ ಗೆಲುವು %' },
  'results.secondWinPct': { en: '2nd Win %', kn: '2ನೇ ಗೆಲುವು %' },
  'results.thirdWinPct': { en: '3rd Win %', kn: '3ನೇ ಗೆಲುವು %' },
  'results.lossPct': { en: 'Loss %', kn: 'ಸೋಲು %' },
  'results.abortedPct': { en: 'Aborted %', kn: 'ರದ್ದಾದ %' },
  'results.playAgain': { en: 'Play Again (Same Players)', kn: 'ಮತ್ತೆ ಆಡಿ (ಅದೇ ಆಟಗಾರರು)' },
  'results.endSession': { en: 'End Session', kn: 'ಸೆಷನ್ ಮುಗಿಸಿ' },

  // --- Stats modal ---
  'stats.title': { en: (name: string) => `${name}'s Lifetime Stats`, kn: (name: string) => `${name} ಅವರ ಜೀವಮಾನದ ಅಂಕಿಅಂಶಗಳು` },
  'stats.totalGames': { en: 'Total Games Played', kn: 'ಒಟ್ಟು ಆಡಿದ ಆಟಗಳು' },
  'stats.firstWin': { en: '1st Win', kn: '1ನೇ ಗೆಲುವು' },
  'stats.secondWin': { en: '2nd Win', kn: '2ನೇ ಗೆಲುವು' },
  'stats.thirdWin': { en: '3rd Win', kn: '3ನೇ ಗೆಲುವು' },
  'stats.loss': { en: 'Loss', kn: 'ಸೋಲು' },
  'stats.aborted': { en: 'Aborted', kn: 'ರದ್ದಾಗಿದೆ' },
  'common.close': { en: 'Close', kn: 'ಮುಚ್ಚಿ' },

  // --- Report Bug modal ---
  'bug.title': { en: 'Report a Bug', kn: 'ದೋಷ ವರದಿ ಮಾಡಿ' },
  'bug.observePrompt': { en: 'What did you observe?', kn: 'ನೀವು ಏನು ಗಮನಿಸಿದಿರಿ?' },
  'bug.expectPrompt': { en: 'What did you expect instead?', kn: 'ಬದಲಿಗೆ ಏನನ್ನು ನಿರೀಕ್ಷಿಸಿದ್ದಿರಿ?' },
  'bug.suggestPrompt': { en: 'Any suggestion (optional)?', kn: 'ಯಾವುದೇ ಸಲಹೆ (ಐಚ್ಛಿಕ)?' },
  'bug.observePlaceholder': {
    en: 'e.g. I had two dice values pending and a piece in the outer ring looked disabled even though the cell it was moving to was empty...',
    kn: 'ಉದಾ. ನನಗೆ ಎರಡು ಗರ ಮೌಲ್ಯಗಳು ಬಾಕಿ ಇದ್ದವು ಮತ್ತು ಹೊರಗಿನ ವಲಯದ ಒಂದು ಕಾಯಿ ನಿಷ್ಕ್ರಿಯವಾಗಿ ಕಂಡಿತು, ಆದರೂ ಅದು ಹೋಗಬೇಕಿದ್ದ ಕೋಶ ಖಾಲಿ ಇತ್ತು...',
  },
  'bug.expectPlaceholder': {
    en: 'e.g. The piece should have been highlighted and clickable since the target cell was empty.',
    kn: 'ಉದಾ. ಗುರಿ ಕೋಶ ಖಾಲಿ ಇದ್ದ ಕಾರಣ ಕಾಯಿ ಹೈಲೈಟ್ ಆಗಿ ಕ್ಲಿಕ್ ಮಾಡಬಹುದಾಗಿರಬೇಕಿತ್ತು.',
  },
  'bug.suggestPlaceholder': {
    en: 'e.g. Double-check the friendly-blocking logic for that cell.',
    kn: 'ಉದಾ. ಆ ಕೋಶದ ಸ್ವಂತ-ತಡೆ ತರ್ಕವನ್ನು ಮರುಪರಿಶೀಲಿಸಿ.',
  },
  'bug.reportDetails': { en: 'Report Bug Details', kn: 'ದೋಷ ವಿವರಗಳನ್ನು ವರದಿ ಮಾಡಿ' },
  'bug.cancel': { en: 'Cancel', kn: 'ರದ್ದುಮಾಡಿ' },
  'bug.copyPrompt': { en: 'Copy this and paste it to Claude for debugging:', kn: 'ಇದನ್ನು ನಕಲಿಸಿ ಡೀಬಗ್ ಮಾಡಲು Claude ಗೆ ಅಂಟಿಸಿ:' },
  'bug.copyToClipboard': { en: 'Copy to Clipboard', kn: 'ಕ್ಲಿಪ್‌ಬೋರ್ಡ್‌ಗೆ ನಕಲಿಸಿ' },
  'bug.copied': { en: 'Copied!', kn: 'ನಕಲಿಸಲಾಗಿದೆ!' },
  'bug.copyFailed': { en: 'Copy failed', kn: 'ನಕಲಿಸಲು ವಿಫಲವಾಗಿದೆ' },
  'bug.close': { en: 'Close', kn: 'ಮುಚ್ಚಿ' },
  'bug.sectionReport': { en: '## Bug Report', kn: '## ದೋಷ ವರದಿ' },
  'bug.sectionObservation': { en: '### Observation', kn: '### ಗಮನಿಸಿದ್ದು' },
  'bug.sectionExpected': { en: '### Expected', kn: '### ನಿರೀಕ್ಷಿಸಿದ್ದು' },
  'bug.sectionSuggestion': { en: '### Suggestion', kn: '### ಸಲಹೆ' },
  'bug.sectionDebugLog': { en: '### Debug Log', kn: '### ಡೀಬಗ್ ಲಾಗ್' },
  'bug.notProvided': { en: '(not provided)', kn: '(ನೀಡಿಲ್ಲ)' },

  // --- Online: setup ---
  'onlineSetup.title': { en: 'Set Up Online Game', kn: 'ಆನ್‌ಲೈನ್ ಆಟ ಸಿದ್ಧಪಡಿಸಿ' },
  'onlineSetup.linkNote': {
    en: "You'll get a link to share with the others once the game is created.",
    kn: 'ಆಟ ರಚಿಸಿದ ನಂತರ ಇತರರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲು ನಿಮಗೆ ಲಿಂಕ್ ಸಿಗುತ್ತದೆ.',
  },
  'onlineSetup.createFailed': { en: 'Could not create the game.', kn: 'ಆಟ ರಚಿಸಲಾಗಲಿಲ್ಲ.' },
  'onlineSetup.creating': { en: 'Creating…', kn: 'ರಚಿಸಲಾಗುತ್ತಿದೆ…' },
  'onlineSetup.createGame': { en: 'Create Game', kn: 'ಆಟ ರಚಿಸಿ' },

  // --- Online: lobby ---
  'lobby.aborted': { en: 'This game was aborted.', kn: 'ಈ ಆಟ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.' },
  'lobby.notPart': {
    en: "This game has already started and you weren't part of it.",
    kn: 'ಈ ಆಟ ಈಗಾಗಲೇ ಪ್ರಾರಂಭವಾಗಿದೆ ಮತ್ತು ನೀವು ಅದರ ಭಾಗವಾಗಿರಲಿಲ್ಲ.',
  },
  'lobby.full': { en: 'This game is already full.', kn: 'ಈ ಆಟ ಈಗಾಗಲೇ ತುಂಬಿದೆ.' },
  'lobby.loadFailed': { en: 'Could not load this game.', kn: 'ಈ ಆಟವನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ.' },
  'lobby.joinFailed': { en: 'Could not join.', kn: 'ಸೇರಲಾಗಲಿಲ್ಲ.' },
  'lobby.declineFailed': { en: 'Could not decline.', kn: 'ನಿರಾಕರಿಸಲಾಗಲಿಲ್ಲ.' },
  'lobby.startFailed': { en: 'Could not start the game.', kn: 'ಆಟ ಪ್ರಾರಂಭಿಸಲಾಗಲಿಲ್ಲ.' },
  'lobby.cancelFailed': { en: 'Could not cancel the game.', kn: 'ಆಟ ರದ್ದುಮಾಡಲಾಗಲಿಲ್ಲ.' },
  'lobby.loading': { en: 'Loading game…', kn: 'ಆಟ ಲೋಡ್ ಆಗುತ್ತಿದೆ…' },
  'lobby.declinedTitle': { en: 'You declined this game.', kn: 'ನೀವು ಈ ಆಟವನ್ನು ನಿರಾಕರಿಸಿದ್ದೀರಿ.' },
  'lobby.inviteTitle': { en: 'Game Invite', kn: 'ಆಟದ ಆಹ್ವಾನ' },
  'lobby.inviteBody': {
    en: (name: string, seatCount: number) => `${name} invited you to a ${seatCount}-player Chowka Bhara game.`,
    kn: (name: string, seatCount: number) => `${name} ನಿಮ್ಮನ್ನು ${seatCount} ಆಟಗಾರರ ಚೌಕಾ ಭಾರ ಆಟಕ್ಕೆ ಆಹ್ವಾನಿಸಿದ್ದಾರೆ.`,
  },
  'lobby.joinedSoFar': {
    en: (names: string) => `Joined so far: ${names}.`,
    kn: (names: string) => `ಈವರೆಗೆ ಸೇರಿದವರು: ${names}.`,
  },
  'lobby.noOneYet': { en: 'no one yet', kn: 'ಇನ್ನೂ ಯಾರೂ ಇಲ್ಲ' },
  'lobby.join': { en: 'Join', kn: 'ಸೇರಿ' },
  'lobby.decline': { en: 'Decline', kn: 'ನಿರಾಕರಿಸಿ' },
  'lobby.waitingRoom': { en: 'Waiting Room', kn: 'ಕಾಯುವ ಕೊಠಡಿ' },
  'lobby.startedBy': {
    en: (name: string, seatCount: number) => `Started by ${name} — ${seatCount} players planned.`,
    kn: (name: string, seatCount: number) => `${name} ಪ್ರಾರಂಭಿಸಿದರು — ${seatCount} ಆಟಗಾರರು ಯೋಜಿತ.`,
  },
  'lobby.shareLink': { en: 'Share this link:', kn: 'ಈ ಲಿಂಕ್ ಹಂಚಿಕೊಳ್ಳಿ:' },
  'lobby.copied': { en: 'Copied!', kn: 'ನಕಲಿಸಲಾಗಿದೆ!' },
  'lobby.copyLink': { en: 'Copy Link', kn: 'ಲಿಂಕ್ ನಕಲಿಸಿ' },
  'lobby.shareWhatsApp': { en: 'Share on WhatsApp', kn: 'WhatsApp ನಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ' },
  'lobby.whatsappText': {
    en: (name: string, seatCount: number, joined: string, link: string) =>
      `${name} started a Chowka Bhara game for ${seatCount} players. Joined so far: ${joined}. Tap to join: ${link}`,
    kn: (name: string, seatCount: number, joined: string, link: string) =>
      `${name} ${seatCount} ಆಟಗಾರರಿಗಾಗಿ ಚೌಕಾ ಭಾರ ಆಟ ಪ್ರಾರಂಭಿಸಿದ್ದಾರೆ. ಈವರೆಗೆ ಸೇರಿದವರು: ${joined}. ಸೇರಲು ಟ್ಯಾಪ್ ಮಾಡಿ: ${link}`,
  },
  'lobby.waitingForResponse': { en: 'Waiting for a response…', kn: 'ಪ್ರತಿಕ್ರಿಯೆಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ…' },
  'lobby.joinedLabel': { en: (name: string) => `${name} — ✅ Joined`, kn: (name: string) => `${name} — ✅ ಸೇರಿದ್ದಾರೆ` },
  'lobby.declinedLabel': { en: (name: string) => `${name} — ❌ Declined`, kn: (name: string) => `${name} — ❌ ನಿರಾಕರಿಸಿದ್ದಾರೆ` },
  'lobby.starting': { en: 'Starting…', kn: 'ಪ್ರಾರಂಭಿಸಲಾಗುತ್ತಿದೆ…' },
  'lobby.startGame': { en: 'Start Game', kn: 'ಆಟ ಪ್ರಾರಂಭಿಸಿ' },
  'lobby.waitingForTwo': { en: 'Waiting for at least 2 players…', kn: 'ಕನಿಷ್ಠ 2 ಆಟಗಾರರಿಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ…' },
  'lobby.cancelling': { en: 'Cancelling…', kn: 'ರದ್ದುಮಾಡಲಾಗುತ್ತಿದೆ…' },
  'lobby.cancelGame': { en: 'Cancel Game', kn: 'ಆಟ ರದ್ದುಮಾಡಿ' },

  // --- Online: gameplay / game-over ---
  'online.gameOver': { en: 'Game Over!', kn: 'ಆಟ ಮುಗಿದಿದೆ!' },
  'online.rematchFailed': { en: 'Could not start a rematch.', kn: 'ಮರುಪಂದ್ಯ ಪ್ರಾರಂಭಿಸಲಾಗಲಿಲ್ಲ.' },
  'online.starting': { en: 'Starting…', kn: 'ಪ್ರಾರಂಭಿಸಲಾಗುತ್ತಿದೆ…' },
  'online.rematch': { en: 'Rematch', kn: 'ಮರುಪಂದ್ಯ' },
  'online.exit': { en: 'Exit', kn: 'ನಿರ್ಗಮಿಸಿ' },

  // --- Online: abort modal ---
  'onlineAbort.title': { en: 'Abort Game?', kn: 'ಆಟ ರದ್ದುಗೊಳಿಸುವುದೇ?' },
  'onlineAbort.prompt': {
    en: 'A player wants to abort the game. Do you agree?',
    kn: 'ಒಬ್ಬ ಆಟಗಾರ ಆಟ ರದ್ದುಗೊಳಿಸಲು ಬಯಸುತ್ತಾರೆ. ನೀವು ಒಪ್ಪುತ್ತೀರಾ?',
  },
  'onlineAbort.agree': { en: 'Agree to abort', kn: 'ರದ್ದುಗೊಳಿಸಲು ಒಪ್ಪಿ' },
  'onlineAbort.decline': { en: 'Decline, keep playing', kn: 'ನಿರಾಕರಿಸಿ, ಆಡುವುದನ್ನು ಮುಂದುವರಿಸಿ' },
  'onlineAbort.waitingFor': {
    en: (names: string) => `Waiting for ${names} to respond…`,
    kn: (names: string) => `${names} ಪ್ರತಿಕ್ರಿಯಿಸಲು ಕಾಯಲಾಗುತ್ತಿದೆ…`,
  },
  'onlineAbort.otherPlayers': { en: 'the other players', kn: 'ಇತರ ಆಟಗಾರರು' },
  'onlineAbort.declinedCount': {
    en: (n: number) => `${n} player(s) declined to abort`,
    kn: (n: number) => `${n} ಆಟಗಾರ(ರು) ರದ್ದುಗೊಳಿಸಲು ನಿರಾಕರಿಸಿದ್ದಾರೆ`,
  },
  'onlineAbort.forfeitQuestion': {
    en: 'Continue the game by removing the pieces of the player(s) who agreed to abort, and treating them as having lost?',
    kn: 'ರದ್ದುಗೊಳಿಸಲು ಒಪ್ಪಿದ ಆಟಗಾರ(ರ) ಕಾಯಿಗಳನ್ನು ತೆಗೆದುಹಾಕಿ, ಅವರನ್ನು ಸೋತವರೆಂದು ಪರಿಗಣಿಸಿ ಆಟ ಮುಂದುವರಿಸುವುದೇ?',
  },
  'onlineAbort.yesContinue': { en: 'Yes, continue without them', kn: 'ಹೌದು, ಅವರಿಲ್ಲದೆ ಮುಂದುವರಿಸಿ' },
  'onlineAbort.noResume': { en: 'No, resume the game', kn: 'ಇಲ್ಲ, ಆಟ ಪುನರಾರಂಭಿಸಿ' },
  'onlineAbort.decidingBy': {
    en: (name: string) => `${name} is deciding whether to continue without the players who declined…`,
    kn: (name: string) => `ನಿರಾಕರಿಸಿದ ಆಟಗಾರರಿಲ್ಲದೆ ಮುಂದುವರಿಸಬೇಕೇ ಎಂದು ${name} ನಿರ್ಧರಿಸುತ್ತಿದ್ದಾರೆ…`,
  },

  // --- Turn banner / hint (shared: hotseat, vs-computer, online) ---
  'hint.selectValueFirst': { en: 'Select a dice value first.', kn: 'ಮೊದಲು ಗರ ಆಯ್ಕೆಮಾಡಿ.' },
  'banner.turnStart': {
    en: (name: string) => `${name}, it's your turn — roll the dice.`,
    kn: (name: string) => `${name}, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ.`,
  },
  'banner.turnReverted': {
    en: (revertedName: string, nextName: string) =>
      `${revertedName} couldn't play out all the dice — that turn is undone. ${nextName}, it's your turn — roll the dice.`,
    kn: (revertedName: string, nextName: string) =>
      `${revertedName} ಎಲ್ಲಾ ಗರಗಳನ್ನು ಆಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ — ಆ ಸರದಿ ರದ್ದಾಗಿದೆ. ${nextName}, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ.`,
  },
  'banner.rollResult': {
    en: (name: string, label: string) => `${name} rolled ${label}. Move your piece.`,
    kn: (name: string, label: string) => `${name} ${label} ಎಸೆದರು. ನಿಮ್ಮ ಕಾಯಿ ನಡೆಸಿ.`,
  },
  'banner.rollBonus': {
    en: (name: string, label: string) => `${name} rolled ${label}! Bonus roll — roll again.`,
    kn: (name: string, label: string) => `${name} ${label} ಎಸೆದರು! ಬೋನಸ್ ಎಸೆತ — ಮತ್ತೆ ಕವಡೆ ಹಾಕಿ.`,
  },
  'banner.captured': {
    en: (name: string, count: number) => `${name} captured ${count > 1 ? `${count} pieces` : 'a piece'}! Roll again.`,
    kn: (name: string, count: number) => `${name} ${count} ಕಾಯಿ ಸೆರೆ ಹಿಡಿದರು! ಮತ್ತೆ ಕವಡೆ ಹಾಕಿ.`,
  },
  'banner.finished': {
    en: (name: string, place: number) => `${name} finished in ${ordinalEn(place)} place.`,
    kn: (name: string, place: number) => `${name} ${place}ನೇ ಸ್ಥಾನದಲ್ಲಿ ಮುಗಿಸಿದರು.`,
  },
  'banner.won': {
    en: (name: string) => `${name} won the game!`,
    kn: (name: string) => `${name} ಆಟವನ್ನು ಗೆದ್ದರು!`,
  },
  'banner.gameOver': { en: 'Game over!', kn: 'ಆಟ ಮುಗಿದಿದೆ!' },
};

export function translate(key: string, lang: Lang, ...args: unknown[]): string {
  const entry = STRINGS[key];
  if (!entry) return key;
  const value = entry[lang];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof value === 'function' ? (value as (...a: any[]) => string)(...args) : value;
}

export type T = (key: string, ...args: unknown[]) => string;

export function useT(): T {
  const lang = useLanguage();
  return useCallback((key: string, ...args: unknown[]) => translate(key, lang, ...args), [lang]);
}
