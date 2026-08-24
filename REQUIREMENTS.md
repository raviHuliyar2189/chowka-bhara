# Chowka Bhara — Requirements

## 1. Overview
A digital implementation of the traditional cross-board race/capture game Chowka Bhara (a.k.a.
Ashta Chamma), for 2–4 players, with three modes:

- **Hotseat**: a single device passed between players in person, no account required.
- **Online**: players on separate devices (laptop/tablet/phone), each signed in with their own
  account, playing together over the internet in real time.
- **Vs Computer**: one human against a computer-controlled opponent, on a single device.

All three modes share the exact same game engine (`packages/game-core`) and the exact same
board/dice UI components (`Board`, `DiceTray`) — the rules, legality, and animations are identical
across all of them. What differs is who computes a move (the browser locally in hotseat and vs
computer; the server authoritatively in online), how players get into the same game, and — for vs
computer only — that one seat's moves come from a heuristic AI instead of a person (§14).

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

## 8. Winning & Rankings

- A player finishes (and is ranked) the moment all 4 of their pieces reach the center (position 24).
- A player is also removed from play (without finishing) if: they're the last one standing when
  everyone else has finished (auto-ranked last), they're forfeited during a partial abort (§9/§13),
  or the no-capture-chance rule declares them lost (§7).
- Play continues among remaining players until only one is left; that player is ranked last
  automatically (no forced "loss" language before then).
- Final placement order: 1st, 2nd, 3rd, and — for 4-player games — a 4th/last place, which counts
  as a "loss" for statistics purposes (see §10).

## 9. Hotseat: Setup, Abort & Session Flow

*(This section is hotseat-specific — see §13 for how setup/abort/session work in online mode,
which differ meaningfully since players aren't sharing one device.)*

### Setup
- At the start of a session, let the host pick 2–4 players.
- For each seat, allow either selecting an existing/previously-played player (from stored roster) or
  entering a new player name.
- Assign colors/base positions per §3 and display them on the board and player list.

### Abort
- Any player can request an abort at any time during a game.
- All current players are asked to confirm, one after another, through a single shared modal (all
  players are on the same device).
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

Tracked **per player**:
- Total games played — includes games that were fully aborted (see below).
- "1st Win" % — finished 1st.
- "2nd Win" % — finished 2nd.
- "3rd Win" % — finished 3rd.
- "Loss" % — finished last, was forfeited/removed during a partial abort, or lost via the
  no-capture-chance rule (§7), while other players continued the game.
- "Aborted" % — the game was called off by unanimous agreement of every active player before any
  placements were decided. This is distinct from "Loss": a full abort counts as Aborted for every
  seated player in that game (no one is placed), while a partial abort/forfeit counts as a Loss
  only for the forfeited player(s) — the players who continued get a normal placement-based result
  once their game ends.
- "Declined" % (**online only**) — the player declined an invite (§13). Recorded the moment they
  decline, independent of whether that game ever actually starts. Distinct from every other
  category, including the pre-start creator cancellation (§13), which isn't recorded anywhere.

**Hotseat**: stats are per-player-name, stored in the browser (`localStorage`) — see §12's "still
open" note; not synced across devices or browsers.

**Online**: stats are per-account, stored server-side (Postgres `player_stats` table, one row per
registered player, bumped by the server whenever a game finishes or is aborted) — persistent
across every device that account logs into. There is currently no UI to view online stats (the
data is recorded but not yet surfaced in the online screens).

All stats are shown as a percentage of total games played. Clicking a player's name (on the board,
or in the session summary table) opens their full lifetime statistics (**hotseat only**, currently).

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

*(Numbering above follows the original spec as given; item 4 was not specified. Online mode's
gameplay screen mirrors this same layout, plus a Report Bug button — see §13.)*

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

All spoken announcements are in **English**, regardless of the on-screen text (which stays
Kannada, e.g. the turn banner's "<name>, ನಿಮ್ಮ ಸರದಿ, ಕವಡೆ ಹಾಕಿ" and the on-screen "select a value
first" nudge) — most devices/browsers have no Kannada voice installed, so Kannada text either fails
to speak at all or gets mangled through a fallback voice; English is close to universally
supported, so the spoken announcement is reliably heard in full.

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
inside a click handler the way hotseat's local reducer calls are. To mitigate this, the very first
tap/click/keypress anywhere on the page "primes" both the Web Speech and Web Audio APIs (a silent
utterance + resuming the audio context) so they're already unlocked well before gameplay starts,
for every player regardless of which specific control they happen to interact with first.

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

Still open / assumed defaults (flag if any of these are wrong):
- **Hotseat stats are single-browser only**: roster/stats are stored per-browser (`localStorage`),
  not synced across devices — this is now specifically a hotseat limitation, since online mode has
  real per-account server-side stats (§10), just not yet surfaced in any UI.
- **No online stats UI yet**: recorded server-side but not shown anywhere in the online screens.

## 13. Online Multiplayer

### Accounts & sign-in
- Register with an email address and a mandatory display name; logging back in only needs the
  email (no password). See §12 for why this is deliberately lighter-weight than magic-link
  verification or OAuth.
- A session is a signed token (JWT) issued on login/registration, stored in the browser's
  `localStorage` and sent as a `Bearer` `Authorization` header on every API call and in the
  Socket.IO connection handshake (see §12 for why not a cookie).
- Login is required up front, before either hotseat or online mode is reachable — not just for
  online play. A returning visitor with a valid stored token skips straight past the login screen.

### Creating, inviting & joining a game
- The creator picks a player count (2–4) and creates the game; they're automatically seated as P1.
- The game gets a shareable URL (`/games/:id`). **Who specifically gets invited is decided entirely
  inside WhatsApp**, not this app — the creator shares the link via WhatsApp's own contact/forward
  picker (a "Share on WhatsApp" link, pre-filled with who started the game, the planned player
  count, and who's joined so far); a plain Copy Link option exists too. The app itself never knows
  the intended invitee list, only who actually opens the link afterward.
- Opening the link for the first time (signing in first if needed) shows an explicit **Join /
  Decline** choice — naming who started the game, the planned player count, and who's joined so
  far — rather than joining automatically. Only clicking Join actually claims a seat.
- **Declining** claims a seat slot too (so the room can still fill up predictably) but as
  `status: 'declined'` instead of `'joined'` — recorded in that player's statistics immediately
  (§10), not deferred to whether the game ever starts. A player who declines sees a simple
  confirmation and nothing further from that game.
- **"Start Game" only requires at least 2 joined**, not every originally-planned seat — the room
  adapts to however many people actually accept. **Seat fairness on start**: the joined players are
  re-seated onto the fair topology for however many actually joined (`SEATS_BY_COUNT[joinedCount]`
  — opposite bases for 2, etc.), in their original join order; declined players take whatever
  seat(s) are left over from the originally-planned topology, e.g. 4 planned + 1 decline → the 3 who
  joined get P1/P2/P3, the decliner gets P4. This keeps active play balanced regardless of exactly
  who declined.
- **The creator alone can cancel the game while it's still in the lobby** (before Start), with no
  vote or confirmation needed from anyone else — different from in-game Abort (below), which does
  require consensus once play has actually started. Not counted in anyone's stats, since the game
  never started.
- Opening a link to a game that's already in progress rejoins the participant straight into the
  live board (closed tab, refreshed page, or a different device) instead of a stale waiting room.
- Opening a link to a game that was aborted (whether cancelled pre-start by the creator or fully
  aborted in-game) shows an explicit "this game was aborted" message instead of any board/lobby
  state.
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

### In-game controls (online)
Mirrors hotseat's Play Area panel (§11) — Abort Game, Report Bug, and a sound toggle — with sound
being a purely local, per-device setting (each player mutes/unmutes only their own device).

### Abort (online)
Adapted from hotseat's consensus flow (§9) for players on separate devices:
- Any active (not finished/lost) player can request an abort from their own device.
- Every other active player is prompted on their own device to agree or decline; the requester's
  own agreement is implicit.
- **0 declines** → the game is fully aborted for everyone (see §10/§12 for the stats/invalidation
  consequences).
- **Exactly 1 decline** → resume, nothing changes.
- **2+ declines** → the *requester's* device (specifically, not anyone else's) is asked the
  forfeit-vs-resume follow-up question hotseat's shared modal would otherwise ask whoever's
  holding it.

### Game over (online)
The game-over screen lists every player's placement (or "Loss" — see §7/§8 for exactly who counts
as a loss, including a no-capture-chance elimination or a forfeit, both of which are now always
included here rather than silently omitted) and offers two actions:
- **Rematch** — any participant can restart with the same seats (`rematch()`, the same function
  hotseat's "play again" uses), broadcast to everyone the same way Start Game is.
- **Exit** — leaves this game and returns to online setup; same destination as leaving via an
  in-game Abort.

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
computer-controlled opponent (P3, "Computer") — opposite bases, per the existing 2-player
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

The computer's turn (rolling, and — after a short pacing delay so it doesn't feel instant —
picking a value and piece) drives the exact same reducer functions (`roll`, `selectPoolValue`,
`selectPiece`) a human's own button clicks call; a bonus roll or a capture naturally continues the
computer's turn the same way it would for a human, no special-casing needed.

### Differences from hotseat
- **Setup**: just the human's name — no player-count or roster picker.
- **Abort**: hotseat's multi-player consensus flow (§9) doesn't apply with only one real person to
  ask — clicking Abort Game ends the game immediately, no confirmation cycling.
- **Announcements, stats, rematch/new-session**: identical to hotseat — the computer's moves are
  announced the same way a human's would be, and results/stats use the same `localStorage`
  roster-keyed persistence (§10), just always including "Computer" as one of the two players.
