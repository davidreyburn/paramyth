# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0, so the surface is unstable: MINOR covers new systems and world-shape
changes, PATCH covers fixes and tuning. **1.0.0 is a shippable game — Act I
entire.** See `plans/roadmap.md`.

## [Unreleased]

## [0.5.0] — 2026-09-22

Something down there wants you dead, and your haul is what it costs you.

### Added

- **`systems/combat/` — the first L4 system this project has ever had.** It is a
  pure function: `combat(s, frame) → actions[]`. It reads L0–L3, reads no other
  system, and writes nothing. `apply` folds the actions in, because apply is the
  only writer in the program. A gate asserts the state hash is unchanged across a
  call, which is the difference between the layer contract being architecture and
  being an assertion.
- **The Rot-Touched Dog.** Asleep until you come within five tiles, then pursuit.
  A roster is a pure function of a room's address, exactly like the contents
  lying in it; the delta records only which ones you killed. About a quarter of
  rooms hold one, rising with depth, none in camp.
- **The swing** — windup 6 ticks, active 6, recovery 10, one hit per foe per
  swing, and a hitbox derived from `facing` alone so it is strictly in front.
  You keep 40% of your speed through it: committed, not frozen.
- **The sword is an item.** Bulk 3, a value, a fragility, and — because its key
  is its address — a real provenance chain. There is no equip slot: you swing
  with the best blade in your pack, so arming yourself is paid for out of the
  haul on every single run. You start carrying one, because it is dangerous out
  there.
- **Health**, twelve points, no field regeneration, drawn as pips over the world
  rather than in the HUD strip, which holds four lines and is full.
- **Death.** Everything drops where you fell — the blade too — and you wake in
  camp with the stash intact. It reuses the `dropped` list built in 0.4.0 for
  container transfer, exactly as `design/world-shape.md` said it would.
- `sim/space.js` — collision and movement, extracted so a foe can walk around
  the same barrels the player does without a system reaching back into `step.js`.

### Changed

- **Encumbrance finally reaches the movement path.** `tier()` has existed since
  0.2.0 and changed *nothing*: the speed table in
  `design/combat-and-tools.md` was never implemented. Light is full speed, laden
  −20%, overloaded −45%. This is the whole slice: a dog at speed 170 against a
  player at 192 / 154 / 106 means **light you outrun it, laden you do not**. The
  dog is not a damage problem, it is a cargo problem, and the drop-load button is
  the answer.
- **Drop-load no longer disarms you.** It jettisons cargo and leaves the blade:
  the button exists so you can survive, and dropping your only weapon while a dog
  runs you down is the opposite of surviving. Death still takes everything.
- A hit rolls against the most fragile thing you carry, and a break **destroys**
  it — it does not reach the floor. Tuned to one-in-eight for an urn; at the
  first-drafted rate it was two hits in five, which made the cargo worth carrying
  impossible to bring home.

### Gates

- **`deletable`, proven by deletion.** `systems/` removed from disk: the game
  boots, walks, values a haul, renders, and every non-combat gate passes.
- **`layers`, greppable and gripped.** Nothing in `core/` or `sim/` may import
  from `systems/`. The system list lives in `app/main.js`, which is wiring — so
  `step(s, frame)` with no list is a complete peaceful game and the dangerous one
  is a single line of wiring.
- Replay holds with things alive and moving; no float enters a foe position; a
  long walk that kills nothing grows the save by nothing.


### Added

- `plans/backlog.md` — thirteen unscheduled ideas, with DJ's verdict recorded
  against each. It schedules nothing; the roadmap remains the only document that
  does. Ten of the thirteen are perception or record features rather than
  content features, which is the layer contract paying out: each one reads
  downward, writes a few bytes, and deletes cleanly.

### Fixed

- **Stairs drew as a solid block pasted over the floor.** They were already
  declared as an overlay on FLOOR, but the art is 400/400 opaque, so the base
  could never show. The real cause was `shade`: stairs rendered at **1.0**, the
  *wall's* value, while FLOOR renders at 0.42. A walkable tile was being lit
  like masonry. Both stairs now sit at the floor's value, which also lets the
  artist's own dither band — the bottom edge that fades a stair into the floor —
  do the job it was drawn for.
- **Brightness now means something.** Dark is what you walk on (floor, stairs);
  light is stone standing up (wall, sarcophagi). That is what the manifest's
  `_shade` note always claimed and what the stairs were quietly contradicting.
- **`SARC` claimed a base it covered completely.** Five opaque cells declaring
  `base: FLOOR`, so every sarcophagus paid for a floor draw nobody could see.
  It is a full-bleed tile, declared as one now. No pixel changes.
- **Pots were showing up as crates.** The `pot` kind was renamed to `crate` on
  2026-09-22 on the belief that the sprite at decor 3,4 was a crate. It is a
  round-bellied pot, and there is no crate on either sheet — so for a release
  every crate in the game was drawn as a pot, with a gate holding the mistake in
  place. The kind is `pot` again, the word follows the picture, and it picked up
  the second pot at decor 2,5 that nothing was using.

### Added

- A gate asserting **every overlay lets its base show through**. Art with no
  transparent pixel covers its base completely, so the base is a wasted draw and
  a false claim — it found `SARC` the moment it was written.
- A gate binding **walkable tiles to the floor's value** and keeping the wall
  above it. These are paired constants and nothing held them together.
- A gate binding item kinds to item art in both directions. A kind with no art
  falls back to a flat rectangle and art with no kind can never be drawn, and
  neither raises an error — which is how a rename touched one and not the other.

## [0.4.0] — 2026-09-22

The actor graph inverts. An object tells you where to go, and the place is
stocked when you get there.

### Added

- **Actors are addresses.** An actor id decomposes into site, era and index, so
  the relation *chains name actors* runs backwards. In 0.3.0 an actor was a hash
  of whatever object happened to name them, which could not be inverted at all.
- **Rooms have occupants** — one per era, so a crypt can hold an imperial lord
  and, above him, the scavenger who died robbing it. Half the hands that touched
  a thing are the hands it was buried with, which is what makes a room a grave
  rather than a shelf.
- **`possessionsOf`**, at last. Everything in a person's own site that names
  them, computed by a bounded scan and cached in memory — never in the save.
- **Places.** `interred`, `hid` and `buried-with` name a real room address,
  found by asking where that person lies rather than by hashing a plausible
  one. A lead cannot point at a room that is not there.
- **Leads.** A legible mark names a person, that person lies somewhere, and the
  somewhere is on the HUD next to where you are standing. Perception gates it:
  an untrained eye follows nothing, and the appraiser's fee now buys a
  direction as well as a price.
- **Guaranteed solvability.** One room per floor draws its occupant from the
  resolved range, and no chain anywhere else may name a resolved actor. So every
  region contains at least one person whose entire story is inside it — the
  constraint from `design/provenance.md`, as arithmetic instead of as a hope.
  The `solvable` gate from `plans/slice-01.md` now exists and holds over 40
  regions.
- **The dropped list.** Things you put down land on a real tile and stay there,
  keeping their own address — so their history follows them, and picking one up
  again is picking up *that* object. This is the `dropped` list the corpse run
  will need, built once.
- **Two-way transfer everywhere.** The pack screen and the container screen both
  put things down, one at a time or all at once.

### Changed

- **Drop-load no longer destroys the haul.** It lands at your feet and is still
  there when whatever you ran from is dealt with — a decision rather than a
  penalty.
- Container contents show their own provenance. The panel was handed bare kinds
  and had no address to read a history off.
- Era 0 gained `hid`, so the surface can name a place at all. Its leads are
  meagre next to what lies under them, which is right.
- The HUD is four lines and says so. A fifth fitted in the array and not on the
  screen: it drew below the canvas, where the bottom-edge gate could not see it
  because it was not clipped, it was gone. The two constants are now bound by an
  assertion.

### Fixed

- **Picking a loose item off the floor pushed a bare kind into the pack** where
  everything else is a reference. Its key was `undefined`, so its chain, its
  price and its history were all lost, and hashing the state threw. Only items
  taken out of containers were whole.

### Known

- Still no **amendments**: record equals truth, and forgery has nowhere to live.
- A **foreign** name leads to a site that generates but that nothing yet walks
  to. Those are the long threads, and they stay dead ends until the Field has
  more than one mouth.
- Bearing still does nothing. The player still has no record of their own.

## [0.3.0] — 2026-09-22

Provenance becomes visible. What a thing is worth depends on whose it was.

### Added

- **Chains.** Every item's history is a pure function of its address — acts,
  eras and the people who handled it — computed, never stored. Depth is age: a
  surface buckle has three events, a relic from the imperial strata has nine,
  and the oldest is always its making.
- **Actors**, named by era. Recent things name salvagers; deeper things name
  houses and offices; below that the names stop working.
- **Marks.** Each act leaves physical evidence or none — a maker's mark, grip
  polish, notching, grave-dirt, a scoured panel. Three acts leave no trace at
  all, which is what makes a forgery possible later.
- **Perception.** Keen is the eye, Lore the education, and neither substitutes
  for the other. A Worker starts able to see *that* a thing is marked and not to
  read what the marks say.
- **Worth.** A chain multiplies base value, and can cut it: defacement and
  clumsy repair make a thing worth less than the material. About 2% of chains
  lose money, so paying to read one can be bad news.
- **The appraiser**, in camp. Six scrap reads one item's record. Worth it for a
  relic, a loss on a trinket — which is the decision.
- **Items have identity.** What you carry is a reference — a kind plus the
  address its history comes from — not a bare kind.

### Known

- Only the first of the design's three tiers exists. There are no **amendments**,
  so record always equals truth: no forgery, attestation or effacement yet.
- The **actor graph does not invert**. `possessionsOf` is unbuilt, so a maker's
  mark cannot yet lead you to a trove.
- Bearing does nothing. The player has no record of their own.

## [0.2.0] — 2026-09-22

The loop closes. You can carry salvage out and be paid for it.

### Added

- **The Company Camp** — the first *authored* place, one level above every
  mausoleum, reached by climbing out. Hand-laid rather than generated, which
  builds the anchors-and-tissue split `design/world-shape.md` specified.
- **Base value.** Every portable kind is worth scrap. Value per bulk is the
  decision the loop is made of: a gem is worth twelve times a rib by weight.
- **The quartermaster.** Sell a haul by weight; the toast names the price before
  you commit to it.
- **The stash**, with **two-way transfer** — pack to stash and back, one at a
  time or all at once. Finite at 24 slots, so camp triage is a real decision.
- **A way out.** Floor 0 always has an up-stair now; descending and climbing out
  both land you on the stair that answers the one you took.
- `core/grid.js` — the tile vocabulary, shared so authored places and generated
  rooms need not import each other.

### Changed

- The game starts in the camp, as the campaign itself does.
- Station art is placeholder borrowed from decor; there are no NPCs on the sheet.

## [0.1.0] — 2026-09-22

First playable slice: a generated mausoleum you can walk, light, and rob.

### Added

- **Kernel.** Fixed 60 Hz tick, `apply` as the single mutation chokepoint, and a
  frame log — seed plus inputs reproduces the state exactly. Positions are
  integers in 1/256-pixel units, so no float enters the simulation path.
- **World.** Mausoleums as pure functions of their address: floor plans, room
  graphs, nine-sliced walls with inner corners, linked stair shafts. Era advances
  with absolute depth.
- **Items.** Chests, crates, barrels and urns to open; keys, gems, crystals,
  trinkets and bones to carry; tables and chairs to walk around. Bulk budget with
  three encumbrance tiers.
- **Interaction.** One button and a one-line toast — "Open chest", "Pick up gem",
  "Descend". Container and pack screens as pixel grids, cursor-driven, with
  take-one and take-all.
- **Art layer.** Swappable tile packs; two-colour remapping so each stratum has
  its own stone. Palette derived from the Barrowlands TCG tokens, re-anchored for
  an emissive dark screen.
- **Lighting.** Three hard bands at quarter resolution with a tick-derived
  flicker; beyond the lamp is void, not dim.
- **Tools.** Atlas, tile mapper, contact sheet, page checks, and `check.sh`.
- 121 headless gates and 34 in the browser.

### Known

- `NICHE` borrows the grate; there is no niche art on either sheet.
- Rubble blocks its whole tile while the art covers about 64% of it.
- Container transfer is one-way; putting things back wants the `dropped` list
  the corpse mechanic will need.
- Most of the tile sheet is unused: four wall sets, two ornate floor sets, and
  the elaborate architecture block.

[Unreleased]: https://github.com/davidreyburn/paramyth/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/davidreyburn/paramyth/releases/tag/v0.1.0
