export type DiceFace = 0 | 1; // 0 = black, 1 = white

export interface RollResult {
  faces: DiceFace[];
  value: number;
  isBonus: boolean;
  label: string;
}

// Uses the platform's CSPRNG when available for a stronger, unbiased coin flip per die (the
// browser's window.crypto client-side, Node's global WebCrypto server-side), falling back to
// Math.random if neither is present.
function secureRandom(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}

// All-black = Bhara (8), all-white = Chauka (4), either grants a bonus roll.
// Mixed = the count of white faces (1-3).
export function rollDice(rng: () => number = secureRandom): RollResult {
  const faces: DiceFace[] = Array.from({ length: 4 }, () => (rng() < 0.5 ? 0 : 1));
  const whites = faces.filter((f) => f === 1).length;

  if (whites === 0) return { faces, value: 8, isBonus: true, label: 'Bhara' };
  if (whites === 4) return { faces, value: 4, isBonus: true, label: 'Chauka' };
  return { faces, value: whites, isBonus: false, label: String(whites) };
}
