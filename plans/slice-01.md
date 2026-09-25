# Slice 01 — Is triage fun?

*v0.1, 2026-09-22. One camp, one mausoleum, forty item kinds. The smallest build
that can answer the only question that matters right now.*

## The question

> **Standing in a dark room with a finite bulk budget and a pile of objects whose
> value is hidden — is deciding what to carry out fun?**

Everything else in the design is downstream of yes. If it is no, the fixes are
cheap at this size and catastrophic later. Nothing goes in this slice that does
not serve answering it.

## In

**World**
- Company Camp — quartermaster, stash, appraiser, exit to the mausoleum
- The Outer Mausoleum — one generated complex, 8–12 rooms, one entrance
- Extraction = walk back to the entrance you came in

**Items**
- ~40 kinds across 5 material classes
- Full computed chains, 2–4 events, Act I actor pool
- Marks rendered on sprites: maker's mark, wear, staining, grave-dirt,
  repair, heraldry, effacement
- Fragility, bulk, condition

**Provenance**
- `chain()`, `actor()`, `marksOf()` — the computed tier only
- `possessionsOf()` and one guaranteed-solvable actor per run, so the deduction
  loop gets tested once per session
- Amendment table exists and is **empty** — the schema ships, nothing writes to
  it but `inherit`

**Stats** — two only: **Might** (bulk budget) and **Insight** (mark visibility).
The others are stubs returning a constant. Two stats is enough to prove the
perception gating; six is enough to slow the slice down.

**Loop**
- Bulk budget, three encumbrance tiers, drop-load button
- Appraiser: pay a fee, wait a day, learn one item's record
- Quartermaster: buys anything by weight, badly
- Finite stash
- Death → drop everything → corpse at an address → recover with backup kit

**Combat** — deliberately thin. Attack, dodge, guard. Two enemies:
**Rot-Touched Dog** (fast, packs, punishes the laden) and **Barrowlands Ghoul**
(swarms, grabs cargo). Three tools on direct binds: **prybar**, **lantern**,
**chalk**. Enough to threaten a haul. Not a combat showcase.

**Presentation** — 640×360, integer ×3. Near-black palette, lantern cone,
AMOLED-first. Placeholder art is fine; **mark rendering is not placeholder** —
it is the thing under test.

## Out

Named so they don't creep in: amendments beyond `inherit` · forgery ·
effacement as a player verb · language deciphering · multiple buyers and
factions · the Barrow Deep network · multiple mausoleums · shortcuts and lifts ·
armor classes beyond leathers · corruption · injuries · the remaining four stats
· the remaining five tools · six of the eight enemies · LAN · sound beyond
footsteps and one sting.

**The second buyer is the sharpest temptation and stays out.** Price-varies-by-
buyer is slice 2's question. Slice 1's question is whether *identify or scrap*
is interesting with one buyer and one appraiser, and adding a second buyer makes
a failure of the core verb look like a success of the economy.

## Build order

**Phase 1 — kernel.** L0 address algebra, L3 delta, `apply`, the fixed-timestep
tick, frame log. One hardcoded room, a character that walks. *Done when:* a
frame log replays to an identical delta.

**Phase 2 — world.** Mausoleum generation reading depth and region. Rooms,
doors, containers. The atlas debug view — built here, not later, because it is
what catches a generator blind to a dimension. *Done when:* the atlas shows
varied structure across seeds and across depth, with no tiling along any axis.

**Phase 3 — items and marks.** L1 items, L2 chains, mark derivation, part-based
sprite composition, bulk and encumbrance. *Done when:* two items from different
eras are distinguishable at a glance, before identification.

**Phase 4 — the loop.** Appraiser, quartermaster, stash, extraction, sell.
*Done when:* a full run completes and the player has spent money on a question.

**Phase 5 — threat.** Two enemies, three tools, damage, fragility, grabs, death,
corpse, recovery. *Done when:* a player has used the drop-load button on purpose.

Phases 1–3 are the risky ones. Phase 4 is where the question gets answered.

## Gates

Following `check.sh` discipline — all must pass before the slice is called done.

| Gate | Asserts |
|---|---|
| `replay` | seed + frame log → identical delta, same build and device |
| `purity` | `world(address)` recomputes identically across processes |
| `layers` | no import from a layer to a higher one; no L4↔L4 edge |
| `deletable` | build with `systems/combat/` removed boots, walks, loots, sells |
| `coverage` | every act verb and every mark type fires across the fuzz corpus |
| `solvable` | sampled runs contain ≥1 actor whose possessions are all reachable |
| `storage` | a 10-minute session that takes nothing grows the save by ~0 |
| `constants` | paired constants bound by assertions (stride/count class of bug) |
| `perf` | sustained 60 Hz on device, and a battery figure for a 30-minute run |

The `deletable` and `layers` gates matter more than they look. They are cheap
now and they are the only thing that keeps the contract from being aspirational
once there are twelve systems.

## How the question gets answered

Not by opinion. Put it in front of players and watch four things:

1. **Do they carry marked junk?** If no, the tells are too weak or bulk is too
   tight. If they carry *everything* marked, marks are too common.
2. **Do they pay the appraiser more than once?** If not, the fee is wrong or the
   payoff is invisible.
3. **Do they ever leave something behind reluctantly?** The reluctance is the
   product. No reluctance means bulk is too generous.
4. **Do they talk about a specific object afterwards?** This is the real test. If
   nobody says "that ring with the filed-off mark," provenance is decoration.

If triage is not fun, the dials in order: **bulk budget** (base 20 is a guess and
should be tuned first), **mark visibility at low Insight**, **appraisal fee**, then
**price variance between known and unknown items**. Card changes only after the
dials — the same discipline as the TCG's "balance dials before card surgery."

## What slice 2 asks

Assuming yes: **does provenance change what you do, not just what you earn?** That
means the second buyer, effacement as a player verb, and the first amendments —
the point at which record and truth can disagree and a seam can exist. It is the
better game and it is unanswerable until this one lands.
