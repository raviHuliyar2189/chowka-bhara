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
//
// Deliberately NOT "4 independent fair coin flips" (each shell 50/50) — that would force these
// probabilities into a fixed binomial shape (1/2/3/4/8 at 25%/37.5%/25%/6.25%/6.25%), with no way
// to move any single outcome's odds without moving all the others in lockstep. Weighted directly
// instead, at the user's explicit request to make the two bonus rolls more common: Chauka and
// Bhara raised to 10%/8% (from 6.25% each), 1/2/3 scaled down to fit the remaining 82% while
// keeping their old relative shape (2:3:2, i.e. "2" still the single most common non-bonus roll).
// Weights are exact percentages (sum to 100) so pickOutcome can compare directly against rng()*100.
const OUTCOME_WEIGHTS: { value: number; whites: number; isBonus: boolean; label: string; weight: number }[] = [
  { value: 1, whites: 1, isBonus: false, label: '1', weight: (82 * 2) / 7 },
  { value: 2, whites: 2, isBonus: false, label: '2', weight: (82 * 3) / 7 },
  { value: 3, whites: 3, isBonus: false, label: '3', weight: (82 * 2) / 7 },
  { value: 4, whites: 4, isBonus: true, label: 'Chauka', weight: 10 },
  { value: 8, whites: 0, isBonus: true, label: 'Bhara', weight: 8 },
];

function pickOutcome(rng: () => number): (typeof OUTCOME_WEIGHTS)[number] {
  const r = rng() * 100;
  let acc = 0;
  for (const outcome of OUTCOME_WEIGHTS) {
    acc += outcome.weight;
    if (r < acc) return outcome;
  }
  return OUTCOME_WEIGHTS[OUTCOME_WEIGHTS.length - 1]; // float-rounding safety net, not a real case
}

// The outcome's white-shell count is fixed (see OUTCOME_WEIGHTS above), but WHICH of the 4 shells
// show white is still randomized each throw — purely cosmetic (the tray's scatter animation reads
// each shell's own face), no gameplay meaning attaches to which specific shell landed which way.
// A partial Fisher-Yates shuffle of the 4 positions, using the same rng, keeps this deterministic
// under a seeded rng the same way the old implementation was (tests can still control every die).
function facesFor(whites: number, rng: () => number): DiceFace[] {
  const positions = [0, 1, 2, 3];
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const whitePositions = new Set(positions.slice(0, whites));
  return Array.from({ length: 4 }, (_, i) => (whitePositions.has(i) ? 1 : 0));
}

export function rollDice(rng: () => number = secureRandom): RollResult {
  const outcome = pickOutcome(rng);
  const faces = facesFor(outcome.whites, rng);
  return { faces, value: outcome.value, isBonus: outcome.isBonus, label: outcome.label };
}
