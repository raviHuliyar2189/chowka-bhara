// Keyword/phrase matching, not NLP — a curated list per command, checked against whatever
// SpeechRecognition transcribed. Deliberately checks both English and Kannada (romanized) phrase
// lists regardless of which language the recognizer was set to, since a recognizer session can
// only transcribe in one language at a time but often still produces a usable phonetic transcript
// for short, distinctive command phrases even via the "wrong" language's engine — see
// useVoiceCommands.ts for how the recognition session itself is started.

export type VoiceIntent =
  | { kind: 'roll' }
  | { kind: 'select-value'; value: number }
  | { kind: 'select-piece'; pieceNumber: number }
  | { kind: 'form-gatti' }
  | { kind: 'resign' }
  | { kind: 'unrecognized' };

// SpeechRecognition sometimes transcribes a spoken number as the English word rather than a
// digit (more likely for a short, isolated number than for one embedded in a longer phrase) — a
// real reported case where digit-only regexes silently missed an otherwise-correct utterance.
// Converted to digits before matching so every pattern below only ever has to look for \d+.
const NUMBER_WORDS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  eight: '8',
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
const RESIGN_PHRASES = ['saku aata', 'saku ata', 'resign', 'give up'];

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
const PIECE_PATTERNS = [
  /(\d+)\s*kayi/,
  /move\s+(?:the\s+)?(?:piece|peace)\s+(\d+)/,
  /(?:piece|peace)\s+(\d+)/,
];

export function matchIntent(rawTranscript: string): VoiceIntent {
  const t = normalize(rawTranscript);

  if (ROLL_PHRASES.some((p) => t.includes(p))) return { kind: 'roll' };
  if (GATTI_PHRASES.some((p) => t.includes(p))) return { kind: 'form-gatti' };
  if (RESIGN_PHRASES.some((p) => t.includes(p))) return { kind: 'resign' };

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

  return { kind: 'unrecognized' };
}
