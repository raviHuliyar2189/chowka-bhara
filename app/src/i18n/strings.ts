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
  // --- Error boundary ---
  'error.title': { en: 'Something went wrong', kn: 'ಏನೋ ತಪ್ಪಾಗಿದೆ' },
  'error.message': {
    en: 'This page ran into a problem. Reloading usually fixes it.',
    kn: 'ಈ ಪುಟದಲ್ಲಿ ಸಮಸ್ಯೆ ಉಂಟಾಗಿದೆ. ಮರುಲೋಡ್ ಮಾಡುವುದರಿಂದ ಸಾಮಾನ್ಯವಾಗಿ ಇದು ಸರಿಯಾಗುತ್ತದೆ.',
  },
  'error.reload': { en: 'Reload', kn: 'ಮರುಲೋಡ್ ಮಾಡಿ' },

  // --- App name (OnlineLogin's own title — see below; the welcome page hardcodes its own
  // Kannada-only copy of this instead, since it's always shown in Kannada regardless of the
  // language setting) ---
  'app.title': { en: 'Chowka Bhara', kn: 'ಚೌಕಾ ಭಾರ' },

  // --- Auth (AuthGate / OnlineLogin / NeedsProfile) ---
  'auth.loading': {
    en: 'Chowka Bhara is loading… It may take about a minute in case of cold start of the application.',
    kn: 'ಚೌಕಾ ಭಾರ ಲೋಡ್ ಆಗುತ್ತಿದೆ… ಅಪ್ಲಿಕೇಶನ್ ಕೋಲ್ಡ್ ಸ್ಟಾರ್ಟ್ ಆಗಿದ್ದರೆ ಇದಕ್ಕೆ ಸುಮಾರು ಒಂದು ನಿಮಿಷ ಬೇಕಾಗಬಹುದು.',
  },
  'auth.signInTitle': { en: 'Sign In', kn: 'ಸೈನ್ ಇನ್' },
  'auth.signInPrompt': {
    en: 'Enter WhatsApp number to Sign in...',
    kn: 'ಸೈನ್ ಇನ್ ಮಾಡಲು WhatsApp ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ...',
  },
  'auth.phoneLabel': { en: 'WhatsApp Number:', kn: 'WhatsApp ಸಂಖ್ಯೆ:' },
  'auth.phoneInvalid': {
    en: 'Enter a valid WhatsApp number, digits only (with country code).',
    kn: 'ಮಾನ್ಯವಾದ WhatsApp ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ, ಅಂಕಿಗಳು ಮಾತ್ರ (ದೇಶದ ಕೋಡ್ ಸಹಿತ).',
  },
  'auth.checking': { en: 'Checking…', kn: 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…' },
  'auth.continue': { en: 'Continue', kn: 'ಮುಂದುವರಿಸಿ' },
  'auth.loginFailed': { en: 'Could not log in.', kn: 'ಲಾಗ್ ಇನ್ ಆಗಲಿಲ್ಲ.' },
  'auth.noAccountTitle': {
    en: () => 'Adding a new player...',
    kn: () => 'ಹೊಸ ಆಟಗಾರನನ್ನು ಸೇರಿಸಲಾಗುತ್ತಿದೆ...',
  },
  'auth.pickDisplayName': {
    en: 'Enter a friendly name — other players will see this name.',
    kn: 'ಸ್ನೇಹಪರ ಹೆಸರನ್ನು ನಮೂದಿಸಿ — ಇತರ ಆಟಗಾರರು ಈ ಹೆಸರನ್ನು ನೋಡುತ್ತಾರೆ.',
  },
  'auth.displayNameLabel': { en: 'Name:', kn: 'ಹೆಸರು:' },
  'auth.displayNameRequired': { en: 'A display name is required.', kn: 'ಪ್ರದರ್ಶನ ಹೆಸರು ಅಗತ್ಯವಿದೆ.' },
  'auth.creating': { en: 'Creating…', kn: 'ರಚಿಸಲಾಗುತ್ತಿದೆ…' },
  'auth.createAccount': { en: 'Create Account', kn: 'ಖಾತೆ ರಚಿಸಿ' },
  'auth.createAccountFailed': { en: 'Could not create your account.', kn: 'ನಿಮ್ಮ ಖಾತೆ ರಚಿಸಲಾಗಲಿಲ್ಲ.' },

  // --- Mode select ---
  'modeSelect.heading': { en: 'How do you want to play?', kn: 'ಹೇಗೆ ಆಡಬೇಕೆಂದಿದ್ದೀರಿ?' },
  'modeSelect.singlePlayer': { en: '🤖 Play Alone with Computer', kn: '🤖 ಕಂಪ್ಯೂಟರ್ ಜೊತೆ ಒಬ್ಬಂಟಿಯಾಗಿ ಆಡಿ' },
  'modeSelect.multiLocal': {
    en: '📱 Play with Multiple Players on this device locally',
    kn: '📱 ಈ ಸಾಧನದಲ್ಲಿ ಸ್ಥಳೀಯವಾಗಿ ಅನೇಕ ಆಟಗಾರರೊಂದಿಗೆ ಆಡಿ',
  },
  'modeSelect.multiOnline': {
    en: '🌐 Play with Multiple Players over Internet',
    kn: '🌐 ಇಂಟರ್ನೆಟ್ ಮೂಲಕ ಅನೇಕ ಆಟಗಾರರೊಂದಿಗೆ ಆಡಿ',
  },
  'modeSelect.developTest': { en: '🛠️ Developer Mode', kn: '🛠️ ಡೆವಲಪರ್ ಮೋಡ್' },
  'modeSelect.infoLabel': { en: 'More info', kn: 'ಹೆಚ್ಚಿನ ಮಾಹಿತಿ' },
  'modeSelect.info.singlePlayer': {
    en: 'Play alone on this device against Indira, the built-in Computer Player. A quick way to play or practice the rules without needing anyone else.',
    kn: 'ಈ ಸಾಧನದಲ್ಲಿ ಒಬ್ಬರೇ, ಅಂತರ್ನಿರ್ಮಿತ ಕಂಪ್ಯೂಟರ್ ಆಟಗಾರ ಇಂದಿರಾ ವಿರುದ್ಧ ಆಡಿ. ಬೇರೆಯವರ ಅಗತ್ಯವಿಲ್ಲದೆ ಬೇಗ ಆಡಲು ಅಥವಾ ನಿಯಮಗಳನ್ನು ಅಭ್ಯಾಸ ಮಾಡಲು ಸೂಕ್ತ.',
  },
  'modeSelect.info.multiLocal': {
    en: 'This mode is ideal when all the players are in the same place and like to play the game on a single device. 2 to 4 players are in the same place/room. Each player takes turns sharing this device, passing it around after each turn to play.',
    kn: 'ಎಲ್ಲಾ ಆಟಗಾರರು ಒಂದೇ ಸ್ಥಳದಲ್ಲಿದ್ದು, ಒಂದೇ ಸಾಧನದಲ್ಲಿ ಆಟವಾಡಲು ಬಯಸಿದಾಗ ಈ ವಿಧಾನ ಸೂಕ್ತವಾಗಿದೆ. 2 ರಿಂದ 4 ಆಟಗಾರರು ಒಂದೇ ಸ್ಥಳ/ಕೋಣೆಯಲ್ಲಿ ಇರುತ್ತಾರೆ. ಪ್ರತಿ ಆಟಗಾರ ಈ ಸಾಧನವನ್ನು ಸರದಿಯಂತೆ ಬಳಸುತ್ತಾರೆ, ಪ್ರತಿ ಸರದಿಯ ನಂತರ ಆಡಲು ಅದನ್ನು ಮುಂದಿನವರಿಗೆ ಹಸ್ತಾಂತರಿಸುತ್ತಾರೆ.',
  },
  'modeSelect.info.multiOnline': {
    en: 'Play with friends or family on their own devices, wherever they are. Start a game and invite others over WhatsApp — everyone sees moves update live.',
    kn: 'ಸ್ನೇಹಿತರು ಅಥವಾ ಕುಟುಂಬದವರೊಂದಿಗೆ, ಅವರು ಎಲ್ಲೇ ಇದ್ದರೂ, ಅವರ ಸ್ವಂತ ಸಾಧನಗಳಲ್ಲಿ ಆಡಿ. ಆಟ ಪ್ರಾರಂಭಿಸಿ ಮತ್ತು WhatsApp ಮೂಲಕ ಇತರರನ್ನು ಆಹ್ವಾನಿಸಿ — ಎಲ್ಲರೂ ನಡೆಗಳನ್ನು ನೇರವಾಗಿ ನೋಡುತ್ತಾರೆ.',
  },
  'modeSelect.info.developTest': {
    en: 'A testing tool for setting up a custom board position and resuming play from there. Not meant for normal play.',
    kn: 'ಕಸ್ಟಮ್ ಬೋರ್ಡ್ ಸ್ಥಾನವನ್ನು ಹೊಂದಿಸಿ ಅಲ್ಲಿಂದ ಆಟ ಮುಂದುವರಿಸಲು ಇರುವ ಪರೀಕ್ಷಾ ಸಾಧನ. ಸಾಮಾನ್ಯ ಆಟಕ್ಕಾಗಿ ಅಲ್ಲ.',
  },
  // --- Account controls (Sign Out / Exit) — AccountControls.tsx, shared across the app header,
  // mode-select, and the in-game App Controls panel (see REQUIREMENTS.md's Decisions log). ---
  'account.signOut': { en: '🚪 Sign Out', kn: '🚪 ಸೈನ್ ಔಟ್' },
  'account.signOutTitle': {
    en: 'Sign out and return to the sign-in screen',
    kn: 'ಸೈನ್ ಔಟ್ ಆಗಿ ಸೈನ್ ಇನ್ ಪರದೆಗೆ ಹಿಂತಿರುಗಿ',
  },
  'account.exit': { en: '✖️ Exit', kn: '✖️ ನಿರ್ಗಮಿಸಿ' },
  'account.exitTitle': { en: 'Exit the app', kn: 'ಆ್ಯಪ್‌ನಿಂದ ನಿರ್ಗಮಿಸಿ' },
  'account.exitNote': {
    en: 'You can now close this tab.',
    kn: 'ನೀವು ಈಗ ಈ ಟ್ಯಾಬ್ ಅನ್ನು ಮುಚ್ಚಬಹುದು.',
  },

  // --- Setup (hotseat / develop test) ---
  'setup.title': { en: 'Select Players', kn: 'ಆಟಗಾರರನ್ನು ಆಯ್ಕೆಮಾಡಿ' },
  'setup.numberOfPlayers': { en: 'Number of Players:', kn: 'ಆಟಗಾರರ ಸಂಖ್ಯೆ:' },
  'setup.nPlayers': {
    en: (n: number) => `${n} Player${n === 1 ? '' : 's'}`,
    kn: (n: number) => `${n} ಆಟಗಾರ${n === 1 ? '' : 'ರು'}`,
  },
  'setup.seatName': { en: (seat: string) => `${seat} Name:`, kn: (seat: string) => `${seat} ಹೆಸರು:` },
  'setup.namePlaceholder': { en: (n: number) => `Player ${n}`, kn: (n: number) => `ಆಟಗಾರ ${n}` },
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
  'editor.title': { en: 'Initialize Game', kn: 'ಆಟ ಆರಂಭಿಸಿ' },
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
  // --- Presence (online mode only, Board.tsx) ---
  'presence.online': { en: 'Connected', kn: 'ಸಂಪರ್ಕದಲ್ಲಿದ್ದಾರೆ' },
  'presence.offline': { en: 'Not connected', kn: 'ಸಂಪರ್ಕದಲ್ಲಿಲ್ಲ' },
  'board.statsTitle': {
    en: (name: string, status: string, capture: string) => `${name}'s statistics — ${status} — ${capture}`,
    kn: (name: string, status: string, capture: string) => `${name} ಅವರ ಅಂಕಿಅಂಶಗಳು — ${status} — ${capture}`,
  },

  // --- Dice tray ---
  'dice.rollButton': { en: 'Roll Dice', kn: 'ಕವಡೆ ಹಾಕಿ' },
  'dice.rollbackTitle': {
    en: 'Undo the last move and restore the pending dice value/piece choice',
    kn: 'ಕೊನೆಯ ನಡೆಯನ್ನು ರದ್ದುಗೊಳಿಸಿ ಮತ್ತು ಬಾಕಿ ಇರುವ ಗರ/ಕಾಯಿ ಆಯ್ಕೆಯನ್ನು ಮರುಸ್ಥಾಪಿಸಿ',
  },
  'dice.rollbackButton': { en: '⟲ Roll back', kn: '⟲ ಹಿಂತೆಗೆತ' },
  'dice.movesRemaining': { en: 'Pending Moves', kn: 'ಬಾಕಿ ಇರುವ ನಡೆಗಳು' },
  'dice.none': { en: 'None', kn: 'ಯಾವುದೂ ಇಲ್ಲ' },
  'dice.faceBlack': { en: 'Black', kn: 'ಕಪ್ಪು' },
  'dice.faceWhite': { en: 'White', kn: 'ಬಿಳಿ' },

  // --- Resign (hotseat / develop test) ---
  'resign.title': { en: 'Resign Information', kn: 'ರಾಜೀನಾಮೆ ಮಾಹಿತಿ' },
  'resign.message': {
    en: (name: string) =>
      `${name} resigned, hence lost the game. ${name}'s pieces will be removed from the board. Continue playing with other players.`,
    kn: (name: string) =>
      `${name} ರಾಜೀನಾಮೆ ನೀಡಿದ್ದಾರೆ, ಆದ್ದರಿಂದ ಆಟವನ್ನು ಸೋತಿದ್ದಾರೆ. ${name} ಅವರ ಕಾಯಿಗಳನ್ನು ಬೋರ್ಡ್‌ನಿಂದ ತೆಗೆದುಹಾಕಲಾಗುವುದು. ಇತರ ಆಟಗಾರರೊಂದಿಗೆ ಆಟ ಮುಂದುವರಿಸಿ.`,
  },
  'resign.continue': { en: 'Continue', kn: 'ಮುಂದುವರಿಸಿ' },
  'resign.gameButton': { en: 'Resign Game', kn: 'ಆಟದಿಂದ ರಾಜೀನಾಮೆ' },

  // --- Shared in-game controls (hotseat / vs-computer / online) ---
  'game.reportBug': { en: '🐞 Report Bug', kn: '🐞 ದೋಷ ವರದಿ ಮಾಡಿ' },
  'game.reportBugTitle': { en: 'Report a bug', kn: 'ದೋಷವನ್ನು ವರದಿ ಮಾಡಿ' },
  'game.soundOn': { en: '🔊 Sound On', kn: '🔊 ಧ್ವನಿ ಆನ್' },
  'game.muted': { en: '🔇 Muted', kn: '🔇 ಮ್ಯೂಟ್ ಮಾಡಲಾಗಿದೆ' },
  // --- App Controls (§11's layout pass) — sound/report-bug/language, rendered directly in the
  // play area (no longer a separate button opening an overlay — removed at explicit request).
  'appControls.language': { en: 'Language', kn: 'ಭಾಷೆ' },
  // --- Voice chat (online mode only) ---
  'voice.join': { en: '🎙️ Join Voice', kn: '🎙️ ಧ್ವನಿಗೆ ಸೇರಿ' },
  'voice.joinTitle': {
    en: 'Join voice chat with the other connected players',
    kn: 'ಇತರ ಸಂಪರ್ಕಿತ ಆಟಗಾರರೊಂದಿಗೆ ಧ್ವನಿ ಚಾಟ್‌ಗೆ ಸೇರಿ',
  },
  'voice.leave': { en: '📴 Leave Voice', kn: '📴 ಧ್ವನಿಯಿಂದ ನಿರ್ಗಮಿಸಿ' },
  'voice.leaveTitle': { en: 'Leave voice chat', kn: 'ಧ್ವನಿ ಚಾಟ್‌ನಿಂದ ನಿರ್ಗಮಿಸಿ' },
  'voice.unmuted': { en: '🎤 Mic On', kn: '🎤 ಮೈಕ್ ಆನ್' },
  'voice.muted': { en: '🔇 Mic Off', kn: '🔇 ಮೈಕ್ ಆಫ್' },
  'voice.muteTitle': { en: 'Mute your microphone', kn: 'ನಿಮ್ಮ ಮೈಕ್ರೊಫೋನ್ ಮ್ಯೂಟ್ ಮಾಡಿ' },
  'voice.unmuteTitle': { en: 'Unmute your microphone', kn: 'ನಿಮ್ಮ ಮೈಕ್ರೊಫೋನ್ ಅನ್‌ಮ್ಯೂಟ್ ಮಾಡಿ' },
  'voice.inVoice': { en: 'In voice chat', kn: 'ಧ್ವನಿ ಚಾಟ್‌ನಲ್ಲಿದ್ದಾರೆ' },
  'voice.connecting': { en: 'Voice connecting…', kn: 'ಧ್ವನಿ ಸಂಪರ್ಕಗೊಳ್ಳುತ್ತಿದೆ…' },
  'voice.connectFailed': {
    en: "Voice couldn't connect (network issue) — no audio between you and this player",
    kn: 'ಧ್ವನಿ ಸಂಪರ್ಕಗೊಳ್ಳಲಿಲ್ಲ (ನೆಟ್‌ವರ್ಕ್ ಸಮಸ್ಯೆ) — ನಿಮ್ಮ ಮತ್ತು ಈ ಆಟಗಾರರ ನಡುವೆ ಯಾವುದೇ ಧ್ವನಿ ಇಲ್ಲ',
  },
  'voice.connectFailedNamed': {
    en: (name: string) => `⚠️ Voice couldn't connect to ${name} (network issue) — you won't hear each other`,
    kn: (name: string) => `⚠️ ${name} ಜೊತೆ ಧ್ವನಿ ಸಂಪರ್ಕಗೊಳ್ಳಲಿಲ್ಲ (ನೆಟ್‌ವರ್ಕ್ ಸಮಸ್ಯೆ) — ನೀವಿಬ್ಬರೂ ಪರಸ್ಪರ ಕೇಳಿಸುವುದಿಲ್ಲ`,
  },
  'voice.enableAudio': { en: '🔊 Tap to hear voice', kn: '🔊 ಧ್ವನಿ ಕೇಳಲು ಒತ್ತಿ' },

  'game.captureToast': {
    en: (player: string, count: number) => `${player} captured ${count} piece${count === 1 ? '' : 's'}!`,
    kn: (player: string, count: number) => `${player} ${count} ಕಾಯಿ ಸೆರೆ ಹಿಡಿದಿದ್ದಾರೆ!`,
  },

  // --- Gatti-Tollu (shared: hotseat, vs-computer, online) --- Kannada wording for "gatti"/"tollu"
  // themselves is my own transliteration (ಗಟ್ಟಿ / ತೊಳ್ಳು) of the terms as given — flag me to correct
  // if that's not the spelling/word actually used for this game.
  'gatti.formButton': { en: 'Form Gatti', kn: 'ಗಟ್ಟಿ ಮಾಡಿ' },
  'gatti.formTitle': {
    en: 'Bond this tollu (2 pieces) into a permanent gatti and move it forward one square',
    kn: 'ಈ ತೊಳ್ಳನ್ನು (2 ಕಾಯಿಗಳು) ಶಾಶ್ವತ ಗಟ್ಟಿಯನ್ನಾಗಿ ಮಾಡಿ ಒಂದು ಚೌಕ ಮುಂದೆ ಸರಿಸಿ',
  },
  'banner.gattiFormed': {
    en: (name: string) => `${name} formed Gatti`,
    kn: (name: string) => `${name} ಗಟ್ಟಿ ಮಾಡಿದರು`,
  },

  // --- Vs Computer ---
  'vsComputer.title': { en: 'Play vs Computer', kn: 'ಕಂಪ್ಯೂಟರ್ ವಿರುದ್ಧ ಆಡಿ' },
  'vsComputer.yourName': { en: 'Your Name:', kn: 'ನಿಮ್ಮ ಹೆಸರು:' },
  'vsComputer.namePlaceholder': { en: 'e.g. Ravi', kn: 'ಉದಾ. ರವಿ' },

  // --- Results / session ---
  'results.gameFinished': { en: 'Game Finished!', kn: 'ಆಟ ಮುಗಿದಿದೆ!' },
  'results.place': { en: (place: number) => `Place ${place}`, kn: (place: number) => `${place}ನೇ ಸ್ಥಾನ` },
  'results.loss': { en: 'Loss', kn: 'ಸೋಲು' },
  'results.sessionSummary': {
    en: (n: number) => `Session Summary (${n} game${n === 1 ? '' : 's'})`,
    kn: (n: number) => `ಸೆಷನ್ ಸಾರಾಂಶ (${n} ಆಟ${n === 1 ? '' : 'ಗಳು'})`,
  },
  'results.lifetimeStats': { en: 'Lifetime Stats', kn: 'ಜೀವಮಾನದ ಅಂಕಿಅಂಶಗಳು' },
  'results.player': { en: 'Player', kn: 'ಆಟಗಾರ' },
  'results.games': { en: 'Games', kn: 'ಆಟಗಳು' },
  'results.firstWinPct': { en: '1st Win %', kn: '1ನೇ ಗೆಲುವು %' },
  'results.secondWinPct': { en: '2nd Win %', kn: '2ನೇ ಗೆಲುವು %' },
  'results.thirdWinPct': { en: '3rd Win %', kn: '3ನೇ ಗೆಲುವು %' },
  'results.lossPct': { en: 'Loss %', kn: 'ಸೋಲು %' },
  'results.resignedPct': { en: 'Resigned %', kn: 'ರಾಜೀನಾಮೆ %' },
  'results.playAgain': { en: 'Play Again (Same Players)', kn: 'ಮತ್ತೆ ಆಡಿ (ಅದೇ ಆಟಗಾರರು)' },
  'results.endSession': { en: 'End Session', kn: 'ಸೆಷನ್ ಮುಗಿಸಿ' },

  // --- Stats modal ---
  'stats.title': { en: (name: string) => `${name}'s Lifetime Stats`, kn: (name: string) => `${name} ಅವರ ಜೀವಮಾನದ ಅಂಕಿಅಂಶಗಳು` },
  'stats.totalGames': { en: 'Total Games Played', kn: 'ಒಟ್ಟು ಆಡಿದ ಆಟಗಳು' },
  'stats.firstWin': { en: '1st Win', kn: '1ನೇ ಗೆಲುವು' },
  'stats.secondWin': { en: '2nd Win', kn: '2ನೇ ಗೆಲುವು' },
  'stats.thirdWin': { en: '3rd Win', kn: '3ನೇ ಗೆಲುವು' },
  'stats.loss': { en: 'Loss', kn: 'ಸೋಲು' },
  'stats.resigned': { en: 'Resigned', kn: 'ರಾಜೀನಾಮೆ' },
  'stats.breakdownTitle': { en: 'Games by Player Count', kn: 'ಆಟಗಾರರ ಸಂಖ್ಯೆಯ ಪ್ರಕಾರ ಆಟಗಳು' },
  'stats.games1p': { en: '1 Player Games', kn: '1 ಆಟಗಾರ ಆಟಗಳು' },
  'stats.games2p': { en: '2 Player Games', kn: '2 ಆಟಗಾರರ ಆಟಗಳು' },
  'stats.games3p': { en: '3 Player Games', kn: '3 ಆಟಗಾರರ ಆಟಗಳು' },
  'stats.games4p': { en: '4 Player Games', kn: '4 ಆಟಗಾರರ ಆಟಗಳು' },
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
  'bug.submitting': { en: 'Sending to the developer…', kn: 'ಡೆವಲಪರ್‌ಗೆ ಕಳುಹಿಸಲಾಗುತ್ತಿದೆ…' },
  'bug.submitted': { en: 'Sent — thank you for the report!', kn: 'ಕಳುಹಿಸಲಾಗಿದೆ — ವರದಿಗಾಗಿ ಧನ್ಯವಾದಗಳು!' },
  'bug.submitFailed': {
    en: "Couldn't send this automatically — please copy it and share it another way.",
    kn: 'ಇದನ್ನು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಕಳುಹಿಸಲಾಗಲಿಲ್ಲ — ದಯವಿಟ್ಟು ನಕಲಿಸಿ ಬೇರೆ ರೀತಿಯಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ.',
  },
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
  'onlineSetup.title': { en: 'Configure Online Game', kn: 'ಆನ್‌ಲೈನ್ ಆಟ ಕಾನ್ಫಿಗರ್ ಮಾಡಿ' },
  'onlineSetup.linkNote': {
    en: 'WhatsApp will be opened to select the players from your contacts. After selecting the players, send the WhatsApp message which contains the details required to join the game.',
    kn: 'ಆಟಗಾರರನ್ನು ನಿಮ್ಮ ಸಂಪರ್ಕಗಳಿಂದ ಆಯ್ಕೆಮಾಡಲು WhatsApp ತೆರೆಯಲಾಗುತ್ತದೆ. ಆಟಗಾರರನ್ನು ಆಯ್ಕೆಮಾಡಿದ ನಂತರ, ಆಟಕ್ಕೆ ಸೇರಲು ಅಗತ್ಯವಿರುವ ವಿವರಗಳಿರುವ WhatsApp ಸಂದೇಶವನ್ನು ಕಳುಹಿಸಿ.',
  },
  'onlineSetup.createFailed': { en: 'Could not create the game.', kn: 'ಆಟ ರಚಿಸಲಾಗಲಿಲ್ಲ.' },
  'onlineSetup.creating': { en: 'Starting…', kn: 'ಪ್ರಾರಂಭಿಸಲಾಗುತ್ತಿದೆ…' },
  'onlineSetup.createGame': { en: 'Start Game', kn: 'ಆಟ ಪ್ರಾರಂಭಿಸಿ' },

  // --- Online: lobby ---
  'lobby.aborted': { en: 'The game was cancelled.', kn: 'ಈ ಆಟ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.' },
  'lobby.backToSetup': { en: 'Back to Game Setup', kn: 'ಆಟದ ಸೆಟಪ್‌ಗೆ ಹಿಂತಿರುಗಿ' },
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
  'lobby.join': { en: 'Join', kn: 'ಸೇರಿ' },
  'lobby.decline': { en: 'Decline', kn: 'ನಿರಾಕರಿಸಿ' },
  'lobby.waitingRoom': { en: 'Game Waiting Room', kn: 'ಆಟದ ಕಾಯುವ ಕೊಠಡಿ' },
  'lobby.startedBy': {
    en: (name: string, seatCount: number) => `Started by ${name} — ${seatCount} players planned.`,
    kn: (name: string, seatCount: number) => `${name} ಪ್ರಾರಂಭಿಸಿದರು — ${seatCount} ಆಟಗಾರರು ಯೋಜಿತ.`,
  },
  // Creator-only — only they actually have a WhatsApp invite to have sent (auto-opened for them
  // at creation time; see justCreated's own comment in OnlineLobby.tsx). Replaces the manual
  // "Share on WhatsApp" button/link, removed at the user's explicit request.
  'lobby.whatsappSentNote': {
    en: "I have sent a WhatsApp request to the selected people to join the game. You may like to remind the players if they don't join.",
    kn: 'ಆಟಕ್ಕೆ ಸೇರಲು ಆಯ್ಕೆ ಮಾಡಿದ ಜನರಿಗೆ ನಾನು WhatsApp ವಿನಂತಿ ಕಳುಹಿಸಿದ್ದೇನೆ. ಅವರು ಸೇರದಿದ್ದರೆ ನೀವು ಅವರಿಗೆ ನೆನಪಿಸಬಹುದು.',
  },
  // Replaces whatsappSentNote above once every required seat has joined — reminding the creator
  // to nudge stragglers no longer applies once there aren't any.
  'lobby.readyToStart': {
    en: 'Required number of players have joined the game. Start the game whenever you’re ready.',
    kn: 'ಅಗತ್ಯವಿರುವ ಸಂಖ್ಯೆಯ ಆಟಗಾರರು ಆಟಕ್ಕೆ ಸೇರಿದ್ದಾರೆ. ನೀವು ಸಿದ್ಧರಾದಾಗ ಆಟ ಪ್ರಾರಂಭಿಸಿ.',
  },
  'lobby.whatsappText': {
    en: (name: string, seatCount: number, link: string) =>
      `${name} started Chowka Bhara game for ${seatCount} players and inviting you to join\nTap the link to join: ${link}`,
    kn: (name: string, seatCount: number, link: string) =>
      `${name} ${seatCount} ಆಟಗಾರರಿಗಾಗಿ ಚೌಕಾ ಭಾರ ಆಟ ಪ್ರಾರಂಭಿಸಿ ನಿಮ್ಮನ್ನು ಸೇರಲು ಆಹ್ವಾನಿಸುತ್ತಿದ್ದಾರೆ\nಸೇರಲು ಲಿಂಕ್ ಟ್ಯಾಪ್ ಮಾಡಿ: ${link}`,
  },
  'lobby.waitingForResponse': {
    en: 'Waiting for other players to join the game…',
    kn: 'ಇತರ ಆಟಗಾರರು ಆಟಕ್ಕೆ ಸೇರುವುದನ್ನು ಕಾಯಲಾಗುತ್ತಿದೆ…',
  },
  'lobby.joinedLabel': { en: (name: string) => `${name} — ✅ Joined`, kn: (name: string) => `${name} — ✅ ಸೇರಿದ್ದಾರೆ` },
  'lobby.declinedLabel': { en: (name: string) => `${name} — ❌ Declined`, kn: (name: string) => `${name} — ❌ ನಿರಾಕರಿಸಿದ್ದಾರೆ` },
  'lobby.starting': { en: 'Starting…', kn: 'ಪ್ರಾರಂಭಿಸಲಾಗುತ್ತಿದೆ…' },
  'lobby.startGame': { en: 'Start Game', kn: 'ಆಟ ಪ್ರಾರಂಭಿಸಿ' },
  'lobby.waitingForTwo': { en: 'Waiting for at least 2 players…', kn: 'ಕನಿಷ್ಠ 2 ಆಟಗಾರರಿಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ…' },
  'lobby.waitingForCreatorToStart': {
    en: (name: string) => `Waiting for ${name} to start the game…`,
    kn: (name: string) => `${name} ಆಟ ಪ್ರಾರಂಭಿಸಲು ಕಾಯಲಾಗುತ್ತಿದೆ…`,
  },
  'lobby.cancelling': { en: 'Cancelling…', kn: 'ರದ್ದುಮಾಡಲಾಗುತ್ತಿದೆ…' },
  'lobby.cancelGame': { en: 'Cancel Game', kn: 'ಆಟ ರದ್ದುಮಾಡಿ' },

  // --- Online: gameplay / game-over ---
  'online.gameOver': { en: 'Game Over!', kn: 'ಆಟ ಮುಗಿದಿದೆ!' },
  'online.rematchFailed': { en: 'Could not start a rematch.', kn: 'ಮರುಪಂದ್ಯ ಪ್ರಾರಂಭಿಸಲಾಗಲಿಲ್ಲ.' },
  'online.starting': { en: 'Starting…', kn: 'ಪ್ರಾರಂಭಿಸಲಾಗುತ್ತಿದೆ…' },
  'online.rematch': { en: 'Rematch', kn: 'ಮರುಪಂದ್ಯ' },
  'online.exit': { en: 'Exit', kn: 'ನಿರ್ಗಮಿಸಿ' },
  // Shown once a player who resigned has dismissed the acknowledgment modal, if the game is still
  // going on for everyone else — they have no more moves left in this game, so unlike the other
  // players they need a way out that isn't just "wait for it to end."
  'online.resignedStillWatching': {
    en: 'You resigned from this game. You can leave now to start or join another.',
    kn: 'ನೀವು ಈ ಆಟದಿಂದ ರಾಜೀನಾಮೆ ನೀಡಿದ್ದೀರಿ. ಈಗ ಮತ್ತೊಂದು ಆಟ ಪ್ರಾರಂಭಿಸಲು ಅಥವಾ ಸೇರಲು ನೀವು ಹೊರಡಬಹುದು.',
  },
  'online.leaveGame': { en: 'Leave Game', kn: 'ಆಟದಿಂದ ಹೊರಡಿ' },

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
  // Deliberately terse — <player name> plus a 1-word action and, where useful, one more word
  // (a die label, a count, a place) — not a full sentence. The fuller spoken-aloud phrasing lives
  // separately in audio/announcer.ts's own announce*() functions, unaffected by this.
  'hint.selectValueFirst': { en: 'Select a dice value first.', kn: 'ಮೊದಲು ಗರ ಆಯ್ಕೆಮಾಡಿ.' },
  'banner.turnStart': {
    en: (name: string) => `${name}'s turn`,
    kn: (name: string) => `${name} ಸರದಿ`,
  },
  // A revert also just means it's now someone's turn — the same short form as turnStart, not a
  // separate explanation of what got undone (still in the debug log and the spoken announcement).
  'banner.turnReverted': {
    en: (_revertedName: string, nextName: string) => `${nextName}'s turn`,
    kn: (_revertedName: string, nextName: string) => `${nextName} ಸರದಿ`,
  },
  // Shown the moment a rolled/remaining pool turns out to have no legal move for anyone left to
  // play it (e.g. one piece or one gatti left and the value can't move it) — held on screen for a
  // deliberate pause (see each mode's own "stuck pool" delay) before the turn actually reverts and
  // passes on, so this is visible long enough to actually register, not just an instant flash.
  'banner.noLegalMove': {
    en: (name: string) => `${name}'s moves this turn are rolled back — not all moves could be made`,
    kn: (name: string) =>
      `${name} ಈ ಸರದಿಯ ನಡೆಗಳನ್ನು ಹಿಂತೆಗೆದುಕೊಳ್ಳಲಾಗಿದೆ — ಎಲ್ಲಾ ನಡೆಗಳನ್ನು ಮಾಡಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ`,
  },
  // rollResult and rollBonus share this exact same form — label alone already distinguishes a
  // bonus roll (dice.ts's label is 'Bhara'/'Chauka' there, a plain number otherwise), so there's
  // nothing a separate bonus phrasing would add.
  'banner.rollResult': {
    en: (name: string, label: string) => `${name} rolled ${label}`,
    kn: (name: string, label: string) => `${name} ${label} ಎಸೆದರು`,
  },
  'banner.rollBonus': {
    en: (name: string, label: string) => `${name} rolled ${label}`,
    kn: (name: string, label: string) => `${name} ${label} ಎಸೆದರು`,
  },
  // A capture always grants a bonus roll (§5.6) — "Roll again!" is part of the on-screen banner
  // itself now, not just the spoken announcement, so a player with sound off still sees the
  // instruction, not just "Ravi captured 2" with no indication what happens next.
  'banner.captured': {
    en: (name: string, count: number) => `${name} captured${count > 1 ? ` ${count}` : ''}. Roll again!`,
    kn: (name: string, count: number) => `${name} ${count > 1 ? `${count} ` : ''}ಸೆರೆ ಹಿಡಿದರು. ಮತ್ತೆ ಕವಡೆ ಹಾಕಿ!`,
  },
  'banner.finished': {
    en: (name: string, place: number) => `${name} finished ${ordinalEn(place)}`,
    kn: (name: string, place: number) => `${name} ${place}ನೇ ಸ್ಥಾನ`,
  },
  'banner.won': {
    en: (name: string) => `${name} won`,
    kn: (name: string) => `${name} ಗೆದ್ದರು`,
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
