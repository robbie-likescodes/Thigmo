# Thigmo Rules — *Botanical Battlefield*

Welcome to **Thigmo**, where rival floral lineages wage a slow, intelligent war for dominance of living soil.  
Every stem, tendril, and rootlet competes for one destiny: become the reigning invasive species.

This isn’t random growth.  
This is **botanical strategy**.

---

## 1) Objective: Rule the Soil

Your goal is to overrun your rival’s bloom network through positional pressure and oxygen starvation.

- You win immediately when you have captured **10 enemy blooms**.
- Captures happen through tactical encirclement and deprivation of growth space (liberties).

Think of it as: *if their flowers can no longer breathe or expand, they wither—and you spread*.

---

## 2) Components of the Living Battlefield

- **8 terrain tiles** (the movable soil patches)
- Two bloom factions:
  - **Purple**
  - **Orange**
- A vertical growth column on each tile (stacks of blooms rising upward)

Each tile is a patch of soil.  
Each bloom is a living node in a climbing plant colony.

---

## 3) Board Ecology: How Space Exists in Thigmo

1. The world is an infinite coordinate field.
2. Only **8 soil tiles** exist in the match.
3. No two tiles may occupy the same coordinate.
4. Blooms occupy vertical positions above each tile: `z = 0, 1, 2...`
5. If a tile moves, the **entire bloom stack on that tile moves with it**.
   
Narratively: a soil patch carries all roots anchored in it when displaced.

---

## 4) Turn Cycle: Pulse of Growth

Every turn has three phases, always in this order:

### Phase A — Shift One Soil Tile (Required)

You must move exactly one legal tile you influence:

- Move it **one step** in any of 8 directions (orthogonal or diagonal).
- Destination must be empty (no tile already there).
- After movement, all 8 tiles must still form one connected landmass by **orthogonal tile contact** (no isolated island tiles).

This is tectonic root warfare: you are physically reshaping the contested biome.

---

### Phase B — Plant One Bloom (Required unless full)

After shifting soil, you must place one bloom of your color:

- Place onto **any tile**.
- It lands at the top of that tile’s current stack.
- You cannot place on a stack already at the **7-bloom maximum**.

This is the expansion pulse of your colony.

---

### Phase C — Resolve Withering (Captures)

After planting, captures resolve automatically in waves until stable:

- First, opponent groups with zero liberties are removed.
- Then, your own zero-liberty groups are removed (self-capture is possible).
- Repeat until no new removals occur.

All enemy blooms removed in this process add to your capture count.

---

## 5) Tile Influence: What You Are Allowed to Move

A soil tile is movable by you if **either** condition is true:

1. Your bloom appears somewhere in that tile’s stack, **or**
2. Your bloom appears in at least one neighboring tile in the 8-direction neighborhood.

Theme wording: your colony can only project force through direct tissue presence or nearby touch contact.

---

## 6) Thigmotropic Control (Why Neighbor-Limited Influence Exists)

**Thigmotropic / thigmotropism**: a biological growth response to physical touch or contact cues.  
(From Greek roots meaning roughly “touch-turning.”)

In Thigmo terms:

- Your colony can only meaningfully manipulate local terrain where it has direct contact pathways.
- That’s why tile influence is local: **you can only thigmotropically affect your neighbors**.

So this rule isn’t arbitrary—it models plants transmitting pressure and growth behavior through proximity and contact.

---

## 7) Groups and Liberties: Survival Physics of Blooms

### Group Connectivity

Blooms are connected only through **orthogonal 3D adjacency**:

- Left/right/forward/backward on same height (`z`)
- Directly above/below on same tile (`x, y`)

Diagonal contact never links groups.

---

### Liberty Definition

A **liberty** is an empty orthogonally adjacent cell where growth could exist.

- Horizontal liberty counts only where a tile actually exists at that `(x, y)`.
- Space below ground (`z < 0`) is invalid.

If a full connected group has **zero liberties**, it cannot survive.

---

## 8) Capture Waves and Cascades

Capture checks are iterative and can chain:

1. Remove opponent zero-liberty groups.
2. Remove your own zero-liberty groups.
3. Re-check everything.
4. Stop only when no group has become newly capturable.

This creates tactical cascades: one placement can trigger a multi-stage collapse of both ecosystems.

---

## 9) Win Condition (Exact)

You win instantly when your total captured enemy blooms reaches **10** after capture resolution.

---

## 10) Legal Move Checklist (Quick Rules Audit)

A tile move is legal only if all are true:

- You influence that tile.
- It moves exactly one step to an adjacent coordinate (8-way).
- Destination is unoccupied.
- Final tile layout remains orthogonally connected.

A bloom placement is legal only if:

- You are in Phase B, and
- Target stack has fewer than 7 blooms.

---

## 11) Practical Clarifications

- Undo restores the prior full-turn snapshot.
- Visual helpers (liberty overlays, debug displays) do not alter rules.
- This rulebook describes current gameplay behavior.
