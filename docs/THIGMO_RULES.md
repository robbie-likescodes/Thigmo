# Thigmo Rules

A complete, player-facing rulebook for the current playable version of **Thigmo**.

---

## 1) Objective

Capture your opponent's blooms. The first player to capture **10 enemy pieces** wins.

---

## 2) Components

- **8 terrain tiles** (the wooden squares you move around)
- Two bloom colors:
  - **Purple** player
  - **Orange** player
- A vertical stack space above every tile (pieces can be stacked)

---

## 3) Board and Space Model

1. Tiles live on an infinite coordinate grid.
2. Exactly **8 tiles** exist for the whole game.
3. A tile can never share the same position with another tile.
4. Pieces occupy vertical levels (`z = 0, 1, 2, ...`) above each tile.
5. When a tile moves, the **entire stack on it moves with it**.
6. A tile stack can hold up to **7 pieces**.

---

## 4) Turn Structure

On your turn, you must do these phases in order:

### Phase A — Move one tile (required)

1. Select one legal tile you influence.
2. Move it **one step** to an adjacent square (8-direction movement: horizontal, vertical, or diagonal).
3. Destination must be empty (no other tile there).
4. The moved board must keep all tiles connected by orthogonal adjacency (no isolated tile).

### Phase B — Place one bloom (required unless stack is full)

1. Place one bloom of your color on any tile.
2. You place on top of that tile's existing stack.
3. You cannot place on a stack that is already at 7 pieces.

### Phase C — Resolve captures

- After placement, captures resolve automatically until stable.

Then turn passes to the other player.

---

## 5) Tile Influence (who can move what)

You can move a tile if either is true:

1. Your color exists somewhere in that tile's stack, **or**
2. Your color exists in at least one 8-neighbor tile around it.

This is recalculated every turn.

---

## 6) Groups and Liberties (capture logic)

### Group connection

Pieces are connected only by **orthogonal 3D neighbors**:

- left / right / forward / back (same z), plus
- directly above / below (same x,y)

Diagonal cells never connect groups.

### Liberty definition

A liberty is an empty orthogonal neighbor cell where a piece could exist.

- Horizontal liberties only count where a tile exists at that `(x, y)`.
- Space below `z = 0` is never valid.

---

## 7) Capture Order and Cascades

During resolution:

1. Remove all opponent groups with zero liberties.
2. Then remove your own zero-liberty groups (self-capture is allowed).
3. Repeat the scan until no additional captures happen.

Captured enemy pieces increase your capture score.

---

## 8) Win Condition

You win immediately when your capture total reaches **10** after resolution.

---

## 9) Quick Legality Checklist

A move is legal only if all are true:

- The selected tile is influenced by the current player.
- It moves exactly one adjacent step (8-neighborhood).
- Target coordinate is empty.
- Result does not isolate any tile from orthogonal tile adjacency.

A placement is legal only if:

- You are in placement phase, and
- Target stack has fewer than 7 pieces.

---

## 10) Practical Notes

- Undo restores the previous full turn snapshot.
- The visual "liberty assist" / debug aids do not change game rules.
- The rules above describe current gameplay behavior.
