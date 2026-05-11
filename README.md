# Thigmo (Playable Prototype + Polish/Audit Pass)

## Run locally
- Open `index.html` directly in a browser, or serve this folder with any static server.
- Example:
  - `python3 -m http.server 8080`
  - then open `http://localhost:8080`

## Current rules implemented
- Exactly 8 tiles exist on an infinite-concept 2D coordinate plane.
- Tiles move 1 space in 8 directions (including diagonals), cannot overlap, and cannot move vertically.
- A tile is movable only if current player influences it (own piece on tile or adjacent 8-neighbor tile).
- Moved tile must remain orthogonally adjacent to at least one other tile.
- Turn order: move tile → place bloom → resolve captures/gravity.
- Stacks max at 7. Placement on full stack is illegal.
- Capture uses **orthogonal 3D adjacency only** (x/y cardinal + above/below).
- Friendly groups share liberties.
- Captured pieces are removed; above pieces collapse.
- First player to 10 captures wins.

## Known limitations
- No AI opponent.
- No save/load persistence.
- Capture flash is minimal (prototype-level animation).
- Mouse hit-testing is radial and can feel imprecise on very dense layouts.
