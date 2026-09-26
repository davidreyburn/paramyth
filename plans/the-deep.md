# The Barrow Deep

*v0.1, 2026-09-26. A plan, not a build. `design/world-shape.md`: "One connected
network beneath every mausoleum. Collapsed halls, vaults, the Ransacked
Archive. Where the graph becomes the game."*

## What is true today, and what is wrong with it

- A **site** is a mausoleum with its own Field above it and 2–4 floors below,
  each a 3×2 grid of rooms. Floors link by stairs within the site. The bottom
  floor's `stairDown` is −1: the world ends there.
- `s.site` is 0 from birth to death. **There is no way to change site.** Yet
  `core/provenance.js` sends one lead in four to a foreign site (`FOREIGN_IN`,
  `FOREIGN_SITES = 16`) — "the threads that pull a player past the region they
  meant to stay in." Those threads pull at nothing. Every foreign lead today
  points somewhere unreachable, which is a promise the game breaks silently.
- Depth is era, and depth is `floor + 1`. Four floors reach absolute depth 4:
  **Imperial**, barely. The **Lost Empire** stratum (depth > 8), its two
  archetypes and its name pool have never been walked. The era table has dead
  rows again, for a new reason.

The Deep fixes all three with one shape.

## The shape

**The Deep is one site with many floors, and every mausoleum has a shaft
into it.**

- A reserved site number, `DEEP` (say 1000), whose floors are **levels**:
  floor 4 is Deep level 0, floor 5 is level 1, and so on. This keeps
  `absDepth(floor)` true without touching its signature: level 0 is depth 5,
  the heart of Imperial; level 4 is depth 9, the first Lost Empire. Every
  address in the game (`site:floor:room:slot`), every pure function keyed on
  `(seed, site, floor, room)`, and every gate that walks them, works unchanged.
- A level is not a 3×2 grid but a **wide one** — `DW × DH`, 12×8 to start, 96
  rooms. `floorPlan()` returns its own `gw, gh`; `step()`'s room-crossing
  arithmetic (`room ± 1`, `room ± GW`) reads them from the plan instead of the
  constant. That is the one change below L4 that the Deep forces, and it is
  the right one regardless.
- **Every mausoleum's bottom floor gains a stair down.** It lands in Deep level
  0 at `deepEntry(seed, site)`: a room chosen by hash, **not by site number**,
  so two mouths a minute apart on the surface can enter the Deep an hour apart,
  and two at opposite ends of the Field can share a wall. The up-stair in that
  room returns to that mausoleum. The stairs are *one shaft*, derived one from
  the other, as they already are within a site.
- **Climbing a different mausoleum's shaft changes `s.site`.** You surface in
  *its* Field. Only site 0's Field holds the Company Camp; every other site's
  room 0 is open ground (later: a salvage camp, a ruin, a bandit hold — the
  Field's own content). Death still returns you to the Company Camp, and your
  remains lie where you fell, in whichever site that was.

## The graph

A level's rooms link by a generated graph, computed whole per level (96 cells;
trivial; memoized) and read lazily per room, so nothing changes about how a
room is made — `roomTiles` carves doors from `plan.links` as it does now.

1. **A spanning tree** over the grid, from a hashed order of edges: connected
   by construction, no solver, deterministic. Every room is reachable from
   every other.
2. **Loops.** A hashed fraction of the remaining edges (one in five) added back,
   so the network is a graph, not a tree, and a dead end is a choice, not a
   trap.
3. **The trunk.** The BFS path between the two entries farthest apart on the
   level is marked `trunk`. Trunk rooms carve **wide and straight** (a new
   archetype: a hall with a passage down its length), hold **less** (one
   container in six rather than three), and threaten **less** (dogs only,
   sparser). Everything off the trunk is a **capillary**: the existing
   Imperial and Lost Empire archetypes, denser contents, Sentinels and worse.
   That contrast is the route choice on every run, and it maps onto the load
   tiers exactly as the design says: the trunk is where an overloaded
   scrapper can still move.
4. **Shafts between levels.** A hashed handful of rooms per level (three or
   four) hold a stair to the level below, derived the same way floors within a
   site already are. Level 0 to level 4 is the Act I extent.
5. **Every entry connects** by construction (the tree). **Every level is one
   component** by construction. **Path length is uncorrelated with surface
   distance** by the hashed entry placement, and a gate measures the
   correlation and refuses it if it creeps up.

## What it is made of

- Rooms: `roomTiles(seed, DEEP, floor, room)` as now, with the plan's
  archetype list per level's era and a `trunk` flag choosing the hall.
- Contents: `contentsOf` as now; density from the room's role.
- Foes: `foesOf` as now; the Deep's density row in `DENSITY`; Sentinels off
  the trunk.
- People: the Deep site gets its own actor pool per era, like any site. Its
  names are its own — which is exactly backlog 9, *Below, the Names Stop
  Working*, arriving for free: the deeper the stratum, the fewer of its people
  any surface reader can name.
- Provenance: `possessionsOf`, `troveIndex`, `leadOf` work on the Deep site
  unchanged. Foreign leads keep pointing at other mausoleums — and now the
  route to them exists: down your shaft, along the trunk, up theirs.

## Presentation

- HUD: `THE DEEP · level 2 · IMPERIAL · trunk` where it says site and floor.
- Atlas: `tools/atlas.html` draws each level's graph with the trunk bold and
  the entries labelled by the site they climb to — the whole-shape view the
  design asked for, and the tool that will find the next dead era row.
- The fade covers arrival, as it does for every floor.

## Gates

- every mausoleum's bottom floor has a way down, and the room it lands in has
  the way back up, on floor, reachable
- every level is one connected component; every entry is in it
- the trunk is a path between two entries, and every trunk room is a hall
- path length between entries is uncorrelated with the distance between their
  sites on the surface (correlation below 0.3 across 24 sites)
- climbing another mausoleum's shaft changes the site, and its Field has no camp
- the Lost Empire is walked: at level 4, `eraFor` names it, and its archetypes
  and its name pool appear (the atlas gate, back in service)
- a foreign lead's place is reachable: for every lead in a 24-site sweep, a
  path exists from the player's site to the lead's site through the Deep
- a long walk through the Deep grows the save by nothing
- replay holds across a site change; no float
- the room-crossing arithmetic uses the plan's width: a 3×2 floor and a 12×8
  level both cross correctly in all four directions

## Sequence

1. **`gw, gh` on the plan; `step()` reads them.** No visible change. One commit,
   first, because everything else is built on it.
2. **The Deep site, level 0, and the shafts.** One level, the tree, the loops,
   every mausoleum entering it. Walkable end to end. The MINOR that ships the
   Deep.
3. **The trunk and the hall archetype;** density and threat by role.
4. **Levels 1–4 and the shafts between them;** the Lost Empire walked.
5. **Cross-site surfacing:** other sites' Fields without the camp; the HUD;
   the atlas.
6. **Later, and separately:** collapsed shafts a cap clears (extraction points,
   discovered), barred gates opened from inside, the guild lift.

## Open questions

1. **How big is a level?** 12×8 is a guess. The design wants "an hour apart
   below" between neighbours above; at a room every few seconds that is a path
   of a few hundred rooms, which 96 cannot give. Either levels are larger, or
   the Deep spans several levels between entries, or an hour is a metaphor.
   A playtest number. Start at 12×8, measure, and let the atlas show it.
2. **Does the Deep have a Field above it anywhere?** No: it is reached only
   through mausoleums until the collapsed shafts exist.
3. **The Warden.** "Every region has at least one route that does not pass a
   Warden-class hazard" is a constraint on a foe that does not exist. Left to
   the Warden's own plan; the trunk is that route by construction.
4. **Saves.** A save in the Deep must restore there. `restore` already
   re-enters the room from the delta's address; nothing new, but gated.
