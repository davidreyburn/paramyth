# World Shape

*v0.1, 2026-09-22. The Barrowlands are sprawling: many ways down, many
mausoleums, many passages underneath.*

## The thesis

The Barrowlands are not a dungeon with a descent. They are a **field of mouths
over a connected underworld.**

Dozens of mausoleums stand open across the surface. Each drops into its own
shallow complex. Beneath all of them, the Barrow Deep is one continuous network
— so the complexes are not separate dungeons, they are entrances to the same
place. **You can go down at one mausoleum and come up at another**, and finding
out which ones connect is the central progression of the game.

That single structural fact does most of the design's work:

- It makes the world genuinely large without making it repetitive, because the
  interest is in the *graph*, not in the room count.
- It gives extraction runs a progression axis that isn't gear. Early, you enter
  at A and must walk back to A. Later, you know A and B connect, and you extract
  wherever is nearer. Eventually you know the network, and risk collapses.
- **Knowledge is the thing that reduces risk**, which is what the whole
  provenance design already argues. The map is the character sheet.

## The strata

| Stratum | Character | Act |
|---|---|---|
| **The Field** | Surface Barrowlands. Open, traversable, dotted with mausoleum mouths, salvage camps, bandit holds, broken monuments. Dangerous but survivable. The hub. *Built 2026-09-25 as floor −1: six rooms of generated open ground, the Company Camp authored as room 0, the mouth at least two rooms away, dogs but no salvage yet; see `plans/field-2026-09-25.md`.* | I |
| **The Mausoleums** | Dozens of shallow complexes, 3–10 rooms each. Distinct architecture per era and builder. Most players' whole early game. | I |
| **The Barrow Deep** | One connected network beneath every mausoleum. Collapsed halls, vaults, the Ransacked Archive. Where the graph becomes the game. | I–II |
| **The Frontier Halls** | Primeval caverns. Poison air — sealed plate required. Barrowburg as a deep settlement and second economy. | III |
| **The Fundament** | Twilight underworld country. Markkonia, black lakes, bone forests. | IV |
| **Vorathum's Domain** | Geography becomes anatomy. | IV+ |

Ship **Act I**: the Field, the Mausoleums, the upper Barrow Deep, plus Grimhaven,
Ashmark and the Company Camp. The rest are expansions that are already designed
in `~/dungeonworld` and gated by the campaign's own spoiler discipline.

## Depth is era

The one parameter that makes the world mean something. Provenance ages as you
descend:

- **Field and Mausoleums** — owners are recent. Salvagers who died last season,
  Aurelion's war dead from the Silent Isle, the Red Hand's own casualties.
- **Barrow Deep** — owners are imperial. Hero tombs, Archive records, the
  Temple of Ascension's sacramental gear.
- **Frontier Halls** — owners are the Lost Empire. Old Apostles, the war in the
  deep, Warden's Gate fortifications.
- **Fundament and below** — owners were **not people.**

The generator reads depth, so the world's whole historical arc comes free from
one input. It also means an item found shallow that carries a deep chain is
immediately, legibly *wrong* — which is how a mystery starts without anyone
writing one.

## Generation: anchors and tissue

**Authored anchors.** The named locations from the campaign are hand-placed with
authored character and fixed contents: Company Camp, Outer Mausoleum, Grimhaven,
Ashmark, Ransacked Archive, Temple of Ascension. These are the landmarks the
player navigates by, and they never move between worlds.

**Generated tissue.** Everything between them — mausoleum positions and
interiors, Deep passages, minor ruins, bandit holds, caches. Generated from
`(seed, address)` per the layer contract, never stored.

The split matters because a fully procedural world reads as noise. Anchors give
the player a mental map to hang generated space on; generated space makes the
anchors worth walking between twice.

### The law this generator must obey

> A procedural world tiles along any axis its generator cannot see.

This is the reading-room column bug from library-of-babel, restated. There,
`cellType` was a function of `(q, r)` and could not see the floor, so every
reading room stood in a column running the Library's full height — correct at
every single address and structurally absurd. Nobody could see it from inside.
The atlas showed it in one glance.

Concretely, for this world:

- A mausoleum generator that is `f(x, y)` produces the same mausoleum at every
  depth. It must see **depth**.
- A room generator that cannot see its **region** produces Fundament rooms in the
  Outer Mausoleum.
- A loot generator that cannot see the site's **era** produces recent salvage in
  an imperial tomb, which destroys the depth-is-era gradient the whole world
  rests on.

And the corollary, which is a build item rather than a rule: **an atlas view is
not a luxury.** A whole-shape debug renderer — the region graph, the Deep
network, mausoleum connectivity, colored by era — is the only thing that catches
this class of bug, and it earned its keep immediately the last time it was
built.

## The Deep as a graph

The Barrow Deep is generated as a connected graph, not a set of rooms that
happen to touch.

**Hard constraints:**
- Every mausoleum bottom connects to the network. No orphans.
- The network is connected: any two entrances have a path between them.
- Path lengths vary widely and are *not* correlated with surface distance. Two
  mausoleums a minute apart on the surface may be an hour apart below, and two
  at opposite ends of the Field may share a wall. This is what makes the map
  worth learning rather than deducible.
- Every region has at least one route that does not pass a Warden-class hazard,
  though it may be much longer.

**Soft structure:**
- **Trunk passages** — long, obvious, relatively safe, heavily travelled, and
  therefore heavily scavenged already. Fast, poor.
- **Capillaries** — narrow, winding, unmapped, dense with untouched cargo.
  Slow, rich, dangerous.

That contrast is the route-choice decision on every run, and it maps directly
onto the encumbrance tiers: the trunk is where an overloaded scrapper can still
move.

## Shortcuts and extraction

Extraction points are **discovered, not given.** Each one found permanently
reduces the risk of a whole region, which is the game's most durable reward and
costs nothing to store.

| Kind | How found |
|---|---|
| Mausoleum mouth | Walked to on the surface |
| Barred gate | Opened from the inside only — the classic Souls shortcut |
| Collapsed shaft | Cleared with a blasting charge |
| Grate or well | Climbed with the grapnel |
| Guild lift | Bought with scrap, at a real price |

The Guild lift is the economy's top-end sink: pay enough and the Delver's Guild
installs a hoist that turns a two-hour haul into a two-minute one. That is what
scrap is *for* at scale, and it means wealth converts directly into safety
rather than into numbers.

## Persistence and cost

The world is a function; the delta records only what play changed.

| Recorded | Not recorded |
|---|---|
| Sites entered, rooms mapped | Room layouts (recomputed) |
| Items taken, containers opened | Items not taken |
| Shortcuts opened, gates unbarred | The geometry either side of them |
| Corpses, yours and others' | Enemies not yet fought |
| Chalk marks | Anything you walked past |

A player who explores for ten hours and takes nothing grows the save by
approximately nothing. That is the storage invariant from the layer contract,
and it is what makes "sprawling" affordable.

## Obstruction is content

**Not everything is meant to be reachable** (DJ, 2026-09-22). Tools for breaking
boulders and driving tunnels are coming, so a chamber walled off by a collapse
is not a generator fault — it is somewhere to come back for, with the right kit
and the bulk to spare for it. The same goes for a pot you cannot squeeze past
and a vault with no door.

That draws a hard line through what the generator must guarantee:

| Must always hold | Why |
|---|---|
| Every doorway is reachable from inside the room | A sealed exit strands a player, and nothing in the game can yet undo it |
| Every stair is reachable | Same — a floor with no way off it is a soft-lock |
| The player never spawns inside a sealed pocket | Same |

| Deliberately NOT guaranteed | Why |
|---|---|
| Loot is reachable | Salvage behind an obstruction is a reason to return |
| All floor is reachable | Sealed space is where mining pays |
| Solid objects never block anything | Shifting or breaking them is a verb the game will have |

Both halves are gated: the first as hard assertions, the second as **measurements
with loose bounds** — currently ~0.2% of loot and ~0.6% of floor sit behind
something — so the numbers cannot drift unnoticed while staying design decisions
rather than bugs. When the mining tools land, the second table's bounds are the
dial that says how much of the world they open.

## Open questions

1. **How many mausoleums in Act I?** Enough that memorizing them takes real
   time. My instinct is 30–50 mouths over 3–8 rooms each, but this is a
   playtest number, not a design number.
2. **Does the Field have weather or a clock?** Both are cheap and both add
   texture; both also add state. Probably a day/night cycle affecting surface
   encounters only, with the Deep timeless — which is itself the right horror.
3. **Are mausoleum interiors stable across worlds?** Same seed, yes. Across
   seeds, everything but the authored anchors should move, or community
   knowledge trivializes the map.
4. **Surface danger level.** The Field has to be survivable enough to be a hub
   and dangerous enough that returning laden is not free. Currently unspecified.
5. **Does the Deep network change?** Collapses, floods, the Warden sealing
   routes permanently. Tempting, and it fights directly against the
   knowledge-is-progression thesis. Parked, not rejected.
