# Chowka Bhara — Requirements

## 1. Overview
A digital, single-device, hotseat implementation of the traditional cross-board race/capture game
Chowka Bhara (a.k.a. Ashta Chamma), for 2–4 players.

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

## 3. Players & Pieces

- 2, 3, or 4 players per game.
- Each player has 4 pieces, numbered 1–4, all starting stacked at that player's home cell.
- Each player is assigned a distinct color; color + name are shown on the board / player list.
- **2-player games**: players are seated at opposite bases (P1 & P3).
- **3-player games**: uses bases P1, P2, P3 (P4 slot unused). *(See §12.)*
- **4-player games**: uses all four bases.

## 4. Dice

- 4 two-sided dice, each face is black (value 0) or white (value 1).
- All 4 rolled together each throw.
- Scoring a throw:
  | Result | Condition | Move value |
  |---|---|---|
  | Bhara | all 4 black | 8 |
  | Chauka | all 4 white | 4 |
  | Normal | mixed | count of white faces (1, 2, or 3) |
- **Bhara or Chauka grants an immediate bonus roll** (roll again, in addition to the value just earned).
- A turn keeps rolling as long as bonus rolls keep coming. Every value earned during the sequence
  is added to that turn's **move pool** — nothing is discarded until the player has used it or the
  turn ends.

## 5. Turn Flow

1. Active player rolls until a non-bonus result ends the rolling phase.
2. All values accumulated this turn are shown as the move pool.
3. Player picks **any one pool value** and **any one of their own pieces**, then moves that piece
   that many steps forward along its path.
4. That value is consumed from the pool. If pool values remain and at least one is a legal move for
   some piece, the player repeats step 3.
5. **The whole pool must be played out.** If, at any point, no remaining pool value can legally
   move any piece, the entire turn's moves — every piece moved and every capture made since the
   turn began, including through any capture-bonus reroll chain — are **undone**, as if the turn
   never happened, and the turn passes to the next player (anticlockwise: P1 → P2 → P3 → P4 →
   P1 …, skipping players not in the game / already finished). The one exception: if the player
   has already finished (all 4 pieces home) by the time they get stuck, that stands — a win is
   never reverted just because a leftover die can't be used.
6. **Capturing an opponent piece grants a bonus roll**, on top of the current turn: the player
   rolls again (step 1 again, including the possibility of further bonus-roll chains), and the
   new value(s) join the move pool. Any value already in the pool that hadn't been used yet
   (e.g. a roll from before the capture) is **not** discarded — it stays available alongside
   whatever comes from the bonus roll.
7. A piece must land **exactly** on position 24 to finish; a pool value that would overshoot 24 is
   not a legal move for that piece. *(See §12.)*

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
  are captured at once.
- A captured piece is sent back to its owner's home cell (path position 0).
- Capturing grants the capturing player a bonus turn (§5.6).
- **Entry to the inner ring is gated on capturing**: a player cannot move any piece into the
  inner ring (positions 16–23), or therefore reach the center, until they have captured at least
  one opponent piece at some point in the game. Once a player has captured a single piece, this
  restriction is lifted for the rest of the game (it does not reset). A piece blocked only by this
  rule is treated as having no legal move for that value — it cannot be selected, and is not
  highlighted as movable.
- **Legal-move highlighting**: a piece is only highlighted as active/selectable when it is the
  current player's and has at least one legal move available — for the dice value picked, or for
  at least one still-pending pool value before a value has been picked. A piece that has already
  reached the center is never highlighted, regardless of turn state.

## 8. Winning & Rankings

- A player finishes (and is ranked) the moment all 4 of their pieces reach the center (position 24).
- Play continues among remaining players until only one is left; that player is ranked last
  automatically (no forced "loss" language before then).
- Final placement order: 1st, 2nd, 3rd, and — for 4-player games — a 4th/last place, which counts
  as a "loss" for statistics purposes (see §10).

## 9. Game Setup, Abort & Session Flow

### Setup
- At the start of a session, let the host pick 2–4 players.
- For each seat, allow either selecting an existing/previously-played player (from stored roster) or
  entering a new player name.
- Assign colors/base positions per §3 and display them on the board and player list.

### Abort
- Any player can request an abort at any time during a game.
- All current players are asked to confirm.
- If everyone agrees → the game is aborted (return to setup / session menu).
- If 2 or more players decline → ask the group whether to continue by removing the pieces of the
  player(s) who **agreed to abort** (not the decliners) from the board and treating them as having
  lost the game, letting the declining players — the ones who want to keep playing — play on.
- If fewer than 2 decline (i.e., exactly 1 or 0) → abort request is cancelled, play resumes normally.

### Session & Rematch
- A **session** is one continuous sequence of games played by the same browser instance.
- When a game ends, show that game's final ranking, then ask whether to play again with the same
  players (same session).
- If yes → reset the board/pieces and start a new game, keeping the running session tally.
- A session has no cap on the number of games played.
- Show a cumulative **session summary table** (all players, all games played so far this session)
  after every game.

## 10. Statistics

Tracked **per player, across all sessions** (persisted — see §12):
- Total games played — includes games that were fully aborted (see below).
- "1st Win" % — finished 1st.
- "2nd Win" % — finished 2nd.
- "3rd Win" % — finished 3rd.
- "Loss" % — finished last, or was forfeited/removed during a partial abort (§9) while other
  players continued the game.
- "Aborted" % — the game was called off by unanimous agreement of every player before any
  placements were decided. This is distinct from "Loss": a full abort counts as Aborted for every
  player in that game (no one is placed), while a partial abort/forfeit counts as a Loss only for
  the forfeited player(s) — the players who continued get a normal placement-based result once
  their game ends.

All stats are shown as a percentage of total games played. Clicking a player's name (on the board,
or in the session summary table) opens their full lifetime statistics.

## 11. UI & Interaction Requirements

### Play Area panel
The right-hand panel next to the board ("Play Area", chocolate-brown background, fixed footprint
matching the board's height so it never resizes as its content changes) contains, top to bottom:
1. A text box announcing whose turn it is, in Kannada: "<player name>, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ".
2. The roll button, labeled "ಕವಡೆ ಹಾಕಿ".
3. The round kavade-throw area: shows a shaking-hands idle animation while waiting for a roll,
   then the scattered result (black/white ovals) of the latest throw once rolled.
5. The cumulative list of pool values still to be played this turn, labeled in Kannada
   "ನಡೆಸಬೇಕಾದ ಗರಗಳು" ("moves still to be made").
6. The Abort Game button.
7. The sound on/off toggle (mirrors the one on the setup screen — see below).

*(Numbering above follows the original spec as given; item 4 was not specified.)*

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
Spoken (Web Speech) and chime (Web Audio) announcements fire for: a completed roll (including
bhara/chauka bonus call-outs), a capture, and a piece/player finishing. Sound can be toggled off
both from the setup screen and, independently, at any time during a game from the Play Area panel;
the on/off state is shared between the two toggles.

### Setup screen
- Player count (2–4) selectable, with per-seat name entry; existing roster names can be reused,
  new names typed freely.
- The sound on/off prompt is shown after player selection, phrased as a yes/no-style question
  ("Do you want announcements or instructions?").

## 12. Decisions & Assumptions Log

Resolved during requirements gathering:
- **Safe squares**: all 4 bases + center are safe for *everyone*, not just the owner (§6). This is a
  behavior change from the first HTML prototype, which only protected a piece at its own path
  position 0/24 — fixed.
- **Capture bonus**: capturing grants one more roll (bonus-chain eligible), added on top of the
  current move pool — any not-yet-used value already in the pool is kept, not discarded (§5.6).
- **Stats persistence**: player roster and lifetime stats are saved in the browser (`localStorage`)
  so they survive page reloads/reopens — not just kept in memory for one tab session.
- **Tech direction**: resolved as React 19 + TypeScript + Vite, built under `/app`. Uses
  framer-motion for animations and `localStorage` for persistence (roster + lifetime stats); no
  backend. The original `board_game.html` prototype and sketches remain at the project root as
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
- **Abort/forfeit direction**: on a partial abort (some players decline), the pieces removed belong
  to the player(s) who *agreed to abort*, not the decliners — the decliners are the ones who
  continue playing (§9). An earlier reading of this section had it backwards; corrected.
- **Turn revert on a stuck pool**: if a player gets stuck with an unplayable pool value partway
  through a turn (including partway through a capture-bonus reroll chain), every move and capture
  made since the turn began is undone before passing to the next player — unless the player has
  already finished, in which case the win stands (§5.5). Implemented.
- **Stats categories**: placement stats are labeled "1st/2nd/3rd Win"; a full unanimous abort is
  tracked as a distinct "Aborted" stat rather than folded into "Loss", and counts toward total
  games played for every player in that game (§10).
- **Legal-move highlighting**: only pieces with an actual legal move (for the selected value, or
  any pending pool value before one is picked) are visually highlighted; finished pieces are never
  highlighted (§7, §11).

Still open / assumed defaults (flag if any of these are wrong):
- **Only one active session per browser**: stats/roster are stored per-browser (localStorage), not
  synced across devices — no login/accounts.
