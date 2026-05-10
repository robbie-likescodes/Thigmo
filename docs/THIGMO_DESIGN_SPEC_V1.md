# Thigmo Design Specification v1 (Pre-Implementation)

**Status:** Draft frozen for implementation planning  
**Date:** 2026-05-10  
**Audience:** Designers, gameplay engineers, UI/UX engineers, QA  
**Scope:** Rules definition, technical architecture, UI behavior, animation flow, and acceptance criteria for the first playable local desktop build.

---

## 1) Product Vision

**Thigmo** is a two-player local strategy board game inspired by Go, with a 3D vertical stacking model and movable terrain tiles.

- Theme: Rival invasive flowering species competing for space and suffocation.
- Play context: Two players share one desktop screen.
- Priority: Mechanical correctness and clarity over graphical complexity.
- Win condition: First player to capture 10 enemy pieces.

---

## 2) Core Design Goals

1. **Deterministic rules:** Every move resolves predictably with no ambiguity.
2. **High readability:** Players can quickly evaluate liberties, captures, and stack structure.
3. **Debuggable implementation:** State changes are inspectable step-by-step.
4. **Pleasant pacing:** Peaceful, garden-like visual/audio feedback without sacrificing clarity.

---

## 3) Game Rules (Formalized)

## 3.1 Board Geometry and Tile System

1. The game board uses an **infinite 2D integer coordinate grid** `(x, y)`.
2. Exactly **8 tiles** exist at all times.
3. Initial tile arrangement is a **2x4 rectangular cluster** (implementation should standardize exact starting coordinates).
4. A tile occupies exactly one `(x, y)` coordinate.
5. Two tiles may **not** occupy the same `(x, y)` coordinate.
6. There are no board edges.
7. No tile creation/removal/locking exists in v1.

## 3.2 Stack and Occupancy Model

1. Pieces occupy vertical levels `z >= 0` over a tile.
2. A tile’s stack is vertically compact (no internal holes after resolution).
3. Pieces are placed at the top of a chosen tile stack (top-only placement).
4. Persistent floating pieces are not allowed.
5. If a tile moves, its full stack translates with that tile.

## 3.3 Turn Structure

A player turn proceeds in this exact order:

1. **Move phase (mandatory):**
   - Choose one legal tile and move it exactly one step in 2D king directions (8-neighborhood).
   - Destination must be unoccupied by another tile.
2. **Placement phase (normally one placement):**
   - Place one piece of your color on any tile stack (top position).
   - If no legal placement exists, placement is skipped.
3. **Resolution phase:**
   - Resolve captures and gravity repeatedly until stable.
4. **Win check:**
   - After full stabilization, evaluate capture counts and win condition.
5. Turn passes to opponent.

## 3.4 Tile-Movement Influence Rules

1. A player may move a tile only if they currently **influence** it.
2. Influence exists if the player has at least one piece:
   - on that tile, or
   - on any 2D-adjacent tile position in the 8-neighborhood.
3. No permanent tile ownership exists.
4. Opening exception: game start uses **temporary global influence** to bootstrap early moves.
   - **Implementation default for v1:** global influence active for first full round (turn 1 of each player), then standard influence rules apply.

## 3.5 Connectivity and Liberties (3D)

1. Piece-group connectivity uses **orthogonal 3D adjacency** only:
   - `(x+1,y,z)`, `(x-1,y,z)`, `(x,y+1,z)`, `(x,y-1,z)`, `(x,y,z+1)`, `(x,y,z-1)`
2. Diagonals never connect and never count as liberties.
3. Liberties are counted only where a piece cell could exist in the game’s occupancy domain.
4. If no tile exists at neighbor `(x,y)`, that side contributes no liberty.
5. Floor below `z=0` is not a liberty.

### Practical liberty interpretation for v1

For an occupied cell `(x,y,z)`, a neighbor direction contributes liberty if:
- the neighbor coordinate is inside valid occupancy domain (requires tile existence for horizontal neighbors), and
- no piece occupies that neighbor cell.

This keeps liberty checks local, deterministic, and aligned with the intended 3D surround play pattern.

## 3.6 Capture Rules

1. Capture is **Go-style group capture**: any connected same-color group with zero liberties is captured.
2. Capture order within each resolution cycle:
   1. Remove opponent zero-liberty groups first.
   2. Then remove current-player zero-liberty groups (self-capture allowed).
   3. Apply gravity compaction.
3. Repeat capture+gravity cycles until no captures occur.
4. Captured pieces are removed and count toward captor score.
5. No ko/repetition rule in v1.

## 3.7 Win Condition

- First player to reach **10 captured enemy pieces** wins.
- Win is checked **after full cascade stabilization**.

## 3.8 Invalid-State Handling

- If no legal tile move exists when move is mandatory, treat as invalid game state (engine/QA error), not a normal rules outcome.

---

## 4) UX and Visual Direction

## 4.1 Art Style and Theme

- Stylized cartoon garden.
- 8 dirt patch tiles in a lush green environment.
- Species colors: Purple player vs Orange player.

## 4.2 Camera and Controls

- 3D camera with:
  - Left-click drag: rotate
  - Mouse wheel: zoom
  - Shift + left-click drag: pan
- Persistent orientation cube in top-right (Fusion-style behavior).
- Clicking visible cube face snaps camera to corresponding view.
- Supports all six axial directions.

## 4.3 Turn and Readability Aids

- Active player shown by colored screen-edge glow.
- Liberty assist overlay:
  - highlights opponent-relevant liberties in pulsing green,
  - toggleable,
  - default ON.
- Legal tile move destinations shown as ghost dirt patches.

## 4.4 Spacing Slider

- Top UI slider range: 0 to 10.
- Adjusts **visual tile spacing only**.
- No impact on gameplay coordinates, move legality, capture logic, or scoring.

## 4.5 Animation Design

### Placement animation (1.2s target)
1. Watering can appears.
2. Water splash.
3. Sprout emergence.
4. Bloom opening.

### Capture animation (3.0s target)
1. Captured flowers wilt/shrivel.
2. Captured pieces are removed.
3. Gravity settles remaining pieces.
4. Settled flowers visually reconnect/root.

## 4.6 Input Locking

- During animations and resolution, player input is blocked.
- New actions allowed only when the board reaches stable post-resolution state.

## 4.7 Audio Direction

- Peaceful garden ambience.
- Watering sounds during placement.
- Gentle chimes on bloom/capture events.
- Overall serene, low-fatigue mix.

---

## 5) Technical Architecture (Recommended)

## 5.1 System Separation

1. **Rules Engine (headless, deterministic)**
   - Legal move generation
   - Placement legality
   - Capture/gravity fixed-point resolution
   - Scoring and win checks
2. **Presentation Layer**
   - Renders snapshots
   - Runs animations for state transitions
3. **Interaction Controller**
   - Handles phase-gated input
   - Executes user intents
4. **Debug/Replay Layer**
   - Shows per-phase and per-cascade transitions

## 5.2 State Model (Conceptual)

- `tiles`: mapping of tile IDs to 2D coordinates
- `stacks`: per-tile vertical piece arrays
- `currentPlayer`
- `capturesByPlayer`
- `turnNumber`
- `phase`
- `openingInfluenceMode`
- `undoCheckpoint` (turn start snapshot)
- optional `history` for debugging/replay

## 5.3 Deterministic Turn Pipeline

1. Validate chosen tile move.
2. Apply tile translation (+stack translation).
3. Validate/apply placement or skip.
4. Resolve capture/gravity loop to fixed point.
5. Update captures.
6. Check win.
7. Commit turn and handoff.

---

## 6) Undo Specification

**Approved behavior:** Option A.

- Undo restores **entire current turn** to pre-move snapshot.
- Minimum requirement: one-level undo for active turn only.
- Disabled once turn is finalized and passed (unless future versions add multi-turn history navigation).

---

## 7) QA and Validation Criteria

## 7.1 Rules Correctness Tests

1. Tile cannot move into occupied tile coordinate.
2. Tile move is exactly one king step.
3. Influence gating works after opening bootstrap ends.
4. Placement on any tile top works.
5. Group connectivity is orthogonal-only.
6. No diagonal capture connectivity.
7. No-tile horizontal spaces never counted as liberties.
8. Opponent-capture-first ordering respected.
9. Self-capture allowed after opponent removals.
10. Capture/gravity cascades continue until stable.
11. Win only after stabilization.
12. Score increments by exact removed enemy count.

## 7.2 UX/Flow Tests

1. Input locks correctly during animations.
2. Orientation cube snap is accurate for all 6 directions.
3. Liberty assist toggle works and defaults ON.
4. Spacing slider never changes game logic.
5. Undo returns exact pre-turn state (board, scores, player turn, phase).

---

## 8) Known Risks and Mitigations

1. **Cascade complexity:**
   - Risk: state/animation desynchronization.
   - Mitigation: animate only committed snapshot deltas.
2. **Liberty visualization trust:**
   - Risk: mismatch between overlay and capture outcomes.
   - Mitigation: derive overlay from same engine liberty function.
3. **Long animation pacing during large captures:**
   - Risk: perceived sluggishness.
   - Mitigation: optional animation speed multiplier in settings.
4. **Camera occlusion with tall stacks:**
   - Risk: hidden critical cells.
   - Mitigation: transparency fade on occluding geometry.

---

## 9) Non-Goals for v1

- Online multiplayer
- AI opponent
- Colorblind accessibility mode
- Ko/repetition adjudication
- Advanced map/tile generation modes

---

## 10) Implementation Readiness Checklist

Before writing production code, ensure:

- [ ] Exact initial coordinates for 2x4 tile layout are fixed.
- [ ] Opening global-influence duration is explicitly encoded.
- [ ] Liberty and capture helpers are defined in one canonical rules module.
- [ ] Resolution loop termination assertions are in place.
- [ ] Undo snapshot boundaries are finalized.
- [ ] Debug overlay for groups/liberties is planned.

---

## 11) Future Extensions (Post-v1)

- Ko/repetition draw rules
- Alternative win conditions
- Expanded audio-reactive visual polish
- Replay export/import
- Optional accessibility palettes and markers

---

**End of Specification**
