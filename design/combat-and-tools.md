# Combat and Tools

*v0.2, 2026-09-22. Settled: top-down 2D at 640×360, physical controls first,
extraction runs, full drop on death with a recoverable corpse, RPG stats and
armor.*

## What combat is for

Combat is not the game, but it is a real system with real depth. Its job is to
make the haul decision hurt. Three rules sit above the stat block:

1. **Encounters are rare, and most are avoidable.** A Broken Sentinel is a route
   hazard you learn to walk around, not a boss you must defeat. The player who
   fights nothing and comes out heavy has played well.
2. **The looting verb makes the noise.** Prying a lid, breaking a seal, dropping
   a load, sprinting in mail — each is loud. Encounters are downstream of what
   the player chose to take, so the game punishes exactly the thing it rewards
   and never needs a spawn timer to stay tense.
3. **Threat is denominated in cargo as well as health.** Hits break fragile
   goods. Grabs make you drop. Death costs the run and leaves a corpse. A fight
   won badly still hurts, so fleeing is often correct and always available.

## Stats

Six. Every one of them touches the salvage loop, which is the test a stat has to
pass to exist — a stat that only matters in a fight is a stat this game does not
need.

| Stat | Combat | Loop |
|---|---|---|
| **Might** | Heavy-weapon damage, stagger, shield stability | **Raises the bulk budget.** Forces lids, doors, sealed vaults |
| **Swift** | Attack speed, dodge frames, light weapons | Traps, locks, pickpocketing bandits |
| **Vigor** | Health, stamina, bleed resistance | Corruption resistance, encumbrance tolerance |
| **Lore** | Ritual tools, wards, rot-banes | **Reads scripts and inscriptions unaided** |
| **Insight** | Reads enemy tells, spots ambush | **Sees maker's marks, wear, grave-dirt — provenance without an appraiser** |
| **Charm** | How the dead react; sacred tools | Haggling, faction standing, talking a Pilgrim down |

The structural point: **Lore, Insight and Charm feed `viewFor`.** They don't add
damage, they add *visibility* — a high-Insight scrapper and a high-Might one pick
up the same buckle and read different amounts of it. That's the build-gated
provenance design expressed as a stat block rather than bolted on beside one.
And Might raising the bulk budget is what keeps a combat stat honest: the
strongest character is also the best hauler, so investment is never purely
martial.

## Armor, and the one budget

Armor reduces damage. It also costs bulk, makes noise, and wears out.

| Class | Armor | Bulk | Noise | Notes |
|---|---|---|---|---|
| Rags | 0 | 0 | silent | |
| Scavenged leathers | 1 | 2 | quiet | The starting rig |
| Salvaged mail | 2 | 4 | audible | |
| Delver's plate | 3 | 7 | loud | Sealed against poison air — required below |
| *Old Empire plate* | 4 | 6 | loud | Found, never bought. Carries a chain |

**Armor, tools and haul draw from one bulk budget.** That is the whole
integration and it is worth stating plainly: every point of armor is a relic you
cannot carry out. A Stone Knight build survives the Deep and comes back poor; a
light build comes back rich or not at all. Neither is correct, and the player
re-decides every single run.

Encumbrance tiers read off that same meter:

| Tier | Speed | Dodge | Noise |
|---|---|---|---|
| Light | full | full roll | quiet |
| Laden | −20% | roll costs double stamina | audible |
| Overloaded | −45% | no roll | loud, constant |

Armor has **condition**. It degrades with hits, repair is a scrap sink, and
degraded armor is both weaker and louder. Found armor carries provenance — a
dead knight's plate has a chain, and wearing it in front of the wrong faction is
a statement.

**Dedicated drop-load action.** Hold one button to abandon everything you are
hauling in about a second. It is the best button in the game: the first time a
player uses it deliberately, to survive, is the moment the design lands. The
dropped load stays where it fell.

## Light, hands, and the sacred exception

Ordinary light costs a hand. That is the cheapest tension in a dungeon game and
it should be felt from the first minute.

| Configuration | Light | Guard | Damage | Notes |
|---|---|---|---|---|
| One-hand + shield | — | yes | low | Blind but safe |
| One-hand + lantern | yes | — | low | The default delver rig |
| Two-handed weapon | — | — | high | Blind, and committed |
| Helm-lamp + two-hander | poor | — | high | Narrow cone, costs bulk, worse than a lantern |
| **Sacred lantern / sacred arms** | **yes** | **yes** | **high** | Sun Priest. Collapses the tradeoff entirely |

The sacred gear is the point. Orgos's cinder carried in a consecrated lantern —
and the consecrated weapons that go with it — give light *and* fight, and they
**burn rot-flesh** on contact, which no ordinary weapon does. They are rare,
expensive, faction-gated through the Sun Priest tradition, and they are the
clearest progression goal in the game.

What the player is working toward is not more damage. It is **not having to
choose.** That reads as a mechanical reward and as theology at the same time,
which is the best kind of item in a setting like this one.

## Tools: one kit, two grammars

Every tool is a verb in two grammars — combat and traversal. That is what makes
new tools content rather than systems, and why eight is a complete kit rather
than a starting set. Tools cost bulk, so the loadout is a bet placed before you
know what is down there.

| Tool | Combat | Traversal / salvage | Bulk |
|---|---|---|---|
| **Prybar** | Slow heavy swing, staggers | Opens sealed lids and doors; wedges a door shut behind you | 2 |
| **Grapnel & line** | Yanks an enemy off balance or off a ledge | Crosses chasms, descends shafts, retrieves cargo across gaps | 3 |
| **Delver's lantern** | Burns rot-flesh weakly; reveals Shade Beings | Light; makes inscriptions legible. Occupies a hand | 2 |
| **Blasting Cap** (B.Cap) | Area damage and a heavy shove; the panic button. *Built: set one tile ahead, 45-tick fuse, a 56px square that lingers 10 ticks, 8 damage, knock 48 — moves a Sentinel; 4 to you if you stand there* | Breaks rubble to floor. Walls and sealed doors want a heavier tool | 2 ea. |
| **Hand-bell** | Repels the dead briefly | Lures a patrol off your route entirely | 1 |
| **Ward chalk** | Draws a line the dead will not cross | Marks your path — the mapping tool | 1 ea. |
| **Net** | Immobilizes one enemy | A sling: haul one object heavier than your limit | 2 |
| **Probe-pole** | Weak attack at reach, no counter | Springs traps at distance, tests floors, fishes cargo from water | 2 |

The **net** deserves its note: a combat tool that directly raises carrying
capacity. The two categories are not adjacent here, they are the same category.

Consumables (caps, chalk) are the scrap sink at the low end, before depth
permits take over at the high end.

## Damage and the body

Health is legible and small — a bar of a dozen or so points, no field
regeneration, healing scarce enough to be a decision. On top of it:

- **Fragility.** Each item carries a fragility value. Taking a hit rolls against
  the most fragile thing you carry. Glass, ceramic, sealed reliquaries and
  anything bearing an inscription are the vulnerable classes — the cargo most
  worth money is the cargo most easily destroyed.
- **Grabs.** Ghouls and Appendages grab rather than strike. A grab costs you a
  random item off the top of the load, which they carry off. Provenance
  survives; the item moves. Recoverable if you can catch the thing.
- **Corruption.** Rot-touched enemies apply a slow counter, not damage. It does
  not kill you in the field — it costs money to clear in camp. Corruption is a
  tax paid in scrap, which puts it in the economy rather than in the health bar.
- **Bleed and breaks.** Lasting injuries that persist past the run and want a
  physician. This is where Vigor pays off and where the Prosthetic-clinic idea
  eventually layers in.

## Enemies — Act I

Eight. Each has one idea and a clear counter, and six of the eight can be
avoided entirely by a player paying attention.

| Enemy | Idea | Counter |
|---|---|---|
| **Rot-Touched Dog** | Fast, packs, ruptures on death and sprays corruption | Kill at reach, or at a doorway |
| **Barrowlands Ghoul** | Swarms; preferentially grabs the laden and the wounded | Be light, or be behind chalk |
| **Red Hand Bandit** | Tactical, ranged, breaks when the leader falls — and loots corpses | Take the leader, or pay them |
| **Broken Sentinel** | Enormous damage, slow, blocks a route rather than chasing. *Built (0.7.x): stirs at 3 tiles, walks at 120, strikes from 28px after a 24-tick wind-up, weight 6 — only a heavy impact weapon moves it* | Walk around it. Almost always the answer |
| **Infected Appendage** | Small, erratic, fouls cargo | Probe-pole, or ignore |
| **Rot-Touched Pilgrim** | Intelligent, infects by touch, and talks to you | Charm. Dialogue is a real option |
| **War Child** | Silent, fast, terrifying; rarely fought and never fairly | Light and distance. Do not fight this |
| **Barrow Warden** | Seals passages, calls Sentinels; the Act I wall | Not a fight — a route problem |

The Warden closing a passage behind a laden player, with the way home now longer
than the way down, is the encounter the whole system exists to produce.

## Death and the corpse run

Everything drops, including armor and tools. The corpse persists as a delta
entry at an address — a handful of bytes.

- **You recover with your backup kit** from the camp stash, so the recovery run
  is played with a worse loadout than the one that killed you. Forced variety
  nobody had to design.
- **Keep a backup prybar in the stash, always.** The game says this once,
  in-fiction, from a veteran at the camp, and never again.
- **Corpses attract.** Red Hand bandits loot them. A corpse left long enough is a
  corpse someone else is carrying, and where it went is discoverable. A timer
  with a story attached rather than a countdown on the HUD.
- **Your corpse writes provenance.** Items you died holding gain an entry naming
  you. Unrecovered, they carry your name down-world forever, and an appraiser
  will one day read it back to you.

## Controls and render target

**Render target: 640×360, integer-scaled.** ×3 on the Retroid Pocket 6
(5.5″ 1920×1080 AMOLED, 120 Hz, 400 ppi) and on any 1080p desktop; ×6 at 4K. No
fractional scaling on any target surface.

Two consequences worth designing to. The panel is **AMOLED**, so build the
palette around true black rather than gray-black — a lantern cone against an
unlit corridor will look extraordinary, and unlit pixels draw no power. And the
**Snapdragon 8 Gen 2** is far beyond what 2D at this resolution needs, so the
constraint is battery, not frame time: simulate at a fixed 60 Hz, offer 120 Hz
rendering with interpolation as an option, default it off.

Input normalizes to a canonical frame at L5 — keyboard, gamepad and virtual
stick all reduce to the same verb set, and the simulation never sees a device
event. Gamepad is the reference binding.

| Verb | Gamepad | Keyboard |
|---|---|---|
| Move (8-dir) | Left stick / D-pad | WASD |
| Attack | X | J / LMB |
| Use quick tool | Y | K / RMB |
| Interact · loot · pry | A | E |
| Dodge roll | B | Space |
| Guard | R | Shift |
| Tool radial | L (hold — slows, does not pause) | 1–8 direct bind |
| Sprint | L3 (loud) | Ctrl |
| **Open pack** | **Start** | **I** |
| **Drop load** | Hold Back | Hold G |
| Map | Select (tap) | Tab |
| **Back / close a screen** | B | **Esc** (or Backspace) |

`CANCEL` is its own verb rather than an alias for dodge: sharing that bit would
make Escape roll the player across the room. On a gamepad the same physical
button carries both, and the sim reads whichever one the context wants.

The radial **slows time rather than pausing** it — switching tools under pressure
must cost something. Keyboard gets direct 1–8 binds, making desktop strictly
faster at swapping; acceptable, not worth equalizing.

## Where this sits in the layer contract

- **L3** gains space: position, velocity, bodies, health, stamina, condition, the
  noise field, corpses.
- **L4** gains three siblings that never read each other — `combat` (resolution),
  `tools` (one sub-module per tool), `encounters` (spawning, AI, noise response).
- **Deletability holds.** Remove `systems/combat/` and the result is a peaceful
  salvage game that still boots, walks, loots, hauls and sells. The test passes,
  and it is also an accessibility mode worth shipping deliberately.

## Open questions

1. **Stamina as a second meter.** Dodge and guard want a cost, but a stamina bar
   competes with bulk for the player's attention. Worth trying the version where
   dodge costs nothing and is simply unavailable when laden.
2. **Does the prybar stay the default weapon?** Thematically perfect, possibly
   mechanically thin. A found sword with real provenance is the obvious upgrade
   path, which argues the prybar should stay deliberately mediocre.
3. **Enemy provenance.** A Red Hand bandit carries goods with chains. Does
   reading them reveal where the camp is? That is `encounters` reading L2, which
   is legal — and probably the best quest generator in the design.
4. **Corruption clear-cost curve.** Cheap and it is ignorable; expensive and it
   crowds out depth permits as the dominant sink. Needs numbers, numbers need the
   slice.
5. **How much does armor gate depth?** Poison air below the Frontier Halls
   requires sealed plate, which is a hard bulk floor on deep runs. That may be
   exactly the right pressure or may flatten build variety at depth.
