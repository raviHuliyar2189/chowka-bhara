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

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
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
const PIECE_PATTERNS = [/(\d+)\s*kayi/, /piece\s+(\d+)/, /move\s+piece\s+(\d+)/];

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
