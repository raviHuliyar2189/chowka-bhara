// Keyword/phrase matching, not NLP — a curated list per command, checked against whatever
// SpeechRecognition transcribed. Deliberately checks both English and Kannada (romanized) phrase
// lists regardless of which language the recognizer was set to, since a recognizer session can
// only transcribe in one language at a time but often still produces a usable phonetic transcript
// for short, distinctive command phrases even via the "wrong" language's engine — see
// useVoiceCommands.ts for how the recognition session itself is started.

export type VoiceIntent =
  | { kind: 'roll' }
  | { kind: 'rollback' }
  | { kind: 'select-value'; value: number }
  | { kind: 'select-piece'; pieceNumber: number }
  // Just a number, with no keyword (or with a keyword the recognizer mangled) — useVoiceCommands.ts
  // decides from the game state whether it means a dice value or a piece.
  | { kind: 'number'; value: number }
  | { kind: 'form-gatti' }
  | { kind: 'resign' }
  | { kind: 'unrecognized' };

// SpeechRecognition sometimes transcribes a spoken number as the English word rather than a
// digit (more likely for a short, isolated number than for one embedded in a longer phrase) — a
// real reported case where digit-only regexes silently missed an otherwise-correct utterance.
// Converted to digits before matching so every pattern below only ever has to look for \d+.
// Kannada number words (romanized) are included too, at explicit request: ondu (1), eradu (2),
// mooru (3), nalku/naku (4), entu (8), plus common alternate spellings a recognizer might produce.
const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  ondu: '1',
  ondhu: '1',
  two: '2',
  eradu: '2',
  yeradu: '2',
  three: '3',
  mooru: '3',
  muru: '3',
  moru: '3',
  four: '4',
  nalku: '4',
  nalaku: '4',
  naku: '4',
  naalku: '4',
  // The two special throws are named after their values (see dice.ts): Chauka is 4, Bhara is 8 —
  // players naturally call the number by the throw's name, so both count as the number too.
  chouka: '4',
  chauka: '4',
  chowka: '4',
  chaukha: '4',
  eight: '8',
  entu: '8',
  yentu: '8',
  bhara: '8',
  bhaara: '8',
  bara: '8',
};

// Only ever applied when the *whole* utterance is that one word — "for" or "to" inside a longer
// sentence is just a word, but a lone "for" spoken to a number-only command is almost certainly "4".
const NUMBER_HOMOPHONES: Record<string, number> = {
  won: 1,
  to: 2,
  too: 2,
  tu: 2,
  tree: 3,
  free: 3,
  for: 4,
  fore: 4,
  ate: 8,
};

function normalize(s: string): string {
  const cleaned = s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned
    .split(' ')
    .map((word) => NUMBER_WORDS[word] ?? word)
    .join(' ');
}

// Fixed phrases — substring match. Checked before the numeric patterns below so a fixed phrase
// (e.g. "gatti madu") never gets partially matched by a looser numeric regex.
const ROLL_PHRASES = ['kavade haku', 'matte haku', 'matte aadu', 'roll dice', 'roll the dice', 'roll'];
const GATTI_PHRASES = ['gatti madu', 'gatti maadu', 'form gatti', 'make gatti'];
// "resign" alone is included since it's short and doesn't collide as a substring with any other
// command's phrases above.
const RESIGN_PHRASES = ['saku aata', 'saku ata', 'resign', 'give up', 'quit game', 'i quit', 'surrender'];
// "Resign game" is often transcribed with a stray space or a near-homophone ("re sign", "resine",
// "risen game") — a real reported case where the phrase was never recognized. \bre\s?s[iy]g?n
// covers the spaced/mis-vowelled spellings ("re sign", "resin", "re sine") without matching
// unrelated words that merely contain "resign".
const RESIGN_LOOSE = /\bre\s?s[iy]g?n|\brisen game|\breason game/;
// Checked *before* ROLL_PHRASES: every one of these contains "roll", which would otherwise be
// swallowed by the bare-"roll" match below and roll the dice instead of undoing the last move.
// "role back"/"roll bag" are common misheard forms of "roll back".
const ROLLBACK_PHRASES = ['roll back', 'rollback', 'role back', 'roll bag', 'undo', 'take back', 'go back'];

// Parametric commands — a regex capturing the spoken number, rather than enumerating every
// "gara 1 nedesu".."gara 8 nedesu" literally.
const VALUE_PATTERNS = [
  /gara\s+(\d+)\s+nedesu/,
  /gara\s+(\d+)/,
  /select\s+(?:pool\s+)?(?:value\s+)?(\d+)/,
  /(?:pick|choose)\s+(\d+)/,
];
// "peace" is included as a homophone of "piece" that speech recognizers commonly substitute
// (a real reported case: "piece"/"move piece" stopped being recognized after the first few
// tries — homophone drift is a documented SpeechRecognition quirk, not something the app
// controls). "the" is optional since "move the piece 3" is just as natural to say as "move piece
// 3". Checked in most-specific-first order for clarity, though substring .match() below doesn't
// actually require anchoring.
// "pawn" and "kaayi" (Kannada for a game piece, also transcribed as "kayi"/"kaai"/"kaye") are
// accepted in addition to "piece" — added at explicit request because "piece <n>" alone wasn't
// being recognized consistently. Each works either before the number ("pawn 3", "kaayi 3") or
// after it ("3 kaayi"); a digit must be adjacent, so a stray "kai"/"pawn" elsewhere can't match.
const PIECE_WORD = '(?:piece|peace|pawn|paun|kaayi|kayi|kaai|kaye|kai)';
const PIECE_PATTERNS = [new RegExp(`${PIECE_WORD}\\s*(\\d+)`), new RegExp(`(\\d+)\\s*${PIECE_WORD}`)];

export function matchIntent(rawTranscript: string): VoiceIntent {
  const t = normalize(rawTranscript);

  if (ROLLBACK_PHRASES.some((p) => t.includes(p))) return { kind: 'rollback' };
  if (ROLL_PHRASES.some((p) => t.includes(p))) return { kind: 'roll' };
  if (GATTI_PHRASES.some((p) => t.includes(p))) return { kind: 'form-gatti' };
  if (RESIGN_PHRASES.some((p) => t.includes(p)) || RESIGN_LOOSE.test(t)) return { kind: 'resign' };

  for (const re of VALUE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const value = Number(m[1]);
      if ([1, 2, 3, 4, 8].includes(value)) return { kind: 'select-value', value };
    }
  }

  for (const re of PIECE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const pieceNumber = Number(m[1]);
      if (pieceNumber >= 1 && pieceNumber <= 4) return { kind: 'select-piece', pieceNumber };
    }
  }

  // A bare number — the keyword ("piece", "select", "pawn"…) is deliberately optional, at explicit
  // request: pronunciation made the keywords unreliable, so what matters is just the number, with
  // the game state deciding what it means (see useVoiceCommands.ts). Two shapes count:
  //  - exactly one number token in the whole utterance, whatever else was said around it (covers a
  //    keyword that was misheard into some other word: "peas 3", "pace 2");
  //  - a lone word that is a common homophone of a number ("to", "for", "tree", "ate").
  // Only 1-4 and 8 can ever be a dice value or piece number, and more than one number in an
  // utterance is ambiguous, so neither of those matches.
  const bare = t.replace(/^(?:number|no|the)\s+/, '');
  const homophone = NUMBER_HOMOPHONES[bare];
  if (homophone) return { kind: 'number', value: homophone };
  const digits = t.match(/\d+/g) ?? [];
  if (digits.length === 1 && [1, 2, 3, 4, 8].includes(Number(digits[0]))) {
    return { kind: 'number', value: Number(digits[0]) };
  }

  return { kind: 'unrecognized' };
}
