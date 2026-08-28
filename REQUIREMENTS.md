# Chowka Bhara — Requirements

## 1. Overview
A digital implementation of the traditional cross-board race/capture game Chowka Bhara (a.k.a.
Ashta Chamma), for 2–4 players, with four modes:

- **Hotseat**: a single device passed between players in person, no account required.
- **Online**: players on separate devices (laptop/tablet/phone), each signed in with their own
  account, playing together over the internet in real time.
- **Vs Computer**: one human against a computer-controlled opponent, on a single device.
- **Develop Test**: identical to hotseat, plus an initial board-editor screen for setting up an
  arbitrary starting position (see §15) — a testing/debugging tool, not a normal way to play.

All four modes share the exact same game engine (`packages/game-core`) and the exact same
board/dice UI components (`Board`, `DiceTray`) — the rules, legality, and animations are identical
across all of them. What differs is who computes a move (the browser locally in hotseat, vs
computer, and develop test; the server authoritatively in online), how players get into the same
game, and — for vs computer only — that one seat's moves come from a heuristic AI instead of a
person (§14).

## 2. Board

- 5×5 grid of cells.
- Each player has a **home/base cell** at the midpoint of one outer edge:
  - P1 → bottom-center, P2 → right-center, P3 → top-center, P4 → left-center.
- The **center cell** is the shared final destination for all players.
- These 5 cells (4 bases + center) are visually marked (X) and are **safe squares** (see §6).
- Each player's path is 25 steps long (positions 0–24):
  - Position 0 = that player's home/base (start).
  - Positions 1–15 = outer ring, looping anticlockwise around the board back near the start.
  - Positions 16–23 = inner ring, spiraling through the 8 middle-ring cells.
  - Position 24 = center (final destination — shared cell for every player).
- P2, P3, P4 paths are the same shape as P1's, rotated 90°/180°/270° respectively, so all four
  players move anticlockwise around an identical rotational path.
- **Per-viewer display rotation (online only)**: every player's own device shows the board rotated
  so *their own* base always appears at the bottom, regardless of their actual P1–P4 seat — makes
  a player's own home and path easiest to read since it starts right in front of them. This is
  purely a rendering transform (the same 90°-step rotation used to derive P2–P4's paths from P1's,
  reused for display) — the underlying game coordinates, piece positions, and rules are unaffected
  and identical to what every other player's device is computing. Hotseat has one shared screen for
  every player at once, so it always shows the canonical, unrotated P1-at-bottom layout.

## 3. Players & Pieces

- 2, 3, or 4 players per game.
- Each player has 4 pieces, numbered 1–4, all starting stacked at that player's home cell.
- Each player is assigned a distinct color; color + name are shown on the board / player list.
- **2-player games**: players are seated at opposite bases (P1 & P3).
- **3-player games**: uses bases P1, P2, P3 (P4 slot unused). *(See §12.)*
- **4-player games**: uses all four bases.
- In online mode, the game's creator is always P1; the seat order for the other players is
  P1→P3 (2p), P1→P2→P3 (3p), or P1→P2→P3→P4 (4p) — whoever opens the invite link next claims the
  next seat in that order (see §13).

## 4. Dice

- 4 two-sided dice ("kavade"/cowrie shells), each face is black (value 0) or white (value 1).
- All 4 rolled together each throw.
- Scoring a throw:
  | Result | Condition | Move value | Probability |
  |---|---|---|---|
  | Bhara | all 4 black | 8 | 8% |
  | Chauka | all 4 white | 4 | 10% |
  | Normal | 1 white | 1 | 23<sup>2</sup>&frasl;<sub>7</sub>% (≈23.43%) |
  | Normal | 2 white | 2 | 35<sup>1</sup>&frasl;<sub>7</sub>% (≈35.14%) |
  | Normal | 3 white | 3 | 23<sup>2</sup>&frasl;<sub>7</sub>% (≈23.43%) |
- **Deliberately not 4 independent 50/50 shells** — that would force a fixed binomial shape
  (25/37.5/25/6.25/6.25%) with no way to move one outcome's odds without moving all the others.
  Weighted directly instead, per an explicit request to make the two bonus rolls more common:
  Bhara/Chauka raised to 8%/10% (from 6.25% each), 1/2/3 scaled down to fit the remaining 82%
  while keeping their old relative shape (2:3:2 — "2" stays the single most common non-bonus
  roll). Implemented in `packages/game-core/src/dice.ts`'s `OUTCOME_WEIGHTS`; which of the 4
  physical shells shows white for a given outcome is still randomized purely for the tray's
  animation, no gameplay meaning attaches to which specific shell landed which way.
- **Bhara or Chauka grants an immediate bonus roll** (roll again, in addition to the value just earned).
- A turn keeps rolling as long as bonus rolls keep coming. Every value earned during the sequence
  is added to that turn's **move pool** — nothing is discarded until the player has used it or the
  turn ends.
- In online mode, dice are rolled server-side (`Math.random`-backed, via the same `dice.ts` used
  by hotseat) — a client never determines its own roll outcome.

## 5. Turn Flow

1. Active player rolls until a non-bonus result ends the rolling phase.
2. All values accumulated this turn are shown as the move pool.
3. Player picks **any one pool value** and **any one of their own pieces**, then moves that piece
   that many steps forward along its path.
4. That value is consumed from the pool. If pool values remain and at least one is a legal move for
   some piece, the player repeats step 3.
5. **The whole pool must be played out — including finishing.** If, at any point, no remaining
   pool value can legally move any piece, the entire turn's moves — every piece moved and every
   capture made since the turn began, including through any capture-bonus reroll chain, **and
   including a finish** — are **undone**, as if the turn never happened, and the turn passes to
   the next player (anticlockwise: P1 → P2 → P3 → P4 → P1 …, skipping players not in the game /
   already finished / declared lost — see §8). A player finishing all 4 pieces partway through the
   pool does **not** end their turn early or exempt them from this: if any pool value is left
   unused once they've finished (and being finished, they can never have a legal move for it), the
   finish itself is reverted along with everything else — finishing only counts once the turn's
   entire pool has actually been used up.
6. **Capturing an opponent piece grants a bonus roll**, on top of the current turn: the player
   rolls again (step 1 again, including the possibility of further bonus-roll chains), and the
   new value(s) join the move pool. Any value already in the pool that hadn't been used yet
   (e.g. a roll from before the capture) is **not** discarded — it stays available alongside
   whatever comes from the bonus roll.
7. A piece must land **exactly** on position 24 to finish; a pool value that would overshoot 24 is
   not a legal move for that piece. *(See §12.)*
8. In online mode, one player's "roll"/"pick a value"/"pick a piece" action is sent to the server,
   which re-validates it's actually that player's turn and the move is legal before applying it and
   broadcasting the new board state to every connected player — the same reducer functions hotseat
   uses locally, just run authoritatively on the server instead.

## 6. Safe Squares

The 4 home cells and the center cell are **safe for everyone**, not just their owner:

- No capture can ever happen on these 5 cells, regardless of whose piece is landing there or whose
  base it is.
- Unlimited stacking is allowed on these cells — any number of pieces, from any player(s), may
  occupy the same one of these 5 cells at once, with no interaction between them.

*(This overrides the naive "safe only at your own start/position 0" interpretation — a piece's
safety must be evaluated from the grid cell it's standing on, not from its path-position number,
because every player's path physically crosses through the other three players' home cells.)*

## 7. Movement, Stacking & Capture (non-safe squares)

- **Outer-ring cells (path positions 1–15)**: no stacking. A player cannot move a piece onto a cell
  already occupied by another piece of their own. Moving onto a cell occupied by a single opposing
  piece captures it.
- **Inner-ring cells (path positions 16–23)**: a player *may* stack multiple of their **own** pieces
  on the same inner cell. If an opposing piece then lands on that cell, **all** stacked pieces there
  are captured at once. These cells are *not* safe squares — different players' inner rings occupy
  overlapping physical cells (rotations of the same 8-cell ring), so captures can happen there too.
- A captured piece is sent back to its owner's home cell (path position 0).
- Capturing grants the capturing player a bonus turn (§5.6).
- **Entry to the inner ring is gated on capturing**: a player cannot move any piece into the
  inner ring (positions 16–23), or therefore reach the center, until they have captured at least
  one opponent piece at some point in the game. Once a player has captured a single piece, this
  restriction is lifted for the rest of the game (it does not reset). A piece blocked only by this
  rule is treated as having no legal move for that value — it cannot be selected, and is not
  highlighted as movable.
- **No-capture-chance auto-loss**: a player who hasn't captured anyone is declared **lost**
  immediately once it becomes mathematically impossible for them to ever capture — i.e., at the
  start of any turn transition, every remaining active opponent's every piece is either already
  finished (permanently parked at the safe center) or sitting somewhere this player's own pieces
  could never reach given their remaining forward-only path. Without this, such a player would
  otherwise be stuck circling the outer ring forever with no way to ever reach the inner ring or
  finish, stalling the game indefinitely for everyone else. Checked every turn change
  (`markUncapturedDeadlocks` in `turnEngine.ts`); the game continues normally among the remaining
  active players. *(See §12.)*
- **Legal-move highlighting**: a piece is only highlighted as active/selectable when it is the
  current player's and has at least one legal move available — for the dice value picked, or for
  at least one still-pending pool value before a value has been picked. A piece that has already
  reached the center is never highlighted, regardless of turn state.

### Gatti & Tollu (inner ring only)

Scoped entirely to the inner ring (positions 16–23) — nothing here changes outer-ring or home/
center behavior, which stay exactly as described above.

- **Tollu**: 2 of a player's own pieces sharing one inner-ring cell (already legal per the
  inner-ring stacking rule above). Purely incidental — either piece can still be moved away
  individually like normal, dissolving the tollu, unless the player instead chooses to bond it
  (below).
- **Tollu capture (by a single opposing piece)**: landing on an opponent's tollu with an ordinary
  (non-gatti) piece captures only **one** of the two pieces — the other stays put, no longer part
  of a tollu.
- **Forming a Gatti**: with a pool value of exactly **2** selected, a player may bond an eligible
  tollu into a permanent **gatti** — both pieces move together 1 square forward and are bonded for
  the rest of the game. This is a distinct action from an ordinary move (a "Form Gatti" button/
  badge on the board, shown only when eligible), since it moves both pieces together by a
  different distance than either would move alone with the same value. Once bonded, the two
  pieces can never be split apart again — they always move together until either both are
  captured (sent home, unbonded) or both reach the center.
- **Gatti movement**: a bonded gatti advances only on pool values **2, 4, or 8**, moving by
  (respectively) **1, 2, or 4** squares — half the normal per-value distance. Every other value
  (1, 3) is simply not a legal move for that gatti; the player can still use it on another piece.
- **Gatti capture (by a gatti)**: for **each opponent** present on the landing cell, independently,
  a gatti captures only that opponent's single highest-priority group — their **gatti** pair, if
  they have one there; else their **tollu**; else a lone **single** — never more than one group
  from the same opponent, so at most 2 of their pieces are ever sent home this move even if they
  happened to have several groups coexisting on that cell (e.g. their own gatti pair *and* a
  separate tollu both sharing it — only the gatti is taken, the tollu is left completely alone). If
  that opponent has two entirely separate gatti pairs there, only one pair is captured — the other
  survives untouched. Different opponents sharing the same cell are each resolved this way
  independently, so a single gatti move can still capture from more than one opponent at once (e.g.
  one opponent's gatti *and* a different opponent's lone single, in the same move) — the "only one
  group" limit is per-opponent, not a hard cap on the whole move. A gatti capture grants the normal
  capture bonus roll (§5.6), same as any other capture.
- **A single piece can never capture a gatti** — landing exactly on an opponent's gatti's cell is
  legal but captures nothing; the two simply coexist on that cell.
- **A single piece can never cross (jump over) a cell occupied by an opponent's gatti** — a move
  whose path would pass over such a cell is illegal outright, even if the final landing square
  itself is empty. Landing *exactly* on the gatti's cell is fine (see above); continuing further
  past it is only possible on some later turn, once actually starting from that cell.
- **The rest is at least a full turn, not just one move**: a piece that just landed on an
  opponent's gatti cell can't be moved again *at all* — with any pool value, including a further
  value from the same bonus-roll chain — until it survives all the way to its own owner's next
  turn. Only then (assuming the gatti hasn't moved away and captured it first — below) is it free
  to continue.
- **A gatti moving away exposes whoever it left behind**: any single opposing piece that had been
  resting on a gatti's cell (having stopped there instead of crossing it) is captured the instant
  that gatti moves off the cell, whichever direction/turn that happens.
- **A cell can hold any combination** of a player's own gatti pair(s), an incidental tollu, and
  lone singles at once — including two entirely separate gatti pairs of the *same* player (e.g.
  pieces 1+2 bonded one way, 3+4 bonded separately) coinciding on one cell. Each pair only ever
  moves with its own actual bonded partner, never "whichever other gatti piece happens to be
  here" — tracked via an explicit bond between the two piece ids, not just shared position.

## 8. Winning & Rankings

- A player finishes (and is ranked) the moment all 4 of their pieces reach the center (position 24).
- A player is also removed from play (without finishing) if: they're the last one standing when
  everyone else has finished (auto-ranked last), they're forfeited during a partial abort (§9/§13),
  or the no-capture-chance rule declares them lost (§7).
- Play continues among remaining players until only one is left; that player is ranked last
  automatically (no forced "loss" language before then).
- Final placement order: 1st, 2nd, 3rd, and — for 4-player games — a 4th/last place, which counts
  as a "loss" for statistics purposes (see §10).
- **Ranking order among forfeited/eliminated players**: a real finish always outranks a mere
  forfeit or no-capture-chance elimination, regardless of which happened first in wall-clock time.
  Among players who never finished, the order they dropped out in is reversed for ranking purposes
  — whoever forfeits/is eliminated **first** lands in the **worst** remaining place, and each
  player who drops out **later** outranks everyone who already dropped out before them, since they
  lasted longer in the game. Example (4 players, nobody finishes): P2 aborts first while the other
  3 continue → P2 ends up last (a Loss); P1 aborts next while P3/P4 continue → P1 ranks 3rd; P3
  aborts last, leaving P4 the sole survivor → P3 ranks 2nd and P4 (who never quit) ranks 1st.
  This applies symmetrically to a genuine finish that happens *after* an earlier forfeit/
  elimination too — the finisher is inserted ahead of any already-recorded forfeiters, never
  behind them, so their placement is correct (and permanently stable) the moment they finish,
  regardless of who had already dropped out before them.

## 9. Hotseat: Setup, Resign & Session Flow

*(This section is hotseat-specific — see §13 for how setup/abort/session work in online mode,
which differ meaningfully since players aren't sharing one device.)*

### Setup
- At the start of a session, let the host pick 1–4 players.
- **1 player** is a real option, not a placeholder — it secretly plays the same 2-seat game against
  the same AI opponent Vs Computer uses (§14): the setup screen only asks for the one human's name
  (no seat rows for the AI at all), and once the game starts, a second seat named **"Indramma"**
  plays itself out automatically using the exact same decision logic Vs Computer's AI turn does.
  The "Indramma" name never pollutes the saved roster, and it doesn't need Resignation Allowed
  special-cased — resigning still just means the human forfeiting, which (with only the AI left)
  ends the game the same way any single-survivor forfeit does.
- For each *human* seat, allow either selecting an existing/previously-played player (from stored
  roster) or entering a new player name. The roster picker is a plain `<select>` next to the
  free-text name input (not an `<input list>`/`<datalist>` combobox — see §12's Decisions log for
  why: several browsers stop reopening a datalist's suggestions once the field's value exactly
  matches one of them, so switching to a different roster name required clearing the field first).
- Assign colors/base positions per §3 and display them on the board and player list.
- A **"Resignation Allowed?"** toggle, alongside the sound and roll-back toggles, defaulting to
  **Not Allowed**. Controls whether the Resign Game button (below) appears during the game at all.

### Resign
- Shown only when Resignation Allowed was turned on at setup; hidden entirely otherwise.
- Not a vote: clicking Resign Game **unconditionally** resigns whoever's turn it currently is (the
  same player the shared device is currently "on") — no confirmation is asked of anyone, since the
  resigning player has already made their own call. Equivalent to a forfeit (§8): their pieces are
  removed from the board and they're ranked out immediately (see §8's ranking-order rule for where
  they land relative to other forfeits/eliminations).
- After resigning, a **Resign Information** notice is shown (title "Resign Information", body
  "<player> accepted defeat and resigned. The player pieces will be removed from the board. Do you
  want to continue playing with remaining players") — purely informational (a single acknowledgment
  button), not a yes/no decision; the remaining players always continue automatically once
  dismissed (or the results screen shows immediately, if that resignation ended the game).

### Session & Rematch
- A **session** is one continuous sequence of games played by the same browser instance.
- When a game ends, show that game's final ranking, then ask whether to play again with the same
  players (same session).
- If yes (**"Play Again (Same Players)"**) → reset the board/pieces and start a new game, keeping
  the running session tally, staying in this same mode.
- If no (**"End Session"**) → return all the way to **mode-select** (`/`), not just this mode's own
  setup screen — the player can pick a different player count/roster here, or switch to a different
  mode entirely, rather than only being able to restart within whichever mode they just finished.
- A session has no cap on the number of games played.
- Show a cumulative **session summary table** (all players, all games played so far this session)
  after every game.

## 10. Statistics

Tracked **per player**:
- Total games played.
- "1st Win" % — finished 1st.
- "2nd Win" % — finished 2nd.
- "3rd Win" % — finished 3rd.
- "Loss" % — finished last, resigned, or lost via the no-capture-chance rule (§7), while other
  players continued the game.
- "Resigned" % — an **informational sub-count, not exclusive with Loss**: a resignation is still
  always counted as a Loss too (§8) — this just additionally tracks what fraction of a player's
  games ended via Resign specifically, rather than a natural last-place finish or a no-capture-
  chance elimination.
- "Declined" % (**online only**) — the player declined an invite (§13). Recorded the moment they
  decline, independent of whether that game ever actually starts. Distinct from every other
  category, including the pre-start creator cancellation (§13), which isn't recorded anywhere.

**Next level: games by player count** — a second, deeper breakdown (shown in the per-player Stats
modal, reached by clicking a player's name) of how many games that player has played at each
originally-selected player count: **1 Player**, **2 Player**, **3 Player**, **4 Player** — raw
counts, not percentages. "1 Player" always means the solo-vs-AI option (hotseat/online's own
"1 player" choice, §9/§13, or Vs Computer, which is this experience by construction, §14) even
though it's a real 2-seat game underneath — bucketed by what the human actually chose at setup, not
by how many `GameState.players` entries the engine ends up with. Online's own bucket uses the
game's originally-planned seat count (however many actually joined vs. declined doesn't change it).

**Hotseat**: stats are per-player-name, stored in the browser (`localStorage`) — see §12's "still
open" note; not synced across devices or browsers.

**Online**: stats are per-account, stored server-side (Postgres `player_stats` table, one row per
registered player, bumped by the server whenever a game finishes) — persistent across every device
that account logs into. There is currently no UI to view online stats (the data is recorded but not
yet surfaced in the online screens).

All stats are shown as a percentage of total games played. Clicking a player's name (on the board,
or in the session summary table) opens their full lifetime statistics (**hotseat only**, currently).

## 11. UI & Interaction Requirements

### Play Area panel
The right-hand panel next to the board ("Play Area", chocolate-brown background, fixed footprint
close to the board's own height) contains, top to bottom:
1. A text box announcing what just happened, kept deliberately terse: player name plus a 1-word
   action and, where it adds something, one more word — "Ravi's turn," "Ravi rolled 3," "Ravi
   captured 2," "Ravi finished 2nd," "Ravi won" — not a full sentence (the fuller, natural-sounding
   phrasing is reserved for the *spoken* announcement, a separate thing — see the spoken
   announcements subsection under §16).
2. **Dice row**: the round kavade-throw area (shows a shaking-hands idle animation while waiting
   for a roll, then the scattered result of the latest throw once rolled) sits beside — not above
   — **Game Controls**: one uniformly-sized, full-width, vertically-stacked button column —
   - The roll button.
   - The Roll Back Last Move button, once available.
   - The cumulative list of pool values still to be played this turn ("Moves still to play").
   - The Resign Game button, shown only when Resignation Allowed was turned on at setup — hotseat
     (§9), online (§13), and Vs Computer (§14) all use this same unconditional self-resign flow,
     identical in behavior everywhere; Vs Computer's one necessary adaptation is *who* it resigns
     (always the human, since there's no "whoever's turn it is" to pick between when only one seat
     is ever human — see §14) — and the **App Controls** button (labeled "App Control"), sharing
     this same bottom row rather than its own — the one pair of buttons in the column that sit
     side by side instead of stacked, at the user's explicit request. When Resign isn't offered at
     all, App Control simply fills that row alone.

   Every button in this column shares the same size (height, padding, and the same gradient/shadow
   "keycap" styling, just its own color per button) rather than each having its own dimensions —
   reads as one deliberate, cohesive control group. Stays side by side with the dice circle at
   phone widths too (the circle becomes a tall ellipse there instead of reflowing to stacked — see
   the Decisions log for why).
3. **App Controls** opens right on top of the whole dice-section row (throw area *and* Game
   Controls together, not just the throw area alone) — not a popover anchored to the button, but a
   full overlay at exactly that row's own position and size. Scrolls internally if its content
   doesn't all fit at that size rather than overflowing. Contains: the language toggle (§16), the
   sound on/off toggle, the Report Bug button, Sign Out/Exit, and — online mode only, currently
   absent while voice chat is disabled app-wide (see the Decisions log) — voice call setup
   (join/leave, mute, and any connection-failure status; §13). Consolidates everything that used
   to be a wide row of buttons under the dice into one small control, so the panel's fixed width
   goes to Game Controls/the board instead (see the Decisions log for why).

The app-wide title/version bar shown on every other screen (mode select, login, setup) is hidden
entirely while a live game is on screen — see the Decisions log entry below.

*(Numbering above follows the original spec as given; item 4 was not specified. Online mode's
gameplay screen mirrors this same layout, plus a Report Bug button — see §13.)*

### Capture-status indicator
Every player's home label shows, in addition to their name, whether they've captured a piece yet —
"Not Captured" until their first capture, then "Capture Done" for the rest of the game (also in the
label's hover tooltip). Reflects the same `hasCaptured` flag that gates inner-ring entry (§7), so it
doubles as a visible explanation for why a player's pieces can't yet enter the inner ring. Shown in
every mode, on the shared `Board` component — not mode-specific.

### Gatti & Tollu visuals
- **Forming a gatti**: when an inner-ring cell holds an eligible tollu of the current player's own
  pieces (§7) and a pool value of exactly 2 is selected, a small "Form Gatti" badge appears pinned
  to that cell — a distinct affordance from clicking a piece, since bonding moves both pieces
  together by a different distance than selecting either one alone would.
- **A gatti renders as one capsule**, not two separate piece beads: both bonded pieces sit inside a
  single translucent pill shape that moves as a unit (one animated element, not two coincidentally
  matching ones) — clicking anywhere on the capsule selects the pair, exactly as clicking either
  underlying piece would.
- **A tollu renders with a shared grouping cue** (a dashed outline around the two pieces) so it
  reads as a meaningful pairing at a glance — but the two pieces underneath stay fully independent:
  either can still be clicked and moved on its own, same as any lone piece (the player's other
  choice besides forming a gatti — see §7).
- This grouping (gatti capsule / tollu outline / plain lone piece) only ever applies inside the
  inner ring, matching where the gatti-tollu rules themselves apply — pieces sharing home or the
  center (every player starts with all 4 stacked at home) always render as plain individual pieces,
  never as a "tollu," since stacking there is just ordinary safe-cell behavior with nothing
  gatti-related about it.
- Shown in every mode (hotseat, Vs Computer, online, Develop Test) on the shared `Board` component.

### Player status indicator
A second line on every player's home label shows their live status, one of: **Playing** (still
active), **Lost** (forfeited, no-capture-chance-eliminated, or the automatic last-place loss), or —
once knowable — an exact placement: **Winner**, **2nd place**, **3rd place**. Online-declined
players show **Declined** instead (§13). A player removed via hotseat's Resign Game (§9) shows a
"(Resigned)" qualifier appended to their status.

An exact placement (as opposed to the generic "Lost") is only shown once it's actually settled: a
genuine finisher's placement is stable and shown immediately (§8's ranking-order guarantee makes
this safe), but a forfeited/eliminated player's *exact* final rank isn't knowable until the game
ends — a later forfeit can still push an earlier one down a spot — so they show generic "Lost"
until then, and their precise placement appears once the game reaches `game-over`.

### Highlighting & attention cues
- Legal-move piece highlighting per §7.
- Whenever more than one pool value is still owed this turn, both the moves-list panel and each
  individual still-pending value box pulse/flash, for as long as multiple values remain pending —
  not just during the moment of picking which value to use next, but through picking a piece too.
- Clicking a piece before a pool value has been picked shows a transient on-screen nudge ("Select
  a dice value first.") plus a matching spoken announcement, instead of doing nothing silently.
- Only the piece that actually moved animates on the board; other pieces must not visually
  reset/restart their own animation (e.g. the active-turn pulse) when an unrelated piece moves.

### Audio / announcer
Spoken (Web Speech) and chime (Web Audio) announcements fire for:
- **The start of every turn** — spoken immediately (not just after a period of inactivity), naming
  whose turn it is and what to do.
- **A completed roll** — states the result *and* what to do with it (e.g. "<name> rolled <label>.
  Move your piece." — or, on a bhara/chauka bonus, the bonus call-out plus "roll again"), not just
  the bare number, so every spoken roll doubles as a complete instruction on its own.
- **A capture** — including the "roll again" instruction, since capturing always grants a bonus
  roll (§5.6) — and **a piece/player finishing**.
- **A turn getting undone** (stuck pool, or a finish reached with pool values still unplayed —
  §5.5) — otherwise this only ever showed up as on-screen text. Combined with the following turn's
  own start announcement into one utterance, rather than firing both back to back (the announcer
  has no queue — a second `speak()` call cuts off whatever was still playing).

Spoken announcements follow the Language setting (§16) — but only when a real Kannada voice is
actually installed on the device. Setting `utter.lang = 'kn-IN'` alone is not a reliable enough
signal: when no matching voice exists, browsers commonly substitute a default voice anyway rather
than refusing to speak, and that substitute can't pronounce Kannada script — in practice it reads
through any Latin-script run it recognizes (e.g. a player's own name) and produces nothing audible
for the Kannada text that follows, so only the name gets announced. The announcer checks for an
actual installed Kannada voice (`speechSynthesis.getVoices()`) before attempting Kannada speech;
if none is found, it falls back to the English announcement instead of a partial, broken Kannada
one. This fallback is speech-only — the on-screen banner and labels always show the selected
language exactly, regardless of what gets spoken.

**Every player hears every announcement**, not just whoever is currently acting — in hotseat this
is automatic (one shared device/speaker); in online mode each connected device independently
speaks all of the above off the same synced game state, with no filtering by whose turn it is or
which seat that device is viewing (only the per-device mute toggle, §13, silences a given device).

Sound can be toggled off both from the setup screen and, independently, at any time during a game
from the Play Area panel; the on/off state is shared between the two toggles (hotseat), and is its
own independent toggle in online mode (see §13) since each device controls only its own audio.

Mobile browsers can silently block programmatic speech/audio that isn't tied closely enough to a
user gesture — most relevant in online mode, where a roll's resulting announcement is triggered by
a socket broadcast arriving asynchronously after the gesture that caused it, not synchronously
inside a click handler the way hotseat's local reducer calls are. To mitigate this, every
tap/click/keypress anywhere on the page "primes" both the Web Speech and Web Audio APIs (a silent
utterance + resuming the audio context), not just the first one: priming keeps retrying on every
qualifying gesture (and when the tab regains visibility, e.g. after the phone was locked
mid-game) until it actually succeeds and on every gesture afterward re-resumes either API if it
drifted back to suspended/paused, rather than a single first-gesture attempt that permanently
marked itself "unlocked" even when it silently failed — the latter was the likely cause of a
report where one connected device (a 2nd player joining from an iPhone, in a 2-player online game)
never heard any announcements despite the exact same broadcast-triggered code working correctly on
another device in the same game.

### Error resilience
The whole app is wrapped in a React error boundary (`ErrorBoundary.tsx`, mounted around `<App />`
in `main.tsx`): any render-time exception anywhere in the tree shows a plain "Something went
wrong — Reload" screen instead of React's default behavior with no boundary in place, which is to
silently unmount the entire tree and leave a blank page with no visible error at all. `localStorage`
access throughout the app (the auth token, the language preference) is wrapped defensively, since
some in-app browsers (notably some link-opening webviews, exactly the context an invite link gets
opened in) restrict storage access and throw rather than just returning empty — an unguarded read
here was a real, reproduced cause of the app getting stuck (see §12).

### Setup screen
- Player count (1–4) selectable, with per-seat name entry for however many human seats that
  implies (just one for the "1 player" option — see §9); existing roster names can be reused, new
  names typed freely.
- The sound on/off prompt is shown after player selection, phrased as a yes/no-style question
  ("Do you want announcements or instructions?").

## 12. Decisions & Assumptions Log

Resolved during requirements gathering:
- **Safe squares**: all 4 bases + center are safe for *everyone*, not just the owner (§6). This is a
  behavior change from the first HTML prototype, which only protected a piece at its own path
  position 0/24 — fixed.
- **Capture bonus**: capturing grants one more roll (bonus-chain eligible), added on top of the
  current move pool — any not-yet-used value already in the pool is kept, not discarded (§5.6).
- **Stats persistence (hotseat)**: player roster and lifetime stats are saved in the browser
  (`localStorage`) so they survive page reloads/reopens — not just kept in memory for one tab
  session.
- **Tech direction**: React 19 + TypeScript + Vite for the frontend (`app/`), Node.js + TypeScript
  + Express 5 + Socket.IO for the online backend (`server/`), a shared pure game-logic package
  (`packages/game-core`) consumed by both. Uses framer-motion for animations. npm workspaces
  monorepo. The original `board_game.html` prototype and sketches remain at the project root as
  reference only, untouched.
- **Overshoot rule**: a dice value that would move a piece past position 24 is not a legal move for
  that piece (must land exactly on center). Implemented.
- **3-player base assignment**: uses P1, P2, P3 (skips P4). Implemented.
- **Loss definition for a 4th-place finisher**: last player standing when others have finished is
  automatically ranked last, without dice/abort involved — counted as a "Loss" in stats.
  Implemented.
- **Inner-ring entry gate**: a player must capture at least one opponent piece before any of their
  pieces may enter the inner ring/center (§7). Implemented; not part of the original single-file
  prototype.
- **No-capture-chance auto-loss**: added after online play surfaced games that could stall forever
  when a player who'd never captured ran out of any realistic way to ever do so. Declared lost the
  moment it's provably impossible (every active opponent's every piece either finished or
  geometrically unreachable along this player's own remaining path), computed every turn change,
  rather than on a fixed turn-count heuristic (§7). Implemented in both modes via the shared
  `packages/game-core` engine.
- **Abort/forfeit direction**: on a partial abort (some players decline), the pieces removed belong
  to the player(s) who *agreed to abort*, not the decliners — the decliners are the ones who
  continue playing (§9/§13). An earlier reading of this section had it backwards; corrected.
- **Turn revert on a stuck pool**: if a player gets stuck with an unplayable pool value partway
  through a turn (including partway through a capture-bonus reroll chain), every move and capture
  made since the turn began is undone before passing to the next player (§5.5). Implemented.
- **Finishing does not exempt a turn from the stuck-pool revert**: originally, a player who
  finished all 4 pieces mid-turn kept the win even if leftover dice went unused. Reversed at the
  user's request — a finish reached with pool values still unplayed is now undone along with the
  rest of that turn's moves, exactly like any other stuck turn; a finish only counts once the
  entire pool has been used (§5.5).
- **Stats categories**: placement stats are labeled "1st/2nd/3rd Win"; a full unanimous abort is
  tracked as a distinct "Aborted" stat rather than folded into "Loss", and counts toward total
  games played for every player in that game (§10).
- **Legal-move highlighting**: only pieces with an actual legal move (for the selected value, or
  any pending pool value before one is picked) are visually highlighted; finished pieces are never
  highlighted (§7, §11).
- **Spoken language**: all *spoken* announcements are in English; on-screen text stays Kannada
  (§11). Switched from all-Kannada speech after determining Kannada voices aren't reliably
  available across devices/browsers, which was silently producing incomplete or garbled
  announcements — English is close to universally supported by `speechSynthesis`.
- **Per-viewer board rotation (online)**: added at the user's request so each player's own base
  reads as "close to them" (bottom of their screen) and their own path is easiest to follow,
  instead of every device showing the same fixed P1-at-bottom layout regardless of actual seat
  (§2). Implemented as a pure display-layer rotation in `Board.tsx`, reusing the same coordinate
  rotation `packages/game-core/paths.ts` already uses to derive P2–P4's paths from P1's — no
  change to game logic, piece positions, or what any other player's device renders.
- **Idle-nudge announcement removed**: hotseat previously had a repeating spoken reminder after 5s
  of inactivity ("hurry, roll"/"hurry, move"). Removed at the user's request; turn-start and
  post-roll announcements (§11) already state what's pending without it.
- **Online identity**: email + a mandatory display name, with no password and no email
  verification — logging in is just "does an account with this email exist?" (§13). Chosen for
  simplicity for a small trusted group, over magic-link email verification (tried first, then
  simplified) or full OAuth.
- **Online invites**: link-sharing (copy/WhatsApp), not per-account email invites picked from a
  dropdown — the creator only picks a player count; whoever opens the link next claims the next
  open seat (§13). Emailing invites was the original design; dropped in favor of a simpler,
  faster flow once login-first + link-based joining was adopted.
- **Online session auth**: a bearer token in `localStorage` (sent as an `Authorization` header and
  in the Socket.IO handshake), not a cookie — the frontend (Vercel) and backend (Render) are on
  different domains, which makes a session cookie a third-party cookie that modern browsers
  increasingly block by default regardless of `SameSite`/`Secure` settings. Switched to a token
  after cookie-based auth was found to silently fail in production for exactly this reason.
- **Online abort**: mirrors hotseat's consensus semantics (§9) but adapted for separate devices —
  a request/response socket flow with server-held per-game vote state, rather than one shared
  modal. On a 2+-decline tie, the *original requester's* device (not a generic "whoever's
  resolving it") gets the forfeit-vs-resume follow-up decision, since there's no single shared
  screen to ask everyone at once (§13).
- **Aborted games are terminal**: reopening a link to a game that was fully aborted shows "this
  game was aborted" rather than the stale last board state — the DB row's `state` column isn't
  cleared on abort (only `status`), so this had to be checked explicitly client-side (§13).
- **Invitee selection lives entirely in WhatsApp, not this app**: the creator only ever shares one
  link via WhatsApp's own contact picker — the app has no invitee list, phone numbers, or contacts
  of its own. What the app *does* track is who actually opens that link afterward and whether they
  join or decline (§13).
- **Decline, not just non-response**: opening an invite link shows an explicit Join/Decline choice
  rather than auto-joining. Declining claims a seat slot (as `status: 'declined'`), is recorded in
  stats immediately, and is later shown distinctly on the board once the game starts — separate
  from simply never responding, which leaves that slot open indefinitely (§13).
- **Seat reassignment on start, not on join/decline**: because the final joined count isn't known
  until Start is actually clicked, seat letters are finalized then — joined players re-seated onto
  the fair topology for their count, declined players onto whatever's left over from the original
  plan — rather than trying to keep a stable seat letter per player from the moment they respond
  (§13). Explicit worked examples from the user: 4 planned/1 declined → joined get P1-P3, decliner
  gets P4; 3 planned/1 declined → joined get the fair P1/P3 pair, decliner gets P2.
- **Creator's pre-start cancel is unilateral**: no vote, unlike in-game Abort (§9/§13) — the game
  hasn't started yet, so there's no shared investment to protect by requiring consensus, and it
  isn't counted in anyone's stats since no game was actually played.
- **Eliminated players are never silently omitted from results**: found after a player eliminated
  by the no-capture-chance rule (§7) could end up missing from the game-over screen entirely, with
  the *survivor* incorrectly shown as the loss instead. Fixed by recording every elimination
  (no-capture-chance or forfeit) into the placement order the instant it happens, rather than
  inferring it later from "whoever's left"; the sole remaining survivor is only auto-ranked last
  (§8's original rule) when every other player got there by genuinely *finishing* — never when
  they got there because opponents were eliminated, which would wrongly blame the survivor. Also
  fixed a related ordering bug where eliminating one player could spuriously cascade into
  eliminating another in the same pass, purely because the first player's own elimination had
  already made them look unreachable to the second — every candidate is now checked against one
  consistent snapshot instead of each other's just-applied changes.
- **Online rematch**: added so finishing an online game isn't a dead end the way it briefly was —
  any participant can restart with the same seats, mirroring hotseat's existing "play again."
- **Vs Computer**: a third mode added at the user's request — single device, always 2 players
  (1 human + 1 AI), a rule-aware but not unbeatable heuristic opponent (§14) rather than a perfect
  solver. Implemented as its own page (not folded into hotseat's) to avoid adding AI-turn
  conditionals to the more heavily-used hotseat flow.
- **No post-login "Welcome" screen**: removed at the user's request — login now leads straight to
  mode-select, no separate acknowledgment screen in between (§13).
- **Vs Computer pacing**: the AI's turn waits 2 seconds between each step (roll, move, capture,
  bonus roll — up from an initial 1 second), long enough to actually hear each announcement before
  the next one fires. Briefly made the computer's turn silent (human-only announcements) per an
  earlier request, then reverted back to announcing every turn regardless of whose it is — same as
  hotseat/online — per a follow-up request (§14).
- **Mode-select order and labels**: reordered to Single player (vs computer) → Multiple players
  (Local, hotseat) → Multiple Players (Online), relabeled from the original "Play vs
  Computer"/"Play Locally"/"Play Online" wording, per the user's explicit request. Develop Test
  (§15) was added afterward as a 4th button, appended at the end.
- **Develop Test's "has captured" flag is set manually, not inferred**: the original plan
  auto-derived a player's `hasCaptured` flag from whether any of their pieces was placed in the
  inner ring during editing. Superseded, before implementation, by an explicit request for a manual
  per-player checkbox in the editor (defaulting to unchecked/"Not Captured") instead — placing a
  piece in the inner ring during editing has no side effect on the flag (§15).
- **Capture-status indicator**: added at the user's request as a general, all-modes visual (§11),
  not specific to Develop Test — Develop Test's manual toggle (above) was requested as a companion
  feature once the general indicator existed, so the editor could set the same flag it displays.
- **Forfeit/elimination ranking order fixed** (§8): both `removePlayers` (abort forfeits) and
  `markUncapturedDeadlocks` (no-capture-chance eliminations) used to just append newly-removed
  players to the end of `rankings` in the order they were removed — which, combined with
  `rankings[0]` meaning 1st place, put the *first* player to quit in the *best* available slot and
  each later quitter in a progressively worse one, backwards from the intuitive "the earlier you
  quit, the worse you place." Found via a worked 4-player example from the user (sequential aborts
  down to one survivor) that the old code placed in exactly the wrong order. Fixed with a shared
  `insertIntoRankings` helper: new removals are inserted right after any already-recorded genuine
  finishers (a finish can never rank worse than a mere forfeit/elimination) and right before any
  previously-removed players (so the most recent quitter always outranks earlier ones). A follow-up
  pass completed the guarantee on the *finish* side too — a genuine finish was still just appended
  to the absolute end of `rankings`, which could rank a finisher worse than an earlier forfeiter;
  now reuses the same helper (renamed from `insertRemoved` once it served both purposes). Lives in
  `packages/game-core`, so hotseat, online, vs-computer, and Develop Test all picked up the fix
  from the one shared reducer.
- **Hotseat "Abort Game" replaced by unconditional "Resign Game"** (§9): the old flow (screenshot
  from a bug report) asked every active player, including whoever actually wanted to quit, to
  Agree/Decline one-by-one through `AbortModal.tsx`, then asked a further Yes/No about removing the
  agreers' pieces — confusing, and never actually fixed to skip the initiator despite an earlier,
  separate attempt (that fix only ever landed in online's own abort flow, §13). Replaced with an
  unconditional resign, always applying to whoever's turn it currently is, with no vote at all —
  followed by a purely informational "Resign Information" notice (`ResignModal.tsx`, replacing the
  deleted `AbortModal.tsx`) rather than another decision. Reuses the same `removePlayers` forfeit
  path (and its now-correct ranking order, above) internally. Scoped to hotseat/Develop Test only
  — online's own multi-device abort flow (§13) and Vs Computer's single-human immediate abort
  (§14) were left untouched, since neither had the bug this was reported against.
- **"Resignation Allowed?" setup toggle**: added alongside the rename so resigning isn't always
  available — defaults to **off** (`Not Allowed`), matching the pattern of the sound/roll-back
  toggles already on the setup screen. The Resign Game button is only rendered at all when this is
  turned on for that session.
- **Player status indicator** (§11): added alongside a specific worked example from the user
  (Playing/Lost/2nd/3rd/Winner, plus a Resigned qualifier) — implemented as a new status line on
  the existing home-label, reusing `computePlacements` rather than inventing a parallel ranking
  concept. Exposed a real bug while implementing it: the finish-ranking fix above only completed
  the *removal* side of "a finish always outranks an earlier forfeit," not the finish side itself
  — fixed in the same pass (see above) once it became clear an exact placement had to be reliably
  knowable to display it. Also exposed a second, adjacent bug in the finish-announcement effects
  (`HotseatPage.tsx`/`VsComputerPage.tsx`/`OnlinePlay.tsx`): they identified "who just finished" by
  assuming the newest `rankings` entry was always the *last* array element, true only when
  insertion was strictly append-only — no longer true once a finish can land ahead of an earlier
  forfeit — and had no check at all for whether the newly-ranked player had actually finished
  (vs. forfeited/been eliminated), so a forfeit could have been announced as a "finish." Fixed by
  diffing against the previous render's `rankings` array to find the actually-new id(s), and only
  announcing ones where the player isn't `hasLost`.
- **Language setting** (§16): a global English/Kannada toggle, defaulting to English, reachable
  from the app header on every screen after the welcome splash. Revisits §12's earlier
  English-only-speech decision at the user's explicit request — Kannada TTS is now attempted when
  selected, accepting the same voice-availability risk that decision originally avoided. The
  welcome splash itself is a deliberate exception: always Kannada, since it's shown before the
  toggle exists to make a choice with. Implemented entirely as a display-layer concern (an
  `app/src/i18n/` module plus a sweep of every component) — no `packages/game-core` changes, same
  principle as board rotation (§2) and the capture/player-status indicators.
- **Kannada speech falls back to English when no real Kannada voice is installed** (§11): reported
  as "only the player's name gets announced, the instructions are missing" — root cause was that
  `utter.lang = 'kn-IN'` is only a hint; with no matching voice actually installed, browsers
  commonly substitute a default voice anyway instead of refusing to speak, and that substitute
  reads through the Latin-script name it recognizes but produces nothing audible for the Kannada
  text after it. Fixed by checking `speechSynthesis.getVoices()` for an actual Kannada voice and
  explicitly assigning it (`utter.voice`, not just `utter.lang`) — falling back to the English
  announcement (of the same key) when none is found, rather than a partial, broken Kannada one.
  Speech-only; the on-screen banner/labels are unaffected and always show the selected language.
- **Vs Computer AI pacing waits for the announcement to actually finish**: the fixed 2-second delay
  between the computer's turn steps was a guess at how long an announcement takes to speak — a
  longer sentence (a bonus roll or capture) could still be playing when the next action fired,
  audibly cutting it off (`speak()` always cancels-and-replaces). Fixed by adding
  `waitForAnnouncer()` to `announcer.ts` (resolves once the current utterance's `onend`/`onerror`
  fires, with an 8-second safety-net timeout so a caller can never get stuck waiting on an
  environment where those events never fire at all) and having the AI-turn effect wait for
  whichever is longer of the fixed delay and the announcement actually finishing.
- **Vs Computer abort now offers the same Rematch/End Session choice a natural finish does**:
  previously `handleAbort` nulled the game state directly, dropping straight back to the name-entry
  screen with no way to quickly play again. Now reuses `ResultsModal` with a new `aborted` prop
  (skips the placement list, since nobody was actually ranked) rather than inventing a separate
  modal — requested for "abort or natural end of game" generally; implemented for hotseat (already
  had this via Resign's natural end, §9) and Vs Computer. Initially left out of online's own Abort
  flow (§13) — its `/rematch` endpoint explicitly rejected anything but a `'finished'` game — since
  extending it meant reversing that restriction, not just a UI tweak. Done as a follow-up, once
  explicitly asked for (§13): the `/rematch` endpoint now also accepts `'aborted'`, since an
  in-game abort (unlike a lobby cancellation) already leaves the last live board position intact
  in the `state` column — only `status` changes (§12's own earlier note on why that's true) — so
  there was a real position to rematch from all along, the endpoint just hadn't been told it could.
  Reopening a *stale* aborted link later is unchanged and still shows the terminal message — this
  only concerns the live "Game Aborted" screen shown right when an abort happens to whoever's still
  in that session (§13's own Game over section).
- **"End Session" now returns to mode-select, not just the same mode's own setup screen** (§9):
  previously each mode's "End Session"/"New Game" only reset back into its own setup form
  (`SetupModal` for hotseat, the name-entry form for Vs Computer), so switching modes mid-session
  meant manually navigating away first. Now navigates to `/` via `react-router-dom`'s `useNavigate`,
  matching "many options available to continue playing" — every mode reachable from mode-select,
  not just a restart of the one just played.
- **Roster picker replaced with a plain `<select>`**: the seat-name field used `<input list=".../">`
  with a `<datalist>` of roster names — several browsers (Chrome included) stop reopening a
  datalist's suggestion popup once the field's value exactly matches one of the listed options, so
  picking a *different* roster name required clearing the field first before the list would show
  again. A real `<select>` (rendered alongside the free-text input, not replacing it — a brand-new
  name still just gets typed) has no such quirk: it always reopens on click and can be used to
  switch the chosen name as many times as needed. Reset back to its placeholder option after every
  pick so selecting the same name twice in a row still fires a change event.
- **Copy Link removed; WhatsApp opens automatically for the creator** (§13): requested explicitly
  to streamline "create → invite" into one continuous motion instead of a manual copy-and-paste
  step. Auto-opening on page load (rather than only on a button click) risks being popup-blocked,
  since it fires after an async fetch rather than synchronously inside the "Create Game" click —
  accepted as a known tradeoff at the user's request; the manual "Share on WhatsApp" button stays
  as a fallback and for inviting more people later. Distinguishing "just created it" (auto-open)
  from "revisiting this lobby later" (don't) uses `react-router-dom`'s per-navigation
  `location.state`, not persisted storage — it's naturally only present on the one navigation
  right after creation, gone on any later visit via the URL itself.
- **Blank-page-on-invite-link bug, root-caused and fixed** (§11): reported as "WhatsApp message
  reached the player, but clicking the link doesn't join the game — just a blank page, no error."
  Reproduced by simulating a browser that blocks `localStorage` access (throws instead of just
  returning empty) — a real, documented behavior of some in-app/link-opening webviews, exactly the
  context an invite link gets opened in. `api.ts`'s `getToken()` wasn't guarded against this
  (unlike the language preference's own storage read, which already was), and the resulting thrown
  error, surfacing as an *unhandled promise rejection* inside `AuthGate`'s unguarded
  `fetchMe().then(...)` chain (rejections don't trigger a React error boundary — the `.then()`
  callback just silently never runs), left the screen stuck on "Loading…" forever with nothing
  else ever rendering. Fixed at three layers: guarded every `localStorage` call in `api.ts`; added
  a `.catch()` so an auth-check failure of any kind falls back to the login screen instead of
  hanging; and added a top-level React error boundary (above) as a general safety net for whatever
  the next unforeseen render exception turns out to be, so "silently blank, no feedback" can't
  happen again regardless of cause.
- **Non-creator's seat going stale after start, root-caused and fixed** (§13): reported as three
  seemingly separate symptoms — "roll dice not enabled" for the second player, an abort request
  from the creator "not showing up" to the second player, and "Start Game" visible to both players
  instead of just the creator. The first two turned out to share one root cause: seat fairness
  reassignment at `/start` (above) can change a joined player's seat letter — e.g. a game planned
  for 4 but only 2 actually joined reassigns the second joiner from their join-time `P2` to the
  fair-topology `P3` — but `OnlineLobby`'s socket handler for "the game just started" still passed
  along whichever seat that client was assigned back at *join* time, never re-checking it. Every
  seat-dependent check downstream (`isMyTurn`, the abort flow's `activeSeats.includes(mySeat)`,
  board rotation) then silently compared the game's real current seat against a seat that player
  was no longer actually sitting in. Confirmed via board rotation specifically — a player's own
  home should always land at the bottom of their own view, and for the affected player it was
  landing nowhere at all, since neither actual seat in a 2-player game was the stale `P2` the
  client still believed in. Fixed by having that handler re-fetch the lobby's fresh seat
  assignment right at the transition instead of trusting the join-time value. The third symptom
  (Start Game visible to both) was unrelated — the endpoint never actually restricted who could
  call it — fixed separately by requiring `createdBy` server-side, mirroring abort-lobby's already
  existing creator-only restriction, plus hiding the button client-side for anyone else.

- **Gatti & Tollu** (§7): a new inner-ring-only rule set from a separate requirements doc
  ("gatti tollu requirement.txt"), implemented across `packages/game-core` (so hotseat, online,
  Vs Computer, and Develop Test all share one engine), `Board.tsx` (the "Form Gatti" affordance
  and gatti piece styling), and the server's socket handlers (`game:form-gatti`, mirroring
  `game:select-piece`). Several interpretive points were confirmed explicitly with the user before
  implementing, since the source doc left them ambiguous:
  - **Scope**: applies *only* once pieces are inside the inner ring (16–23) — no change to
    outer-ring or home/center stacking behavior, which already allowed (inner ring) or disallowed
    (outer ring) a player's own pieces sharing a cell exactly as before.
  - **Permanence**: once a tollu is bonded into a gatti, the two pieces can never be split apart
    again — they move together for the rest of the game until captured (both sent home, unbonded)
    or both reach the center.
  - **Capture bonus**: a gatti capturing anything grants the same bonus roll as any other capture
    (§5.6) — no special case.
  - **The "resting piece" mechanic**: a single piece that stopped on an opponent's gatti cell
    (unable to cross it) is captured the instant that gatti later moves off the cell — confirmed
    this triggers automatically as part of resolving the gatti's own move, not as a separate
    player action.
  Verified two ways before shipping: a scripted check against `packages/game-core` directly
  (bypassing dice randomness) covering all 9 documented mechanics — tollu detection, gatti
  formation and its 2/4/8 → 1/2/4 movement mapping, single-vs-tollu capturing exactly one piece,
  gatti-vs-tollu and gatti-vs-gatti capturing everything, a single piece being unable to capture or
  cross a gatti, the resting-piece capture on gatti departure, and the center-overshoot bound — and
  a live browser pass (Develop Test's Board Editor, dragging a tollu into place) confirming the
  on-board "Form Gatti" button and gatti styling actually appear and work end-to-end, not just the
  underlying reducer logic.
- **Gatti & Tollu follow-up — 2 correctness fixes plus the real visuals** (§7/§11): a closer re-read
  of the source requirement against the first pass above surfaced two gaps, both fixed in
  `packages/game-core/src/rules.ts`:
  - The "rest for at least one turn" wording wasn't actually enforced as a full turn — a piece that
    landed on an opponent's gatti could still be moved again later the *same* turn (e.g. off a
    second pool value from a bonus-roll chain), since legality was only ever checked against the
    piece's current position, with nothing remembering it had just arrived there. Fixed with a new
    `Piece.restingOnGatti` flag, set on landing and cleared only when `turnEngine.ts`'s
    `advanceTurn` next hands the turn back to that piece's own owner.
  - Two of a player's own separate gatti pairs (e.g. pieces 1+2 bonded one way, 3+4 bonded
    separately) could end up sharing one cell — explicitly called out as a valid combination in the
    follow-up ask — but `movePiece` found a moving gatti's "partner" by scanning for *any* other
    gatti piece at the same position, which would grab the wrong sibling once two pairs coincided.
    Fixed with an explicit `Piece.gattiPartnerId` link, set when the pair bonds, instead of
    inferring it from shared position.
  Also replaced the placeholder visuals from the first pass: a gatti now renders as one translucent
  capsule containing both pieces (a single animated element, so it visibly moves as one unit rather
  than two pieces that happen to always land together), and a tollu gets a dashed-outline grouping
  cue around its two still-independently-movable pieces — both gated to the inner ring only, so the
  4 pieces every player starts stacked at home never render as a "tollu." Verified with an expanded
  scripted suite (40 assertions total: the original 9 mechanics plus explicit coverage of the two
  fixes — two separate pairs correctly finding their real partners, and a resting piece provably
  blocked mid-turn then provably freed once its own next turn genuinely arrives) and a second live
  browser pass confirming the capsule and dashed-tollu grouping actually render as designed, not
  just that the underlying state is correct.
- **"Resign Game" everywhere, no more "Abort Game"** (§14): Vs Computer was the last mode still
  using its own separate, always-shown, unconditional "Abort Game" button — hotseat and online had
  already moved to the toggle-gated self-Resign concept in earlier rounds (§9/§13). Replaced for
  consistency, at the user's explicit request that behavior be identical across every mode: Vs
  Computer now has the same "Resignation Allowed?" setup toggle and Resign Information notice,
  resigning the human specifically (the one adaptation necessary — there's no "whoever's turn it
  is" to resign to when only one seat is ever human). This made the "Aborted" stats category (§10)
  fully dead across the whole app — the last mode that could ever produce it stopped — so it was
  removed outright (`applyAbortToStats`, the `aborted` field on `PlayerStats`, the Stats/Results
  modals' Aborted columns) rather than left showing a permanently-zero column. The server's
  `player_stats.aborted` database column is left in place, unused, matching how online's own
  earlier abort-to-resign migration (§13's own history) already handled the same situation.
- **"1 player" option, secretly playing the AI** (§9/§13/§15): added to hotseat, online, and
  Develop Test's player-count choices (Vs Computer already *is* this experience by construction, so
  it needed no new option) at the user's explicit request that it "behave the same as the single
  player game" — confirmed via clarifying question to mean a real AI opponent, not a solo sandbox
  with no one to play against. Hotseat/Develop Test reuse Vs Computer's own client-driven AI-turn
  effect verbatim (same `chooseAiMove`, same pacing) once `handleStart` detects only one human name
  was entered. Online required genuinely new infrastructure, since no client is ever connected for
  an AI-controlled seat: the server now schedules and plays that seat's turns itself
  (`maybeScheduleAiTurn`/`runAiTurn` in `gameplay.ts`, called after every state-changing action —
  roll, move, resign, rematch — so a bonus-roll chain keeps the AI playing itself out exactly like
  the client-driven version's effect re-firing does), broadcasting each move over the same
  `game-updated` event a real opponent's move would use. AI-controlled is determined by the
  *absence* of a `game_seats` row for the AI's seat, not by name or seat id alone, so it can never
  misfire against a real player who happens to be seated there in an ordinary 2+ player game.
  `AI_SEAT`/`AI_NAME` were promoted from Vs Computer's own local constants into
  `packages/game-core/paths.ts` (alongside the already-shared `PLAYER_COLORS`/`SEATS_BY_COUNT`) so
  all three drivers — Vs Computer, hotseat/Develop Test, and the online server — can never disagree
  on what "the computer" means. Verified live: a 1-player online game skips the waiting room
  entirely (creator alone is already enough to start) and the AI's turns visibly play out with zero
  second browser/account involved; the equivalent hotseat flow was verified the same way.
- **Gatti capture corrected to a per-opponent priority, not "capture everything"** (§7): the first
  gatti-tollu pass had a gatti capture *every* piece occupying its landing cell in one move. The
  user corrected this: a gatti captures only **one** group per opposing player present — their
  gatti pair if they have one there, else their tollu, else a lone single (in that priority order)
  — leaving any lower-priority group of that *same* opponent completely untouched, even if they
  happen to have several coexisting on the cell at once (a real, already-supported combination —
  e.g. their own gatti pair *and* a separate tollu both sharing it). At most 2 of that one
  opponent's pieces are ever taken; a *different* opponent also present is resolved independently
  and can still lose their own top-priority group in the same move. If an opponent has two entirely
  separate gatti pairs on the cell, only one pair is taken (the one containing the lower piece id,
  an arbitrary but deterministic tie-break) — the other survives. Verified with a dedicated 8-
  assertion script covering: a gatti-and-tollu of the same opponent (only the gatti taken), a
  tollu-only opponent (unchanged, whole tollu taken), two separate gatti pairs of one opponent
  (exactly one taken, the other intact and still validly bonded), and two different opponents
  present at once (each independently loses their own top-priority group in the same move).
- **"Resigned" stat replaces "Aborted"** (§10): now that no mode has an "Aborted" outcome left to
  track (§12's earlier Vs-Computer-Resign entry made it fully dead), the freed-up slot in both the
  per-player Stats modal and the session-summary table now shows "Resigned %" instead — an
  *informational* sub-count of Loss (§8), not a replacement for it: a resignation is still counted
  as a Loss the same as any other, this just additionally tracks what fraction of those losses were
  via Resign specifically. Threaded through as an explicit `resignedNames: string[]` parameter
  (client: `applyPlacementsToStats`; server: `applyAndBroadcast`'s new `getResignedNames` thunk,
  called only after resign.ts's own mutator has run and actually knows who resigned, then on into
  `recordGameFinished`) rather than inferred after the fact, since a resignation is otherwise
  indistinguishable from any other Loss once the game has already ended.
- **"Games by player count" — a second, deeper stats breakdown** (§10): added at the user's
  request as the "next level" of the existing per-player Stats modal — four new counters
  (`games1p`/`2p`/`3p`/`4p`) bucketed by whatever seat count was *originally selected* at setup, not
  however many `GameState.players` the engine ends up with (which would always read 2 for a
  solo-vs-AI game). Hotseat/Vs Computer track the selected count directly in local component state;
  online's server-side equivalent (`server/src/games/stats.ts`) reads the game's own stored
  `seat_count` column instead, so a "4 planned, 1 declined" game still correctly counts as 4-player
  for everyone who actually played, not 3. Required a new migration
  (`007_resigned_and_seatcount_stats.sql`) adding `resigned`/`games_1p..4p` columns to the server's
  `player_stats` table, applied locally and verified by directly querying Postgres after a live
  online resignation: the resigning player's row showed `resigned: 1, losses: 1, games_2p: 1`, the
  survivor's showed `first: 1, games_2p: 1` — both exactly as expected. Also added defensive
  normalization (`{ ...EMPTY_STATS, ...existing }`) everywhere a stored stats entry is read or
  updated, both client-side and in the two stats-displaying modals, so a player's older-shaped
  saved data (from before these fields existed) backfills to 0 instead of showing `NaN%` until
  their next game happens to touch it.
- **AI opponent renamed "Computer" → "Indramma"** (§9/§13/§14): a single shared constant
  (`AI_NAME` in `packages/game-core/paths.ts`), so hotseat/Develop Test's "1 player" option, Vs
  Computer, and the online server's AI-driving code all picked up the new name automatically with
  one change, no risk of the three drifting to different names.
- **Root-caused two real online connectivity bugs, plus a latent server-crash bug found while
  investigating them** (§13): reported as "no announcements to Player 1" after Player 2's device
  briefly closed and reopened, and separately "Player 1 shows waiting" in the lobby even after
  Player 2 had already joined. Reproduced both live and traced them to the same root cause —
  `socket.io-client`'s automatic reconnection (which fires on any transient network blip, not just
  a deliberate close) never re-runs the app's own `join-lobby-room` call, so a reconnected client
  stays fully "connected" yet silently outside its game's room forever after, with no visible sign
  anything is wrong. Fixed by re-joining on every `'connect'` event (not just the first) and
  re-fetching current state once the (re)join is acknowledged, in both `OnlineLobby.tsx` and
  `OnlinePlay.tsx`. While instrumenting the server to trace this, also found and fixed a separate,
  more severe latent bug: the Postgres connection pool (`server/src/db/pool.ts`) had no `'error'`
  handler, so Neon recycling an *idle* pooled connection (routine, expected behavior for
  serverless Postgres) crashed the **entire server process** — reproduced locally when exactly
  this happened mid-test. `pg`'s own docs call this out explicitly; fixed with a no-op `pool.on
  ('error', ...)` handler, since Node already removes the dead client from the pool on its own —
  the only thing missing was catching the event so it isn't treated as fatal. This plausibly
  explains at least some of the reported symptoms outright (a mid-game server crash would disconnect
  every player without warning) independent of the reconnect-rejoin issue.
- **Presence indicator** (§13): added at the user's explicit request ("a visible indication to
  know status and which players are in real time communication") — a small connected/disconnected
  dot per player, both in the lobby's waiting-room list and on the live board's home labels.
  Server-authoritative (tracks live socket-per-seat counts in memory, not a client-reported
  heartbeat) specifically so it can't drift from reality the way a client-side-only indicator
  could — the same reconnect-handling work above is what makes this reliable rather than just
  reflecting whatever a client last happened to report before going silent. Verified live: closing
  a player's tab correctly flips their dot to offline on the other player's board within the test's
  poll window.
- **Voice chat implemented** (§13): the user's report that they "didn't see any voice
  communication channel available for players" was confirmed (via a clarifying question) to mean
  **real voice chat between players**, not the existing automated spoken announcements (§11, which
  remain one-device narration, never player-to-player audio) — then built as a distinct follow-up.
  A full WebRTC mesh (direct peer-to-peer, one connection per pair of players in voice — reasonable
  up to the game's own 4-player cap), signaled over the same Socket.IO connection gameplay already
  uses (`server/src/realtime/voice.ts` relays offer/answer/ICE messages between exactly the two
  peers negotiating a connection; the server never touches the audio itself). Deliberately
  asymmetric joining (existing members always offer to a new joiner, never the reverse) avoids
  WebRTC "glare" without needing a more complex negotiation protocol. Uses a public STUN server
  only, no TURN — accepted as a real, known limitation (§13's own note) given a TURN server's
  ongoing cost isn't justified for this deployment's scale. Verified live with two real browser
  instances and fake microphone devices: both sides completed the full WebRTC negotiation and
  received each other's actual audio stream, mic indicators appeared correctly, and leaving voice
  cleanly tore down just that one peer connection without affecting anyone else still in voice.
- **Fixed: a piece could glow as if movable, then do nothing when clicked** (§7/§11): reported as
  landing exactly on an opponent's gatti — the board showed the piece pulsing gold (the
  "active-turn" highlight, meant to mark all of the current player's live pieces "for the whole
  turn" regardless of dice) right after it had just captured and earned a bonus roll. That capture
  correctly sends the turn back to `awaiting-roll` (a fresh roll is mandatory before anything is
  selectable again — see `finalizeMove` in `turnEngine.ts`) while any not-yet-used pool value from
  before the capture is kept, not discarded (per the bonus-chain rule above). The board's glow
  logic, though, kept reading that leftover pool value even during `awaiting-roll` and pulsed only
  the piece(s) that could use it — which, unlike the uniform "everyone glows, pool is empty" glow at
  a normal turn start, singled out one specific piece for one specific destination and so looked
  exactly like a legal, clickable move. It wasn't: `canMovePiece` genuinely agreed the move was
  legal, but `selectPiece` correctly refuses to act until `awaiting-selection`, silently no-opping
  the click with no feedback. Fix: the glow only lets the pool narrow which pieces light up while a
  value is actually pickable (`awaiting-selection`); during `awaiting-roll` every live piece of the
  current player glows uniformly, same as an ordinary turn start, never implying one piece has a
  move ready before it actually does. Verified by reconstructing the reported board position
  (submitted via the in-app bug report's debug log) directly against the game-core reducer: the
  move a single piece makes landing on an opponent's gatti is, and always was, legal and coexists
  without a capture (§7); the bug was purely this one UI signal, not the underlying rule.
- **Fixed: voice chat could look connected while being completely silent** (§13): reported as
  joining voice, granting the mic prompt, seeing what looked like an established connection, and
  hearing nothing. Two independent real bugs, both fixed together since they produce the identical
  symptom:
  1. The remote `<audio>` element relied solely on the `autoPlay` attribute to start playback. A
     browser's autoplay policy is tied to a recent user gesture — clicking "Join Voice" is one, but
     the actual remote track can arrive well after that (a full WebRTC handshake later), by which
     point the browser is free to silently block playback. `voiceChat.ts`'s peer connections and
     the audio element's `ref` in `OnlinePlay.tsx` now call `.play()` explicitly and catch a
     rejection; if it's blocked, a gold pulsing "Tap to hear voice" button appears (a real click is
     always a valid gesture, guaranteeing the retry succeeds).
  2. The per-player mic icon (Board.tsx) was driven purely by voice-channel *roster* membership
     ("called voice:join" — `server/src/realtime/voice.ts`'s bookkeeping), never by whether that
     player's actual peer-to-peer WebRTC connection succeeded. With no TURN server (see the next
     bullet), two players behind incompatible NATs can both sit in the roster indefinitely while
     never exchanging audio — exactly "looks connected, isn't." `voiceChat.ts` now reports each
     peer's real `RTCPeerConnection.connectionState` via a new `onPeerConnectionState` callback;
     the mic icon reflects it honestly (dim + pulsing while negotiating, a ⚠️ if it fails), and a
     plain-text line (not just a hover title, which a phone can't see) names which player voice
     failed to reach. Verified end-to-end with two real browser instances over the actual
     WebRTC/Socket.IO stack (not mocked): both connected, the icon read "connected," and the
     hidden audio element was confirmed genuinely playing (`paused: false`), not just present.
- **Playing-screen layout pass, plus a welcome-page and dice-odds change** (§11, §4, §1) —
  delivered together at the user's explicit request, driven by a reference mockup image
  (`NewLayoutPlayingArea.jpg`, saved at the repo root):
  - **Global header loses the title/version, and disappears entirely during live play**: the app
    name/version used to sit in an `<h1>` shown on every screen; moved to the welcome page instead
    (`WelcomeScreen.tsx`, read from `strings.ts` via `translate()` so there's one source of truth,
    not a duplicated literal) and the header itself trimmed to just the language toggle. That
    slimmer header still shows on mode-select/login/setup, but is hidden completely once a game is
    actually on screen (`app/src/ui/appChrome.ts` — a small persisted-in-memory singleton, same
    "module + `useSyncExternalStore`" pattern `i18n/language.ts` already uses; each of
    Hotseat/VsComputer/OnlinePlay flips it for exactly as long as the board is visible), freeing
    that space for the board instead.
  - **"Game Controls" and "App Controls" split**: the old single wide row under the dice (Resign,
    Report Bug, Sound, and — online — voice buttons all mixed together) is now two purpose-built
    groups. Game Controls (`DiceTray.tsx`) is Roll/Roll Back/Moves-still-to-play/Resign, stacked
    beside (not above) the dice circle. App Controls (`AppControlsMenu.tsx`, a new small "App"
    button + popover) holds everything that isn't specific to making a move: language, sound,
    report bug, and — online only, passed as children since no other mode has any — voice call
    setup. The voice *connection-failure* text itself stays outside the (closed-by-default) popover
    since it's status the player needs without an extra tap, same reasoning as that fix's own mic
    icon change just above.
  - **Welcome page**: `Welcome_pic.jpg` (the family photo) removed; `Indira.jpg` (the dedication
    portrait) kept. The app name + version (now homeless from the header) added underneath the
    existing Kannada title, in the welcome panel's own light-on-dark palette (`#ecd9b3`, matching
    `.welcome-message`) — `var(--text)`/`var(--text-muted)` (the removed header's colors) are tuned
    for the app's normal light surfaces and were briefly unreadable against this screen's fixed
    dark wood background before being caught in a screenshot check and fixed.
  - **Dice odds rebalanced**: Chauka/Bhara (the two bonus rolls) raised from 6.25%/6.25% to
    10%/8%, with 1/2/3 scaled down to fit the remaining 82% while preserving their old relative
    shape (2:3:2). See §4 for the full mechanism (`OUTCOME_WEIGHTS` in `dice.ts`) and why this
    couldn't be done by just biasing each shell's own coin flip.
  - Verified via `npx tsc -b`, `oxlint`, and Playwright screenshots of the rendered pages (hotseat
    at desktop and phone widths, online with a real 2-peer voice session, the welcome page, and the
    trimmed mode-select header) compared directly against the reference mockup — the height
    reduction above was itself discovered and tuned this way (the first pass left a large empty gap
    under Game Controls that the screenshot made obvious).
- **Two small follow-up removals from the layout pass above** (§11, §1): the caption under the
  dice circle (the latest roll's value, or "<player>'s turn" before rolling) was removed —
  redundant with the turn banner above it and the pool/dice-face display already showing the same
  information (`DiceTray.tsx`'s `.roll-label-row`, and the now-unused `dice.currentTurn`/`dice.bonus`
  strings, both deleted). And the English "Chowka Bhara" name added to the welcome page just above
  was removed again — the existing Kannada title already names the game, so showing both was
  redundant; the version number stays.
- **App Controls moved into Game Controls, and every button in it made the same size** (§11): the
  App button used to sit in its own top row next to the turn banner; moved to the end of Game
  Controls instead (after Resign Game), so Roll/Roll Back/Resign/App all live in one column.
  Requested alongside a general "beautify" pass, taken as: every button in that column gets the
  same width (Game Controls' own flex-column stretch, not a per-button width rule) and the same
  gradient/shadow "keycap" treatment `.action-btn` already used for Roll/Resign — App Controls
  gets that same treatment in its own neutral gold/tan rather than reusing green/red, so it still
  reads as a distinct kind of action while matching everything else in size and depth. Its popover
  now opens upward (`bottom` anchor, not `top`) since it's the last item in the column — opening
  downward would otherwise routinely spill past the panel's own bottom edge.
- **App Controls now overlays the dice throw area exactly, instead of a popover; button relabeled
  "App Control"; the welcome page's version-number line removed** (§11, §1): three quick follow-
  ups to the two entries just above.
  - Clicking App Control no longer opens a small popover anchored near the button — it opens a
    full overlay at exactly the dice throw area's own position and size, replacing it while open.
    Required lifting the open/close state and the button itself out of the old self-contained
    `AppControlsMenu` component and into `DiceTray.tsx` (renamed to a "dumb" `AppControlsPanel`
    that only renders the panel's inner content): the button lives in Game Controls, but the
    overlay it opens is a DOM sibling positioned inside `.dice-circle-col` instead, so its
    `position: absolute; inset: 0` sizes against that column automatically (no duplicated pixel
    dimensions to keep in sync with `.dice-stage`'s own desktop/mobile sizes) — confirmed via a
    Playwright bounding-box comparison that the two boxes are pixel-identical. Content is tight at
    that size (as small as 150×150 on phones), so the overlay scrolls internally rather than
    clipping. Outside-click-to-close now tracks two separate refs (button and overlay, no longer
    one wrapping element) since they're in different branches of the render tree.
  - The button's label changed from "App" to "App Control".
  - The welcome page's version-number line (added two entries above, English name already removed
    since) was dropped too — nothing but the Kannada title, the dedication line, and the portrait
    remain. `app.title`/`app.version` deleted from `strings.ts` as fully unused once nothing
    referenced them any more.
- **Turn banner shortened to name + 1-word action (+ optional word); language toggle moved onto
  mode-select's own heading row** (§11, §16): two independent requests landed together.
  - Every `banner.*` string in `strings.ts` rewritten to the terse form: "Ravi's turn," "Ravi
    rolled 3," "Ravi captured 2" (count omitted entirely when it's just 1 — "Ravi captured," not
    "Ravi captured 1"), "Ravi finished 2nd," "Ravi won," "Ravi formed Gatti." `rollResult` and
    `rollBonus` collapsed into one identical form — the roll's own label already reads "Bhara"/
    "Chauka" for a bonus throw (see `dice.ts`), so a separate bonus phrasing said nothing a plain
    "rolled Bhara" doesn't already say. `turnReverted` no longer explains what got undone in the
    banner itself (still in the debug log, and in the fuller spoken announcement) — it just shows
    whose turn it now is, identical to `turnStart`. This is the *visible* banner only; the spoken
    announcements (`audio/announcer.ts`'s own `announce*()` functions) are separate strings and
    keep their fuller, more natural phrasing — shortening one was never meant to shorten the other.
  - The language toggle's original request ("move it under App Control") turned out, once
    clarified with a screenshot, to mean something more specific: right-align it on mode-select's
    own heading row, next to "How do you want to play?", rather than the standalone top bar it
    shared with every other pre-game screen. Extracted the toggle's markup into a shared
    `LanguageToggle.tsx` (previously duplicated inline in `App.tsx`'s header and, since the App
    Controls work, inside that overlay too) so mode-select could reuse it without a second copy of
    the same JSX. Mode-select now calls the same `setChromeHidden` used to hide the header during
    live gameplay, suppressing the standalone bar just for itself while it shows its own copy —
    every *other* pre-game screen (login, hotseat/vs-computer/online setup, the online lobby) is
    unaffected and keeps the toggle in the shared header exactly as before.
- **"Multiple Players (Local)" reworded**: to "Multiple Players (on a single device)" — clearer
  for a player unfamiliar with "local" as UI jargon for "shared device."
- **"Develop Test" renamed to "Developer Mode" and hidden behind a keyboard shortcut** (§15): see
  §15's own new subsection. A debugging tool, not a real way to play, so it shouldn't have been a
  permanently-visible 4th button on mode-select to begin with.
- **Welcome splash now always shows first, including for a fresh WhatsApp invite-link open**
  (§1/§13): reverses an earlier deliberate decision (skip it for invite links specifically, "since
  the person just clicked a link that only makes sense in that context") at explicit request —
  `App.tsx`'s `isGameInviteLink` check and the conditional it drove are removed; `showWelcome` now
  always starts `true` regardless of the opened URL.
- **Online player/game data reset**: at explicit user request, every row in the production Neon
  database's `players`, `magic_links`, `games`, `game_seats`, and `player_stats` tables was deleted
  (counted first — 148/30/111/210/16 rows respectively — then removed in FK-safe order inside one
  transaction, verified back down to 0 each). This includes real accounts, not just this session's
  own test signups — confirmed explicitly before running it, given local dev *is* the production
  database (§1's own note) and this is irreversible. The hotseat roster/stats kept in a browser's
  own `localStorage` are outside this session's reach entirely (a different machine/browser) —
  the user was given the two `localStorage.removeItem` keys (`chowka-bhara:roster`,
  `chowka-bhara:stats`) to clear that themselves.
- **Fixed: the database reset above left an already-open tab's "Create Game" failing with a bare
  "Internal server error"** (§13): a validly-*signed* session token only proves it was issued by
  this server at some point — it says nothing about whether that player row still exists (deleting
  it doesn't invalidate tokens already issued for it; signing is stateless by design). `requireAuth`
  (`server/src/auth/middleware.ts`, gating every `/auth/me` and `/games/*` route) trusted the
  token's claims alone, so a stale token sailed straight through looking perfectly valid, only to
  hit a foreign-key violation several steps later on whatever route actually touched `players`
  (`games.created_by`, in the reported case) — an opaque generic 500 with no indication of what
  actually went wrong or how to recover. Fixed at both ends: `requireAuth` now re-checks the player
  actually exists and returns a clear 401 ("Your account no longer exists. Please sign in again.")
  if not, and the client's shared `request()` helper (`app/src/online/api.ts`) clears a token that
  gets a 401 back, so the next reload lands cleanly on the login screen instead of presenting that
  same now-useless token again. Verified against the real dev server: a token for a deleted player
  now gets a clean 401 with the message above on both `/auth/me` and `POST /games` (previously a
  500 on the latter), while a token for a real, still-existing player is completely unaffected.
- **Sign-in screen (§13): added an app-name title, shortened its heading, and moved the language
  toggle onto that heading's own row** — the same treatment mode-select just got, applied here too
  once the sign-in screen came up in practice (recovering from the database reset above). "Sign In
  to Play" shortened to "Sign In"; a small "Chowka Bhara" line added above it (`app.title`,
  reinstated in `strings.ts` after being deleted as unused two entries back — it has a real use
  again now); the language toggle moved right-aligned onto the "Sign In" row itself, out of the
  standalone top bar, via the same `setChromeHidden` mechanism mode-select uses — now covering
  `AuthGate`'s whole lifecycle (loading/login/needs-profile), not just the login view specifically,
  so the header doesn't flicker back in transitioning between those. The heading-row styling itself
  was generalized from `.mode-select-heading-row` to `.screen-heading-row` so both screens (and any
  later one) share it rather than duplicating the same rule under a screen-specific name.
- **Create-account screen (§13) reworded to sound less like a rejection**: "No account yet for
  &lt;email&gt;" → "Adding a new player..." (no longer names the email at all); "Pick a display
  name — this is what other players will see on the board." → "Enter a friendly name — other
  players will see this name."; the "Display Name:" field label → "Name:". Its language toggle was
  already gone by this point too — covered by `AuthGate`'s chrome-hiding from the sign-in entry
  just above, not a separate change.
- **Account identity switched from email address to WhatsApp/phone number** (§13): a real backend
  change, not a wording tweak — confirmed explicitly before starting, given the alternative (just
  relabeling the text) would leave the field silently rejecting any actual phone number typed into
  it. Chosen as the right moment to do it cleanly since the `players` table had just been emptied
  by the full database reset a few entries above — no real account data to migrate.
  - `players.email` renamed to `players.phone` (migration `008_phone_instead_of_email.sql`; the
    unique constraint carries over automatically with the column rename). The `magic_links` table
    (its own, separate `email` column) is untouched — already fully vestigial before this change,
    created by the initial migration but never queried by any actual route; left alone as strictly
    out of scope rather than cleaned up incidentally here.
  - Server: `isValidEmail`'s regex replaced with `normalizePhone` (strips everything but digits,
    accepts 7-15 of them — real-world national numbers up to E.164's own 15-digit maximum);
    `/auth/login`, `/auth/signup`, `/auth/me` and the session JWT (`SessionPayload.email` →
    `.phone`) all renamed to match; the seat-listing query (`games/routes.ts`) selects `p.phone`
    instead of `p.email`.
  - Client: `PlayerInfo`/`SeatInfo`/`LoginResult` (`api.ts`), `AuthGate`/`OnlineLogin`/
    `NeedsProfile`'s own props all renamed `email` → `phone`; the input itself changed from
    `type="email"` to `type="tel"` with a matching client-side digit-count check (`type="tel"` has
    no built-in browser format validation the way `type="email"` did, so losing that silently would
    have been a real regression) — mirrors the server's own `normalizePhone` range so an obviously-
    wrong number is caught before the round trip, not just after. Every user-facing string updated
    to say "WhatsApp number" (`strings.ts`): the sign-in prompt, the field label, the placeholder
    (`+91 98765 43210`), and a new `auth.phoneInvalid` message for the client-side check.
  - Verified directly against the real dev server end-to-end (signup with a formatted number,
    login again with the same digits differently formatted — confirms normalization — `/auth/me`,
    and game creation, all succeeding; an obviously-invalid number correctly rejected with 400) and
    through the actual UI via Playwright (sign in → create account → reaches mode-select). Test
    rows cleaned up after each check.
- **Waiting room (§13) decluttered**: "Waiting Room" → "Game Waiting Room"; a "Chowka Bhara" title
  added above it (`screen-app-title`, same treatment sign-in already got) and its language toggle
  removed entirely — not relocated inline like mode-select/sign-in, just gone, via the same
  `setChromeHidden` mechanism covering this component's whole lifecycle. The manual "Share on
  WhatsApp" button/link removed outright (the automatic open at lobby-creation time, §13's own
  requirement above, already covers sending the invite) and replaced with a creator-only plain-text
  note confirming the invite already went out and suggesting a manual follow-up if someone hasn't
  joined. The per-seat "P1"/"P3" prefixes dropped from the player list (just the status line now);
  "Waiting for a response…" reworded to "Waiting for other players to join the game…".
- **Fixed the account-identifier fallout from the phone-number switch above, and added a real
  Sign Out** (§13): investigating a "Game not found" report (a stale invite link from earlier in
  this session — reproduced the current flow cleanly end-to-end, unrelated) surfaced a real self-
  inflicted issue: the user's own account had `phone` = their *email address*. Sequence: the full
  database reset happened, then the stale-token fix prompted a re-signup — still email-based at
  that point — then the phone-number switch renamed the `email` column to `phone` on the
  assumption the table was still empty, which was no longer true by then. A column rename doesn't
  touch existing values, so the email carried straight through into the new field, unchanged. The
  account kept working only because the browser still held a pre-switch login token; it would have
  been unrecoverable through the sign-in screen the moment that token expired or got cleared, since
  login now requires digits, not an email. Fixed by deleting that one stale row (the user's choice,
  offered alongside "update it to my real number instead") so a fresh sign-up creates it correctly
  — and by adding a real **Sign Out** button (mode-select, understated styling) so reaching a clean
  sign-in screen no longer requires the DevTools `localStorage.removeItem` workaround this same
  scenario required earlier in the session; clears the token and reloads, landing on `AuthGate`
  exactly like an expired/deleted-account token already does on its own.
- **Resign Game and App Control share one row** (§11): the one exception to Game Controls'
  otherwise fully-stacked layout, at explicit request — both buttons get `flex: 1` inside a shared
  row wrapper so they split the width evenly, same height/style as before. When Resign isn't
  offered, App Control's own `flex: 1` fills the row alone with no extra conditional needed.
- **Online setup screen (§13) reworked**: "Set Up Online Game" → "Configure Online Game", with a
  "Chowka Bhara" title added above it and its language toggle removed entirely (not relocated —
  same as the waiting room's own treatment, via `setChromeHidden`). Resignation Allowed moved
  above the divider line (a real game setting, grouped with the other setup fields); the WhatsApp
  explainer paragraph moved below it (the divider itself moved down with it — `.sound-prompt-plain`
  drops the border/padding `.sound-prompt` normally carries here specifically, `.online-setup-note`
  carries it instead), reworded from "You'll get a link to share with the others once the game is
  created." to "WhatsApp will be opened to select the players from your contacts. After selecting
  the players, send the WhatsApp message which contains the details required to join the game." —
  describing the actual auto-open flow (§13's own requirement) rather than the generic old
  "you'll get a link" phrasing. "Create Game" button → "Start Game" (and its "Creating…" busy state
  → "Starting…" to match).
- **WhatsApp invite message body reworded** (§13): "<name> started a Chowka Bhara game for <N>
  players. Joined so far: <names>. Tap to join: <link>" → "<name> started Chowka Bhara game for <N>
  players and inviting you to join" on its own line, then "Tap the link to join: <link>" on the
  next — the "Joined so far" clause dropped entirely. `whatsappLinkFor`'s own `joined` names
  computation removed along with it, now genuinely unused.
- **Sign Out / Exit consolidated into one shared component, styled properly, and rolled out to
  every screen** (§13): originally added ad hoc on mode-select alone (using `.btn-debug-log`'s
  diagnostic-tool look); at explicit follow-up request, extracted into `AccountControls.tsx` — a
  small rounded-pill button pair matching `.lang-btn`'s visual language, since these are
  app-wide secondary controls, not a debugging tool — and placed everywhere a player can be
  signed in: the shared app header (`AppHeader`, now gated behind a `showAccount` prop so the
  login screen itself — nothing to sign out of yet — doesn't get it), mode-select, online setup,
  every phase of the online lobby (choice/declined/waiting), and the in-game App Controls overlay
  (with its own color override — the component's default `var(--text-muted)` styling is tuned for
  light surfaces and was unreadable against that overlay's dark wood background, the same class of
  bug the welcome page's title once had; caught before shipping this time).
  - **Exit**: `window.close()` only actually works when script opened the tab in the first place —
    true for essentially none of this app's real visitors (typed URL, bookmark, invite link) — so
    it's always paired with a plain visible note ("You can now close this tab") for when it
    silently does nothing, rather than a button that looks broken.
  - **Sign Out mid-game** (via the App Controls overlay) has the same practical effect as closing
    the tab — the other players see a lost connection, already handled gracefully by presence
    detection (§13) — not a new risk this introduces.

- **Select Players (setup) rows collapsed to one line each** (§9/§11): the name input and the
  roster picker used to stack vertically inside each seat row (`.setup-input-group` was
  `flex-direction: column`), taking two lines per seat. Now they sit side by side, each taking an
  equal share of the group's fixed width, so every seat is one line and the boxes line up/match
  size both across seats and against the standalone "Number of Players" select above them (widened
  to match). The mobile breakpoint needed its own explicit override for this — its generic
  `.setup-row input, .setup-row select { width: 100% }` rule shares the same specificity as the
  input-group-scoped rule and comes later in the file, so it was silently winning and forcing both
  boxes to full width (overflowing the row) until re-overridden.
- **Board Editor screen reworked** (§15): title "Board Editor" → "Initialize Game"; the
  "Drag pieces..." instructional paragraph removed entirely (redundant with the title once it's
  action-oriented); Resignation Allowed and Roll Back toggles added (same `.sound-prompt` controls
  as the Setup screen, reusing the same state/handlers) so a develop-test game's rules can be set
  without leaving this screen; "Start Game From Here" and "Reset Positions" wrapped in a new
  `.editor-actions` column so both are full-width and the same size, instead of each sizing to its
  own text (previously visibly mismatched widths, independently centered).
- **Roll Back Last Move button no longer mounts/unmounts** (§11): it used to be conditionally
  rendered only when a move existed to undo, so it popped in and out of the Game Controls column on
  nearly every move — a layout jitter. `DiceTray` now takes the mount condition (`showRollback`,
  stable for the whole game — the feature is offered or it isn't) and the per-move usability
  (`canRollback`, new prop) separately: the button always renders once the feature is on, and only
  its `disabled` attribute toggles. Online's equivalent ("did I make the last move") already
  behaved the same way and got the same fix — it now always shows once in an active game rather
  than appearing only after someone's first move.
- **Resign Information message reworded** (§9): "`<name>` accepted defeat and resigned. The player
  pieces will be removed from the board. Do you want to continue playing with remaining players" →
  "`<name>` resigned, hence lost the game. `<name>`'s pieces will be removed from the board.
  Continue playing with other players." — states the outcome and next step directly rather than
  posing it as a question, since the Continue button is the only available action either way.

- **Mode select screen reworked** (§11): gained the same "Chowka Bhara" app title above its heading
  that other screens already carry (this one was missing it). Each option button now has a small
  circular ⓘ button beside it; clicking one expands a short plain-language description of that
  mode below its row (at most one open at a time) — what it actually is, and what the players'
  experience is like, e.g. "2 to 4 players take turns sharing this one device..." for hotseat.
  The option buttons themselves are no longer stretched to the modal's full width: the options
  column is now sized to fit-content (shrink-wraps to its widest child) and centered via
  `margin: auto`, with the default flex `align-items: stretch` then making every option row (and
  so every label button, via `flex: 1` against the fixed-width info button) match that same width
  — the width of the longest label, "Multiple Players (on a single device)" — without measuring
  text in JS. Labels are left-aligned (`<button>`'s own UA default centers text) since they no
  longer fill a much-wider-than-needed button. The info button is pinned to `align-self: center`
  so it stays a fixed 32px circle rather than stretching into an oval on narrow screens where a
  label wraps to two lines.

- **`.screen-app-title` (the "Chowka Bhara" line above a screen's own heading — mode select,
  online sign-in, online setup, online lobby) restyled**: was small (15px), muted-colored, and
  left-aligned — smaller and less prominent than the screen's own h2 heading below it. Now 28px,
  centered, and full-strength text color, making it the single most prominent element on every
  screen that shows it, consistently, since it's one shared class. Sign-in's own prompt text
  reworded: "Enter your WhatsApp number to log in, or to create a new account." → "Enter WhatsApp
  number to Sign in..." — shorter, and drops the "or create a new account" clause since the screen
  already explains that behavior (§13: an unrecognized number offers sign-up next).

- **Select Players (setup) screen reworked** (§9): no longer shows a language toggle at all
  (previously the standalone `AppHeader` bar above the modal, unlike every other pre-game screen
  which had already moved theirs inline or dropped it) — `HotseatPage` now hides that header
  unconditionally instead of only during actual play. Each seat's name input and roster picker
  collapsed from two separate boxes (a text field plus a `<select>` next to it) into one: a single
  `<input list=...>` wired to a `<datalist>` of roster names, so typing a new name and picking an
  existing one both happen in the same box via the browser's native suggestions. `roll-back last
  move` now defaults to **on** (was off) — was easy to miss as an opt-in; still a per-session
  toggle, just flipped the other way by default. Sign Out/Exit moved from that same top header bar
  into the bottom of the setup modal itself (`SetupModal.tsx` now renders its own
  `<AccountControls />`), matching where every other screen already puts them.
- **Mode select options column: fit-content width replaced with a fixed one** (§11): shrink-
  wrapping the options column to its widest child's natural size (added for the info-button work
  above) turned out to also factor in each `.mode-option-info` description paragraph's *unwrapped*
  text width whenever one was open — max-content sizing lays a block of text out on one line to
  measure it, and that one-line width can be far wider than the paragraph ever actually renders at.
  The whole column visibly resized depending on which description (if any) was open — real jitter,
  same class of bug as the Roll Back button's mount/unmount jitter above. Fixed by giving the
  column a constant `420px` width (`max-width: 100%` for narrower screens) instead of deriving it
  from content, so opening/closing a description never changes anything's size.

- **Roll Back Last Move and Resign Game always shown in Game Controls, disabled instead of
  removed, in every mode** (§11): Roll Back already stayed mounted across a single game (the
  earlier jitter fix); now it's mounted unconditionally, and its `disabled` state itself absorbs
  both "not offered in this mode/game at all" (e.g. Vs Computer, which never offers it) and "no
  move to undo right now." Resign gets the identical treatment — previously removed from the row
  entirely whenever a game didn't have Resignation Allowed turned on, it now always renders in the
  Resign/App Control row, just disabled. Confirmed via user clarification this should NOT move
  these into the App Controls overlay — they stay exactly where they were in Game Controls.

- **"Single player" mode-select label reworded to "Alone against Computer"** (§11): clearer about
  what it actually is (playing solo against Indramma, the built-in AI) than the generic "Single
  player."

- **AI opponent renamed "Indramma" → "Indira"**, and mode-select's "Single player" label further
  reworded to "Play Alone with Computer" (from the earlier "Alone against Computer"). `AI_NAME`
  lives in one place (`packages/game-core/src/paths.ts`), shared by hotseat/Vs Computer (client-
  driven) and the online server (server-driven) alike, so this was a one-line rename plus updating
  the mode-select info panel's own prose mention of the name.

- **Welcome splash shortened to 3s (was 5s), loading screen reworded** (§11): `WelcomeScreen`'s
  fixed display timer cut from 5000ms to 3000ms. The auth-check "Loading…" screen right after it
  (`AuthGate`, waiting on `fetchMe()`) now shows the app title plus "Chowka Bhara is loading… It
  may take about a minute in case of cold start of the application." (revised from an initial "a
  few seconds" once the actual cause — see below — was named explicitly) instead of a bare
  "Loading…" — reassures a returning visitor (one with a saved token, so this screen actually makes
  a network call) that something is happening rather than reading as stuck. **Flagged, not
  fixed**: the underlying slowness this responds to is almost
  certainly Render's free-tier cold start (the backend service spins down after ~15 minutes idle
  and can take 30-60s+ to wake on the next request) — not something a front-end change can shrink
  to a guaranteed "within 2 seconds." Fixing that for real means either an external keep-alive
  ping (a scheduled request to `/health` every few minutes to stop it from sleeping) or a paid
  Render plan; neither attempted here since both are cost/infra decisions, not code ones.

- **Mode select's two multiplayer labels reworded** (§11): "Multiple Players (on a single device)"
  → "Play with Multiple Players on this device locally"; "Multiple Players (Online)" → "Play with
  Multiple Players on their devices over Internet". Longer than before and the online one now
  wraps to two lines inside the fixed-width options column — harmless given the info button's
  `align-self: center` fix already keeps it a circle regardless of row height.

- **Capture announcement no longer says "roll again"** was actually a real gap, now fixed: §14's
  own text already documented that a capture's spoken announcement should include the "roll
  again" instruction (a capture always grants a bonus roll, §5.6), but `announceCapture` had been
  pointed at `banner.captured` — the same terse string used for the on-screen banner ("Ravi
  captured 2") — ever since that banner was shortened, so the spoken cue silently lost its
  instruction along with it. Fixed with a dedicated `announce.captured` string ("Ravi captured 2.
  Roll again!") used only by the spoken announcement; `banner.captured` itself is untouched, so the
  on-screen banner stays exactly as terse as before.

- **Stuck-pool revert made visible, with an explanatory announcement, in every mode** (§5.5): a
  stuck pool (no legal move left for anyone to play it) used to revert the whole turn instantly,
  bundled into the very same reducer call as the roll/move that exposed it — too fast to actually
  register before the screen already showed the next player's turn (a real reported bug). `roll()`
  and `finalizeMove()` in `turnEngine.ts` no longer call the revert logic automatically; it's now
  `checkStuckPool`, an exported function each mode's own UI calls itself after a deliberate
  `STUCK_POOL_DELAY_MS` (2s) pause, during which the affected player's name and the reason stay on
  screen and get spoken (`announceStuckPool`, new): "`<name>`'s moves this turn are rolled back —
  not all moves could be made" — not just "no legal move," since a stuck pool undoes every move and
  capture already made this turn (§5.5), not only the current unplayable dice value.
  - **Hotseat / Vs Computer** (client-driven): a `useEffect` watches for the stuck condition,
    shows the banner/announcement immediately, then calls `checkStuckPool` itself after the delay.
    `chooseAiMove` already returns `null` gracefully with no legal move, so this coexists safely
    with the AI-turn-driving effect in both modes.
  - **Online** (server-authoritative): the server needs its own copy of the delay, since it — not
    any client — owns the actual state. `server/src/realtime/gameplay.ts` gained
    `maybeScheduleStuckPoolRevert`, called from `applyAndBroadcast` right alongside the existing
    `maybeScheduleAiTurn`: it notices the same stuck condition on the just-broadcast state and, if
    found, schedules a delayed `checkStuckPool` + broadcast of its own. Harmlessly races with
    `maybeScheduleAiTurn` when the AI itself is the stuck player (both scheduled off the same
    roll/move) — `chooseAiMove`'s own null-on-no-move return makes `runAiTurn`'s mutator a no-op in
    that case, so whichever timer actually changes the state "wins," the other just declines
    against the already-reverted row. Every connected client detects the identical stuck condition
    off the state it already has (`OnlinePlay.tsx`, display-only — it shows the banner/announcement
    but never calls `checkStuckPool` itself, only the server does that) and shows the same banner
    while waiting for the server's broadcast to actually arrive.
- **Capture banner and announcement merged back into one string**: a capture always grants a bonus
  roll (§5.6); "Roll again!" is now part of `banner.captured` itself ("Ravi captured 2. Roll
  again!"), not a spoken-only variant — a player with sound off was seeing "Ravi captured 2" with
  no indication of what happens next, on-screen. `announceCapture` reads that same string, so the
  banner and the spoken announcement always match.
- **`.play-area` shrunk on phones to stop overflowing the screen** (§11): measured ~120px of
  unwanted scroll on a 375×667 viewport (a plain hotseat game, board above a stacked play-area)
  before this pass — the round dice-throw circle, button padding, and the gaps between Game
  Controls' now-five stacked rows (Roll/Roll Back — always shown now, see above/Moves/Resign+App
  Control) all added up past one screenful. Every one of those got a little smaller specifically
  in the phone media query (dice circle 150px → 95px, tighter padding/gaps throughout) — verified
  down to 0px of overflow at 375×667 and comfortably clear at wider phone widths; only genuinely
  narrow ~320px-wide phones (now rare) still have some.

- **Online lobby ("choice" and "waiting" phases) tightened up** (§13): "Joined so far: `<names>`"
  removed from the choice ("Game Invite" — Join/Decline) screen — redundant once seen alongside the
  waiting room's own per-seat list, and not something a player deciding whether to join needs.
  Join/Decline (choice phase) and Start Game/Cancel Game (waiting phase, creator only) each moved
  into one shared row (`lobby-actions-row`) instead of stacking full-width. The creator's own note
  above the player list now changes once everyone required has joined: the WhatsApp-sent reminder
  ("...you may like to remind the players if they don't join") no longer applies once there's no
  one left to remind, so it's replaced with "Required number of players have joined the game. Start
  the game whenever you're ready."

- **Phone-width dice area back to side-by-side with Game Controls, and now an ellipse** (§11): the
  original layout pass put the throw area beside Game Controls only on wide-enough screens,
  reflowing to stacked (circle above the column) on phones since there wasn't room for both side
  by side at that width — at explicit request, phones now get the side-by-side layout too. The
  throw area itself becomes a tall ellipse there instead of a circle (`.dice-stage`'s own
  phone-width override: 100×190 instead of a same-width circle) — narrow enough to fit beside
  Game Controls' text-heavy buttons, tall enough to use the vertical room a circle at that width
  would leave empty. `DiceTray.tsx`'s scatter math already positions each die by percentage of
  `.dice-stage`'s own box, so it spreads across the new elliptical shape with no code change.
  - **App Controls overlay moved to cover the whole row, not just the throw area**: it used to
    open sized to `.dice-circle-col`'s own footprint (`position: absolute; inset: 0` against it) —
    fine when that was a full circle, but the new narrower phone-width ellipse left far too little
    room for the panel's rows (language/sound/report-bug/sign-out/exit), a real regression this
    same change introduced and then fixed in the same pass. The overlay div moved out of
    `.dice-circle-col` to be a direct sibling of it and `.game-controls-col` inside `.dice-section`
    (now the `position: relative` anchor instead), so `inset: 0` naturally covers the full row on
    any screen size — also a genuine improvement on desktop, where the panel previously sat
    cramped into just the circle's ~200px width instead of the play-area's full ~460px.

- **Sign Out dropped from the online lobby's choice and waiting-room screens** (§13):
  `AccountControls` gained a `showSignOut` prop (default `true`); the lobby's "choice"
  (Join/Decline) and "waiting" (after joining) phases now pass `showSignOut={false}`, keeping only
  Exit. Reasoning: Sign Out only clears this device's own session — it doesn't release a joined
  player's seat, so mid-lobby it doesn't actually map to "leaving" the way it looks like it should
  (the seat stays "Joined," just showing as disconnected if the creator starts). Exit stays
  everywhere. The "declined" phase (after clicking Decline) keeps both — no seat is held there
  either way, so the same confusion doesn't apply.
- **Every paired action-button group put on one line, app-wide** (§11, at explicit request): a
  new general-purpose `.actions-row` (renamed from a lobby-specific `.lobby-actions-row` added
  earlier the same session) now covers every "two alternatives side by side" case that used to
  stack full-width, one button per row, with inconsistent inline margins: Join/Decline and Start
  Game/Cancel Game (`OnlineLobby.tsx`, already using it), Play Again/End Session
  (`ResultsModal.tsx`), Rematch/Exit (`OnlinePlay.tsx`'s own game-over screen), and Board Editor's
  Start Game From Here/Reset Positions (`.editor-actions`, a near-identical dedicated class,
  removed as redundant once this covered it too). `ReportBugModal.tsx`'s own action row and
  `AccountControls`' Sign Out/Exit row were already horizontal and needed no change.

- **Resign, then Exit is the normal way to leave a game — Sign Out/Exit dropped from the in-game
  App Controls entirely, and Exit now lands on mode select, not online setup** (§13, at explicit
  request): `AccountControls` no longer renders inside `AppControlsMenu.tsx` at all — Game Controls
  itself doesn't offer a way to leave any more, matching the intent that leaving happens through
  Resign (§9). `App.tsx`'s `OnlineGameRoute` now sends `onExit` to `/` (mode select — where Sign
  Out/Exit still live) instead of `/online` (online setup), matching hotseat/Vs Computer's own
  "end session" which already landed there.
  - **New: a resigned online player gets an explicit way out if the game keeps going without
    them.** Resigning while other seats are still active used to leave that player's own screen
    just spectating the live board with no route elsewhere. `OnlinePlay.tsx` now tracks `iResigned`
    (set locally the moment *this* device's own Resign click fires — distinct from
    `resignedPlayerName`, which the server's `resign:notice` broadcast sets for *any* player's
    resignation) and shows a persistent `.online-notice` ("You resigned from this game. You can
    leave now to start or join another.") with a Leave Game button once the acknowledgment modal
    is dismissed, for as long as the game continues. Not applicable to hotseat/Vs Computer — those
    modes don't strand anyone on a separate device with nothing left to do.
- **App Controls' own "App Control" trigger button and overlay removed — its contents (language,
  sound, report bug) render directly in the play area instead** (§11, at explicit request):
  `DiceTray.tsx` no longer owns any open/close state, ref-tracking, or outside-click handling for
  this — `AppControlsPanel` (`AppControlsMenu.tsx`) is just rendered as a normal sibling of
  `DiceTray` in each mode page's own `.play-area`, always visible, no extra tap needed. Resign Game
  is back to its own full-width row (previously shared one with the now-gone trigger button). The
  panel's own CSS (`.app-controls-overlay` → renamed `.app-controls-section`) dropped every
  absolute-positioning property, keeping the same wood-gradient card look as a visual grouping cue.
- **Dice throw area: rounded rectangle instead of circle/ellipse** (§11, at explicit request): a
  circular or elliptical shape wastes its own bounding box's corners — visually (background/border
  never reach them) and for the scatter algorithm (dice never land there either, since it computes
  positions as a percentage of the box's width/height around its center). `.dice-stage`'s
  `border-radius: 50%` became a fixed `20px` on both the desktop (200×200) and phone (100×190,
  unchanged from the earlier ellipse-era sizing) versions — the scatter math in `DiceTray.tsx`
  needed no change, since it was already just "percentage of this box's own dimensions," shape-
  agnostic. Comments referencing "circle"/"round throw area" updated to match.
- **Roll Dice and Roll back share one line; both relabeled; Sound/Report Bug shrink to content
  width** (§11, at explicit request): a new `.game-controls-roll-row` (mirrors `.actions-row`'s
  shape, without its `margin-top` since this is the column's first row) puts the two on one line.
  "Roll the Dice" → "Roll Dice", "⟲ Roll Back Last Move" → "⟲ Roll back" — both shortened partly to
  fit their new half-width row comfortably. Sound On/Report Bug (`.app-controls-section`) dropped
  their `width: 100%` for `align-self: flex-start`, sizing to their own label instead of stretching
  — the Language row above them keeps the section's default full-width stretch, unaffected. Phone
  media query gained matching trims (`.app-controls-section` padding/gap, its buttons' vertical
  padding, `.dice-stage` height 190px → 165px) to offset the mobile-overflow fix from earlier in
  this same section being always-visible now costs some of that fixed space back.
- **"Moves still to play:" → "Pending Moves"** (§11, at explicit request).
- **Top/bottom player labels (P1/P3) collapse to one comma-separated line** (§11, at explicit
  request, "optimize the space required for R1 and R3 players"): name/status/capture-status used
  to always stack as three lines; `.home-label.side-top`/`.side-bottom`'s `.status-line`/
  `.capture-status` spans switch to `display: inline` with a `::before { content: ', '; }` for the
  comma, so they read as "Name, Status, Capture" on one line. Deliberately scoped to top/bottom
  only — left/right labels (`.side-left`/`.side-right`) keep the original 3-line stacked form,
  because their `max-width: 70px` (sized for short names, bounding the container's own `gap`) would
  just clip the much-longer combined text rather than actually fit it; confirmed via screenshot
  that a first, uniform attempt across all four labels did exactly that before scoping it back.
- **Language, Sound, and Report Bug share one row in App Controls** (§11, at explicit request, "use
  the width of the component effectively"): these three used to each take their own stacked line
  even though there was unused horizontal space beside the Language toggle. A new
  `.app-controls-main-row` (row-direction flex, `flex-wrap: wrap`) holds all three; on phone widths
  Report Bug wraps to its own line rather than overflowing, confirmed via screenshot at 375px.
- **Dice throw area and Game Controls column top/bottom-align, Game Controls' rows spread evenly**
  (§11, at explicit request): `.dice-section`'s `align-items` changed from `flex-start` to
  `stretch` (desktop and phone) so `.dice-circle-col`/`.game-controls-col` always share the taller
  side's height instead of the throw area (fixed-size, never grows) and the controls column
  (content-driven height) drifting out of alignment at the bottom. `.game-controls-col` gained
  `justify-content: space-between` so its three rows (Roll/Roll back, Pending Moves, Resign Game)
  spread across that shared height instead of leaving unclaimed space below Resign Game whenever
  the throw area is taller; `.dice-circle-col` gained `justify-content: center` so any leftover
  height on its side balances around the fixed-size throw area rather than pinning it to the top.
  Confirmed via screenshot with an empty and a populated Pending Moves list, desktop and phone.
- **Cancelled-lobby screen offers a way back to Mode Select instead of being a dead end** (§13, at
  explicit request): "This game was aborted." → "The game was cancelled." — same wording for both
  the creator's own Cancel Game click and anyone else watching the lobby when it happens, since
  both paths already shared the one `lobby.aborted` string. Previously this was folded into
  `OnlineLobby`'s generic `error` state (a message with no escape but reloading); it's now its own
  `'aborted'` phase with a "Back to Game Setup" button wired to the same `onExit` (→ Mode Select)
  `OnlinePlay`'s own Exit already uses — `OnlineGamePage` now forwards that prop through, where it
  was previously accepted but silently dropped. Confirmed via a scripted 2-player lobby: creator
  cancels after the second player joins, sees the new message, clicks through to Mode Select.
- **Re-sync lobby/game state on returning to a backgrounded tab** (§13, a reported bug: a game
  creator saw a big delay before their waiting room reflected a responder's join): the existing
  reconnect-triggered catch-up fetch (`connectAndListen`/`joinRoom`'s own `fetchGame` call on the
  socket's `'connect'` event) only runs if the socket actually drops and reconnects, but a mobile
  browser can leave a backgrounded tab's socket in limbo — throttled or fully suspended — without
  ever firing `'disconnect'`, especially right as `OnlineLobby`'s own WhatsApp auto-open backgrounds
  the creator's tab moments after they arrive. Both `OnlineLobby.tsx` and `OnlinePlay.tsx` now also
  listen for the page's `visibilitychange` event and, on returning to `'visible'`, nudge a
  reconnect if the socket isn't connected and re-fetch the lobby/game regardless — closing the gap
  regardless of *why* the tab was backgrounded (WhatsApp, phone lock, app switch), not just the
  socket-drop case the existing fix already covered. Confirmed with a scripted visibility toggle:
  a join that happened while "hidden" is reflected the moment the tab reports "visible" again, with
  no reload needed.
- **Exit hides itself (and Sign Out) instead of leaving both clickable after "exiting"** (§11, a
  reported bug: Sign Out still worked right after Exit showed "You can now close this tab" —
  visually incoherent, since the app kept responding normally as if nothing had happened).
  `AccountControls.tsx`'s `handleExit` also stopped unconditionally calling `window.close()` —
  that only ever works when `window.opener` is set (this app opened its own tab), true for
  essentially none of this app's real visitors (typed URL, bookmark, invite link), so it's now only
  attempted when there's a real chance of succeeding. Either way, clicking Exit now replaces the
  Sign Out/Exit row itself with the "you can close this tab" note, rather than leaving both buttons
  live beside it — once a player has said they're done, the app stops inviting further clicks from
  this control (the rest of the page, e.g. Mode Select's own game-mode buttons, is unaffected).
- **Report Bug submits to the backend, saved for later analysis** (§11, at explicit request): a
  new `bug_reports` table (migration `009_bug_reports.sql`: reporter, mode, an optional `game_id`
  — only online has a server-side game row to attach it to, every other mode always sends null —
  observation/expected/suggestion, and the debug log joined into one text column) plus an
  authenticated `POST /bug-reports` route. `ReportBugModal.tsx`'s "Report Bug Details" button now
  submits straight to the backend instead of just collating text locally. On success, the form is
  replaced by a plain "Sent — thank you for the report!" plus a Close button (at explicit request:
  since submission is automatic now, there's nothing left for the player to do or copy) — the
  collated text and Copy to Clipboard button only reappear if the submission actually fails, as a
  manual fallback so the report isn't lost entirely. Verified end-to-end (including against the
  live production backend): submitted rows are confirmed present in the database with the correct
  reporter, mode, and debug log.
- **P1/P3's home-label was clipped by the phone's own browser chrome** (§11, a reported case —
  Player 3's name/status unreadable, cut off right at the top of the screen): `.home-label.side-top`
  is positioned *above* the board's own top edge via a negative offset (see its own rule), which
  left it almost no clearance when `.container` sat right at the viewport's top with only the
  page's own 8px padding — some phones' address bars then physically overlapped it. `.container`
  gained `margin-top: 20px` on phones to give that label room to render fully.
- **Dice could render larger than the (phone-width) throwing area box, poking past its edge**
  (§11, a reported case, screenshot-confirmed): the scatter algorithm (`DiceTray.tsx`'s
  `scatterStyle`) positions each die's top-left corner up to ~80% of the box's own width/height
  from center — fine against the desktop 200×200 box, but the fixed 24×30px `.die` size (unchanged
  since before the box narrowed for phones) could exceed the phone-width box's own remaining
  margin at that offset. `.die` shrinks to 16×20px (same ~4:5 aspect ratio) in the phone media
  query, confirmed via screenshot to now stay inside the box after a real roll.
- **Online's game-over screen gained a Lifetime Stats table** (§13, a reported gap: after a
  resignation, online only ever showed this one game's placement — "how won and lost" — with no
  career context, unlike hotseat's own `ResultsModal`): a new `GET /games/:id/stats` route (any of
  this game's own participants only, not open to any signed-in player like the lobby GET) returns
  every seated player's `player_stats` row keyed by seat (`'P1'`..`'P4'`) rather than player id, so
  the client can look a row up directly from `GameState.players[].id` with no extra name/id
  mapping — a player with no row yet (never finished a game) is simply absent, same "missing means
  EMPTY_STATS" convention `StatsModal.tsx`/`ResultsModal.tsx` already use for hotseat. `OnlinePlay.tsx`
  fetches this once on mount (so clicking any player's name mid-game — `Board.tsx`'s `onSelectStats`,
  previously wired to a no-op in this mode — now opens the same `StatsModal.tsx` hotseat/vs-computer
  already use) and again the moment `game.phase` becomes `'game-over'`, since the server's own
  `recordGameFinished` (awaited before that phase's `game-updated` broadcast is even sent) has
  already updated the row by then — confirmed via a scripted resign: the table's numbers went from
  0 games each (pre-game) to 1 each with the correct win/loss split (post-game) once refetched.
- **Roster name picker replaced (hotseat/vs-computer setup)** (§9, a reported bug: tapping the
  dropdown arrow in a player-name box did nothing on some phones): `SetupModal.tsx` used a native
  `<input list>`/`<datalist>` combo for "type a new name or pick a saved one in the same box" —
  reliable on desktop Chrome/Firefox, but that dropdown arrow is a known cross-browser weak point,
  especially on mobile. Replaced with a plain custom combobox: the arrow is now a real button
  (`.name-combo-toggle`) toggling a conditionally-rendered, click-to-select list
  (`.name-combo-list`, filtered live by whatever's already typed) — no native quirks, since it's
  just React state. `onMouseDown` + `preventDefault()` on the toggle and each option keeps the
  input focused so selecting a name doesn't fire a blur-driven close before the click registers.
  Confirmed via screenshot, desktop and phone width.

Still open / assumed defaults (flag if any of these are wrong):
- **Hotseat stats are single-browser only**: roster/stats are stored per-browser (`localStorage`),
  not synced across devices — this is now specifically a hotseat limitation, since online mode has
  real per-account server-side stats (§10), now surfaced on the game-over screen and via clicking
  any player's name mid-game (see the Decisions log entry below) — just not yet in any standalone
  "my stats" screen outside an actual game.
- **Voice chat disabled entirely, pending a real fix** (§13): a reported case — voice working fine,
  then failing mid-call with the internet itself confirmed fine — traced to the same root cause as
  the incompatible-NAT case below: no TURN server, so once a mid-call network change (WiFi/
  cellular switch, a backgrounded tab suspended and resumed, etc.) invalidates the connection's
  original path, there's nothing to fall back to and no ICE-restart logic to renegotiate — it just
  reports `failed` permanently. Rather than continue shipping a feature that can silently break
  for reasons that look like the app is broken, the whole thing is switched off at
  `VOICE_CHAT_ENABLED = false` in `OnlinePlay.tsx` (voice chat setup/join/leave/mute UI and the
  `VoiceChatManager` connection itself, all gated behind that one constant) until one of:
  - a TURN server (real ongoing hosting cost), or
  - ICE-restart handling (free, but only recovers if the new network path is itself stable — won't
    help the genuinely-incompatible-NAT case below).
  The implementation itself is untouched and still fully wired up — flipping the constant back to
  `true` is the entire re-enable, no other code changes needed.
- **(superseded by the above while voice is off) No TURN server** — seat pairs behind incompatible
  NATs can't hear each other at all even on an otherwise-stable connection; kept here for when
  voice is re-enabled, since this is a separate, harder case than the mid-call one above (no
  network change involved, just fundamentally incompatible NAT types on both ends).

## 13. Online Multiplayer

### Accounts & sign-in
- Register with a WhatsApp/phone number and a mandatory display name; logging back in only needs
  the number (no password). See §12 for why this is deliberately lighter-weight than magic-link
  verification or OAuth, and for the account model's own change from email to phone number.
- The number is normalized to digits-only for storage/lookup (`normalizePhone` strips everything
  but digits; 7-15 digits accepted, covering real-world numbers up to E.164's own maximum) — two
  different-looking inputs for the same number (with/without `+`, spaces, dashes) log in to the
  same account.
- A session is a signed token (JWT) issued on login/registration, stored in the browser's
  `localStorage` and sent as a `Bearer` `Authorization` header on every API call and in the
  Socket.IO connection handshake (see §12 for why not a cookie).
- Login is required up front, before either hotseat or online mode is reachable — not just for
  online play. A returning visitor with a valid stored token skips straight past the login screen.
- After the welcome splash and login, the app lands directly on mode-select — no separate
  "Welcome, {name}!" acknowledgment screen in between.

### Creating, inviting & joining a game
- The creator picks a player count (1–4) and creates the game; they're automatically seated as P1.
- **1 player** secretly plays against the AI, same as hotseat/Develop Test's own "1 player" option
  (§9) — the only difference here is *where* that AI's turns are driven from: since no client is
  ever connected for that seat, the server itself schedules and plays them (same pacing, same
  `chooseAiMove` decision logic as the client-driven versions), broadcasting each move over the
  normal `game-updated` socket event exactly like a real opponent's move would be. There's no
  waiting room to speak of — the creator alone is already enough to start (`canStart` needs just 1
  joined player, not 2), no invite link is generated or auto-opened, and Resignation Allowed works
  unchanged (the human resigning just ends the game, the AI seat was never a real participant to
  ask). A 1-player game's AI seat deliberately gets no `game_seats` row at all — that absence
  *is* how the server tells a real 2nd player apart from "this is the computer."
- The game gets a shareable URL (`/games/:id`). **Who specifically gets invited is decided entirely
  inside WhatsApp**, not this app — `wa.me` opens with the invite text pre-filled (who started the
  game, the planned player count, who's joined so far, the link), where WhatsApp's own contact/
  forward picker is used to choose one or more recipients. **Opens automatically**, in a new tab,
  the moment the creator's own device first reaches the waiting room right after clicking "Create
  Game" — the very next thing they do is pick who to send it to, no separate "now go invite
  people" step. It doesn't re-trigger on a later visit to the same lobby (a refresh, a different
  device, coming back to check on it) — only that one first arrival — and it never fires for
  anyone who reaches the waiting room by actually opening the invite link (nothing for them to
  send). There's no manual "Share on WhatsApp" button/Copy Link option at all any more (removed at
  explicit request, along with the per-seat "P1"/"P2" prefixes in the player list below) — just a
  plain note to the creator confirming the invite already went out and suggesting they follow up
  directly if someone hasn't joined; the app itself never knows or needs to know the intended
  invitee list, only who actually opens the link afterward.
- Opening the link for the first time (signing in first if needed) shows an explicit **Join /
  Decline** choice — naming who started the game, the planned player count, and who's joined so
  far — rather than joining automatically. Only clicking Join actually claims a seat.
- **Declining** claims a seat slot too (so the room can still fill up predictably) but as
  `status: 'declined'` instead of `'joined'` — recorded in that player's statistics immediately
  (§10), not deferred to whether the game ever starts. A player who declines sees a simple
  confirmation and nothing further from that game.
- **Only the creator can click "Start Game"** (mirrors abort-lobby's creator-only restriction) —
  enforced both server-side (the `/start` endpoint rejects anyone else) and client-side (anyone
  else sees a passive "Waiting for `<creator>` to start the game…" note instead of a clickable
  button). Requires at least 2 joined, not every originally-planned seat — the room adapts to
  however many people actually accept. **Seat fairness on start**: the joined players are
  re-seated onto the fair topology for however many actually joined (`SEATS_BY_COUNT[joinedCount]`
  — opposite bases for 2, etc.), in their original join order; declined players take whatever
  seat(s) are left over from the originally-planned topology, e.g. 4 planned + 1 decline → the 3 who
  joined get P1/P2/P3, the decliner gets P4. This keeps active play balanced regardless of exactly
  who declined. Every client re-fetches its own current seat right at this transition rather than
  trusting whatever seat it was assigned at join time, since this reassignment can change it (see
  §12's Decisions log for the bug this caused before that re-fetch existed).
- **The creator alone can cancel the game while it's still in the lobby** (before Start), with no
  vote or confirmation needed from anyone else — a genuinely different action from in-game Resign
  (below), which is a single player's own unconditional call, not something anyone else needs to
  agree to either, but only available once play has actually started. Not counted in anyone's
  stats, since the game never started.
- Opening a link to a game that's already in progress rejoins the participant straight into the
  live board (closed tab, refreshed page, or a different device) instead of a stale waiting room.
- Opening a link to a game the creator cancelled pre-start shows an explicit "this game was
  aborted" message instead of any board/lobby state. (There is no equivalent in-game abort any
  more — leaving mid-game is Resign, below, which ends at the normal Game Finished screen, not
  this one.)
- A non-participant opening a link to a game that's already started (and isn't full/available) is
  rejected, not allowed to claim a seat mid-game.
- A declined player is shown distinctly on the game board itself (dimmed home label, "(declined)")
  once the game they declined actually starts — see §7/§8 for how they're excluded from gameplay
  (always created with `hasLost: true`, reusing every existing loss-exclusion path).

### Real-time sync
- The server is the sole authority: it validates every action (is this really this player's turn?
  is the move legal?) and applies the same `packages/game-core` reducer functions hotseat uses
  locally, then persists the result and broadcasts it to every socket in that game's room.
- Clients never compute a move themselves in online mode — they send an intent (roll / pick a pool
  value / pick a piece / roll back the last move) and render whatever state comes back.
- **Reconnects re-join the room, not just the first connect**: `socket.io-client` reconnects
  automatically after any transient drop (a network blip, backgrounding on mobile, briefly losing
  signal) — but a reconnect is a brand-new underlying connection that was never told to join this
  game's Socket.IO room on its own. Every client listens for its own `'connect'` event (fires on
  both the first connection and every later reconnect) and re-emits `join-lobby-room` each time,
  then re-fetches the current game/lobby state once that join is acknowledged, to catch up on
  anything broadcast during the gap. Without this, a client could stay fully "connected" yet
  silently outside the room forever after one reconnect — no error, nothing visibly wrong, just
  never receiving another update (confirmed reports: a player who stopped hearing any
  announcements partway through a game; a creator whose lobby view stayed stuck on "waiting for a
  response" even after the second player had already joined).

### Presence (online)
Every player's home label (in the waiting room's player list, and on the live board) shows a small
connected/disconnected dot — server-authoritative, based on whether that seat currently has a live
socket in the game's room (not a client-reported "I'm here" ping, so it can't be spoofed or go
stale). Broadcast to the room whenever a seat's connection count crosses zero in either direction
(first device connecting, or last device disconnecting) — a player with two tabs/devices open only
reads as offline once every one of them has actually disconnected. A newly-joined socket also gets
the full current picture once, not just future changes, so a late joiner immediately sees
everyone else's status rather than waiting for the next change to happen to arrive.

### Voice chat (online)
Real-time voice between players — separate from, and in addition to, the automated spoken
announcements (§11), which are one-way narration for whoever's own device is speaking, not
player-to-player audio.
- **Opt-in, never automatic**: joining voice is a deliberate "🎙️ Join Voice" button click, which is
  what triggers the browser's own microphone-permission prompt — nothing requests mic access on
  page load or on entering a game. A denied/unavailable microphone shows an inline error rather
  than failing silently.
- **A full mesh of direct peer-to-peer connections** (WebRTC), one per pair of players currently in
  voice — reasonable up to this game's own 4-player cap (at most 3 simultaneous connections for any
  one device) without needing a media relay server. The app's own server is signaling-only: it
  relays offer/answer/ICE-cand' messages between exactly the two peers negotiating a connection
  (over the same Socket.IO connection gameplay already uses) and never sees or touches the audio
  itself.
- **Joining is asymmetric on purpose**: whoever's already in voice initiates the connection to a
  newly-joining player; the new joiner only ever answers, never offers. This makes the direction of
  every connection deterministic by join order, so two peers can never both try to offer the same
  connection at once ("glare").
- **STUN only, no TURN server**: uses a public STUN server (Google's) for NAT traversal, which
  works for the large majority of home/mobile connections. There's deliberately no TURN (relay)
  server — running one has a real ongoing cost, not justified for a small-scale hobby deployment —
  so voice can fail to connect between two specific players stuck behind unusually restrictive
  NATs/firewalls even though the game itself keeps working fine (it never depended on a direct
  P2P path). Accepted as a known limitation.
- **Per-player indicators**: a mic icon on a player's home label shows they're currently in the
  voice channel (distinct from the presence dot above — a player can be connected to the game
  without having opted into voice). A per-device mute toggle silences only that device's own
  microphone, same "local, per-device setting" pattern the existing sound toggle already uses.
- Leaving voice (an explicit button, or simply closing the tab/losing connection) tears down every
  peer connection to that player and stops their microphone; everyone still in voice keeps talking
  to each other unaffected.

### In-game controls (online)
Mirrors hotseat's Play Area panel (§11) — Resign Game, Voice Chat (above), Report Bug, and a sound
toggle — with sound and voice both being purely local, per-device settings (each player controls
only their own device's speaker/microphone).

### Resign (online)
Online's in-game leave flow is now **identical in behavior** to hotseat's Resign (§9) — the old
consensus-based Abort flow (request → agree/decline → forfeit-vs-resume) has been removed
entirely, not kept alongside it:
- A per-game **"Resignation Allowed?"** toggle at game creation (`OnlineSetup.tsx`), defaulting to
  **Not Allowed**, exactly mirroring hotseat's own toggle. Gates whether the Resign Game button
  appears during that game at all.
- Not a vote: clicking Resign Game **unconditionally** resigns the clicking player's own seat — no
  confirmation or agreement is asked of anyone else. This is the one deliberate difference from
  hotseat's semantics, adapted for the fact that online players are on separate devices rather
  than sharing one: hotseat resigns "whoever's turn it currently is" (the person physically holding
  the shared device), while online resigns "whoever clicked," since each player has their own
  device and might want to bow out on someone else's turn.
- Equivalent to a forfeit (§8): the resigning player's pieces are removed from the board and they're
  ranked out immediately (see §8's ranking-order rule for where they land relative to other
  forfeits/eliminations). Enforced server-side (`server/src/realtime/resign.ts`) — the same
  `removePlayers()` reducer hotseat's local `handleResign` calls, applied and persisted the same
  way every other in-game action is (§13's Real-time sync).
- After resigning, every connected device (the resigning player's own and everyone else's) shows the
  same **Resign Information** notice as hotseat's (§9) — purely informational, one acknowledgment
  button, not a decision point. The remaining players continue automatically once dismissed, or the
  game-over screen shows immediately if that resignation ended the game.

### Game over (online)
A normal finish (including a resignation that ends the game — resigning is just another forfeit,
§8) ends at a broadcast **Game Finished** screen listing every player's placement (or "Loss" — see
§7/§8 for exactly who counts as a loss, including a no-capture-chance elimination or a
resignation). Offers:
- **Rematch** — any participant can restart with the same seats (`rematch()`, the same function
  hotseat's "play again"/vs-computer's "Play Again" use), broadcast to everyone the same way Start
  Game is.
- **Exit** — leaves this game and returns to online setup.

### Routing
Each meaningful screen is a real URL with its own browser-history entry, so the browser/phone's
native Back button and gesture work throughout: `/` (mode-select), `/hotseat`, `/vs-computer`,
`/online` (create a game), `/games/:id` (that game's lobby and gameplay).

### Hosting
Frontend on Vercel (static Vite build), backend on Render (free-tier Node/Socket.IO — spins down
after ~15 min idle, so a first request after a quiet spell can take 30–50s to wake up), database on
Neon (Postgres, free tier — also the local dev database; there is no separate local Postgres
instance). No transactional email is currently sent (magic-link and per-invite email were both
removed — see §12); an unused `resend` dependency remains installed but uncalled.

## 14. Vs Computer

A single-device mode like hotseat, but always exactly 2 players: the human (P1) and a
computer-controlled opponent (P3, **"Indramma"**) — opposite bases, per the existing 2-player
convention. No account or roster picker — just enter a name and start.

### AI opponent
A pure, deterministic heuristic (`packages/game-core/src/ai.ts`'s `chooseAiMove`), not a perfect
player — for every legal `(pool value, own piece)` combination, scores it and picks the best:
- **+100 per opponent piece it would capture** (predicted via `resolveCaptures`, the same
  non-mutating prediction `movePiece` itself uses before actually applying a capture).
- **+50 for finishing a piece** (landing exactly on the center).
- **−30 if the landing cell would be capturable by an active opponent next turn** — checked against
  every plausible roll (1, 2, 3, 4, 8) for every opponent piece, respecting the same inner-ring
  capture-gate rule (§7) legal-move checking already enforces.
- **A small forward-progress tiebreaker** otherwise.

The computer's turn (rolling, and picking a value and piece) drives the exact same reducer
functions (`roll`, `selectPoolValue`, `selectPiece`) a human's own button clicks call, each step
after a **2-second minimum pacing delay, extended to also wait for the previous step's
announcement to actually finish playing** (`waitForAnnouncer()` in `announcer.ts`) — long enough
for the human to actually hear the announcement the previous step triggered before the next one
fires, whichever of the two takes longer. Fixes a real cutoff: the delay used to be a flat 2
seconds regardless of how long the announcement actually took to speak, so a longer sentence (e.g.
a bonus-roll or capture announcement) could still be mid-utterance when the computer's next action
fired and the announcer's own cancel-and-replace behavior cut it off. A bonus roll or a capture
naturally continues the computer's turn the same way it would for a human, no special-casing
needed.

### Differences from hotseat
- **Setup**: just the human's name and the same **"Resignation Allowed?"** toggle hotseat has (§9)
  — no player-count or roster picker (always exactly the 2 seats above).
- **Resign**: identical behavior to hotseat's own Resign (§9) — same toggle-gated button, same
  unconditional forfeit, same Resign Information notice — with one necessary adaptation: it always
  resigns the human specifically (`HUMAN_SEAT`), not "whoever's turn it currently is" (hotseat's
  rule, which only makes sense when multiple humans share one device). With just one real
  decision-maker here, resigning the human is the only meaningful interpretation, and — since only
  the AI is left afterward — it ends the game the same way any single-survivor forfeit does,
  landing on the normal placements screen once the notice is dismissed. (Vs Computer used to have
  its own separate, unconditional, always-shown "Abort Game" instead; replaced for consistency —
  every mode now uses the same self-Resign concept, see §12.)
- **Announcements, stats, rematch/new-session**: identical to hotseat — every announcement (turn
  start, roll, capture, finish) is heard regardless of whose turn it is, same as hotseat/online
  (§11), including the computer's own turn; results/stats use the same `localStorage`
  roster-keyed persistence (§10), always including "Indramma" as one of the two players; "End
  Session" returns to mode-select the same way hotseat's does (§9).

## 15. Develop Test ("Developer Mode")

A testing/debugging mode for reaching a specific board position without playing through many
random dice rolls first — identical to hotseat (§9) in every respect (setup — including the
1-player-vs-AI option, gameplay, resign, session/rematch, stats) except for one extra screen
inserted between player setup and the first turn: a **Board Editor**.

### Hidden from ordinary players
Labeled "Developer Mode" on mode-select (was "Develop Test") and hidden from the button list by
default — it's a debugging tool, not a real way to play, and showing it to every player invited
questions about what it's for. Revealed by pressing **Ctrl+Shift+D** (toggles visibility on/off
each press), not persisted — every fresh visit starts hidden again, same "secret until you know
the shortcut" spirit as the shortcut itself. No on-screen way to reveal it at all on a touch-only
device, same as any keyboard shortcut; accepted, since this mode is aimed at development/testing
anyway, not everyday play on a phone.

### Board Editor screen
- Shown immediately after picking player count/names, before any dice are rolled.
- Every piece (all players, all starting stacked at home as normal) is **draggable**; every board
  cell is a **drop target**. Dragging a piece onto a cell moves it to that player's corresponding
  path position for that cell (native HTML5 drag-and-drop — mouse-only, no touch support; accepted
  as a limitation since this is a dev tool, not normal gameplay).
- **Placement rule**: the same friendly-blocking rule real play enforces (§7) applies statically —
  a drop that would put two of the *same* player's pieces on the same non-safe outer-ring cell is
  rejected (the piece stays at its previous position). Multiple pieces (same or different players)
  may freely share a safe cell (§6) or an inner-ring cell (§7), exactly as in real play. No capture
  simulation happens while editing — this is placement, not a move.
- **Per-player "has captured" toggle**: a checkbox per player, defaulting to **unchecked ("Not
  Captured")**, that directly sets that player's `hasCaptured` flag (the same flag §7's inner-ring
  gate and §11's capture-status indicator use). Set manually by whoever's running the setup —
  placing a piece in the inner ring during editing has **no automatic effect** on this flag (see the
  Decisions log, §12, for why this is manual rather than inferred).
- **"Resume as"**: a selector for which configured player's turn the game should start on once
  editing is done (not necessarily the first-listed player).
- **"Start Game From Here"**: finalizes the edited positions and flags into a real starting game
  state — turn order/whose-turn-it-is set to the selected "resume as" player, the normal turn-start
  message and turn-start-revert snapshot (§5.5) rebuilt from this custom position (so an
  early stuck-pool revert on the very first turn reverts back to the custom setup, not to
  everyone-at-home) — then proceeds into the exact same, unmodified gameplay screen hotseat uses.
- **"Reset Positions"**: discards all edits and returns every piece to its owner's home cell,
  `hasCaptured` back to unchecked for everyone — a fresh editor, not a fresh player setup.

### Routing & entry point
- `/develop-test` (a 4th mode-select button, "🛠️ Develop Test") — the same `HotseatPage` component
  as `/hotseat`, given an `allowCustomSetup` prop that's `false` (and therefore has zero effect) on
  the plain `/hotseat` route.

## 16. Language (English / Kannada)

A global, app-wide setting — not per-game — for which language every user-facing label and every
spoken announcement uses. Defaults to **English** for a first-time visitor; the choice persists
(`localStorage`) across visits and switches every already-open screen immediately (no reload
needed).

### Toggle
Two small pill buttons, "EN" / "ಕನ್ನಡ" (`LanguageToggle.tsx`, shared markup for every place this
appears), reachable before a game even starts:
- On mode-select, right-aligned on the same row as its "How do you want to play?" heading.
- On the online sign-in screen, right-aligned on the same row as its "Sign In" heading.
- Both above are moved off the standalone top bar specifically, at the user's explicit request
  (see the Decisions log) — every *other* pre-game screen (needs-profile/create-account,
  hotseat/vs-computer/online setup, the online lobby) still shows it in the shared app header.

During live gameplay the header is hidden entirely (see §11's Decisions log entry) and the same
toggle moves into that screen's App Controls overlay instead — still reachable, just consolidated
with the rest of that screen's non-gameplay controls rather than occupying its own persistent bar.
Each language's own button always shows in that language's own script (not translated by the
*other* selected language), the standard convention for a language switcher.

### Scope
Every user-facing string in the app switches with the setting: every mode's screens (mode-select,
setup, board editor, gameplay, results, stats), the online flow (sign-in, lobby, invites, abort),
the Report Bug modal (including the copied bug-report template's own section headings), and the
spoken announcements. The one deliberate exception: the **welcome splash** (§1) always displays in
Kannada regardless of the saved setting, since it's shown *before* the toggle is reachable — there's
no live choice to honor yet at that point.

### Spoken announcements
Kannada text-to-speech is attempted when Kannada is selected (`utter.lang = 'kn-IN'`), reversing
§12's earlier decision to keep speech English-only — that decision was made because many
devices/browsers have no Kannada voice installed, which can still cause Kannada speech to fail
silently or come out mangled through a fallback voice; accepted as a known risk per the user's
explicit request rather than worked around. English announcements are unaffected and remain
reliable. The turn banner (the persistent "whose turn / what to do" text in the Play Area panel)
is no longer read from `game.message` — that field is generated inside the language-agnostic
game-core reducer and was never one consistent language to begin with (turn-start text was always
Kannada, every other message was always English) — it's now derived client-side from the same
state transitions that already drive the spoken announcements, translated the same way.

### Implementation
Lives entirely in `app/src/i18n/` (`language.ts` — a persisted module-level singleton, same pattern
`audio/announcer.ts`'s own mute flag already uses; `useLanguage.ts` — a `useSyncExternalStore` hook
so components re-render on change; `strings.ts` — the full EN/KN dictionary plus a `useT()` hook).
No `packages/game-core` changes — entirely a display-layer concern, consistent with how board
rotation (§2) and the capture-status/player-status indicators (above) were also kept UI-only.
