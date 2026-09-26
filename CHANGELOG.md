# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0, so the surface is unstable: MINOR covers new systems and world-shape
changes, PATCH covers fixes and tuning. **1.0.0 is a shippable game — Act I
entire.** See `plans/roadmap.md`.

## [Unreleased]

### Added

- **The dodge roll** (`plans/dodge-roll.md`). B / Space: a roll along the held
  direction, diagonals included, about a tile and three quarters, front-loaded
  from an integer table; with nothing held, a short backstep opposite facing.
  Invulnerable for the first 14 of 20 ticks — to the bite, the blow, *and the
  blast*, through one predicate — then a recovery tail: still moving, cannot
  act, can be hit. Committed: no steering, no acting, presses ignored not
  buffered; it may cancel a swing's recover and nothing else of it; 10 ticks
  of cooldown. Walls and dogs stop it. Load, per the design and without a
  stamina meter: laden rolls three quarters with the same i-frame count;
  overloaded backsteps instead and says “Too heavy to roll”. A blast does not
  spend its hit on an invulnerable player: roll through and you are clear;
  roll in and stop and it hurts when the frames end. On the glass: a lean
  during the frames, upright in recovery (the tell), two dithered afterimages
  and a few hashed flecks, all from the delta. Twenty-six gates.
- `steer()` on a unit vector did not normalise (the integer octagonal norm
  rounds 0.41 to 0 for inputs of 1): callers scale first. Found by the
  diagonal-roll gate; the machine's steers already passed scaled vectors.
- **Your remains.** Death no longer scatters what you held across the floor: it
  leaves ONE container where you fell, holding everything, pack and row, as
  pale-lichen bones under a faint verdigris aura that breathes with the tick
  (a Bayer-dithered disc: no gradient, no clock). It opens like a chest —
  “Open remains” — and taking from it is taking; take-all empties it and the
  bones stay as a marker that asks nothing more. You can stand on them. **A cap
  destroys them, contents and all** — it is not a nice place — except that one
  time in three it spares one thing, and if the bones held a weapon, that is
  the thing. **Emptied remains fade**: once you close the screen, the bones and
  their aura dither away over a second and are gone from the room. Delta-only, never generated; hashed and saved. DJ:
  “your corpse should be a special colored bones, maybe with a faint aura glow,
  that opens as a container.”

### Fixed

- The room view's cache stamp did not include remains, so re-entering the room
  you died in served the view from before you died. It does now.

## [0.8.0] — 2026-09-25

*The Field, the cap, the Sentinel, and the game on a phone.* DJ, on the Retroid:
“it all feels great, combat is good, the dog is challenging, the pop is
satisfying, knockback is great … on retroid it plays beautifully now.” The
Field and the on-screen controls want tuning; both are noted in the backlog.

### Added

- **On-screen controls for a phone without a controller.** Detected by a pure
  function (`app/controls.js`: coarse pointer + touch points, no gamepad seen,
  no key pressed; the title-screen preference *touch: auto/on/off* wins).
  Portrait is the Game Boy: the view scaled to the width on top, a pad and
  buttons below on black. Landscape is the overlay, translucent over the view.
  The d-pad is a stick — direction from the vector to its centre, eight ways
  with a deadzone, updated as the thumb slides — and buttons hold while
  touched and hand the press over when a thumb slides onto a neighbour; every
  pointer tracked by id. Same mapping as the pad, glyphs from the project sheet
  (six new cells: hand, chevrons, pack, drop, shield, speed lines) with the pad
  letter beneath. DOM, not canvas: the view stays pure; the frame is still one
  int. Fractional fit on phones (a 640px canvas used to hang off a 390px
  screen); integer on desktops as before. `?controls=portrait|landscape|none`
  forces a layout for judging on a desktop. Nine detector gates, sixteen on
  the page.
- **Licence and notice.** `LICENSE`: © 2026 David Reyburn, all rights reserved,
  scope stated, third-party art excluded. `NOTICE` credits the tile art —
  *Playdate Dungeon Tileset* by schwarnhild — with its terms; the credit is on
  the title screen and in the README. **The tileset is no longer in this
  repository or its history:** its licence forbids redistribution and a public
  repo is a download. It lives in the private `paramyth-art` repo, which the
  Pages workflow checks out into `inbox/` for the gates and the deploy. A gate
  holds the notice, the credit and the ignore rule in place.
- **Location-independent, and a Pages deploy.** Every shipped path is relative
  now — the app loads its pack relative to itself, a pack's sheets are relative
  to the pack file (so a pack is a folder you can move whole), the manifest
  scopes itself `./` — and a server gate refuses any absolute site-root path
  in `app/`, `render/`, `sim/`, `core/` or `systems/`. A root `index.html`
  forwards to `app/`. `.github/workflows/pages.yml` runs the gates and deploys
  `main` to GitHub Pages; the repo's visibility is DJ's switch to flip.
- **Fullscreen, and an installable app** (`plans/pwa-fullscreen.md`). Tap or
  any key at the title, or F at any time, asks for fullscreen and a landscape
  lock; refusals print on the title. A manifest (fullscreen, landscape, the
  sword as icon at 192 and 512, built from the project sheet by
  `tools/build-icons.mjs`) and a service worker that caches nothing, registered
  only in a secure context — over LAN http only the fullscreen part applies;
  install is for localhost, https and the APK. Server gates cover all of it.
- **The Field** (`plans/field-2026-09-25.md`). The surface is a floor like the
  others: six rooms, all linked, all present. Room 0 is the Company Camp,
  authored as before but with its east and south sides open. The other five are
  generated open ground — a new `GRASS` tile from three generated cells in the
  project sheet, a fixed green at every site — with hashed boulder clusters (a
  cap opens them) and broken monuments (masonry, which stays). Room edges are
  open their whole length where a room continues, a boulder line where the
  world ends: crossing is walking, not doorways. **The mausoleum mouth has left
  the camp** — nobody sleeps next to that — and stands as a small walled front
  in a room at least two away. Floor 0's up-stair still returns you to it. The
  camp is the only friendly room: steel comes out on the Field, caps can be
  set, and a dog sometimes hunts there. Counters answer only in the camp.

### Fixed

- **No health bar on the Field.** It was drawn 'underground only', a rule from
  when the whole surface was the safe camp. The Field has dogs. It now follows
  danger, not depth: everywhere but the camp. Gated both ways.

### Changed

- **Three stats renamed** (DJ): Finesse → **Swift**, Keen → **Insight**, Bearing →
  **Charm**. Every mark the eye finds is read by Insight now. An old save keeps
  its numbers under the new names (`migrate` in `app/save.js`, gated).
- **`sim/interact.js` is four files.** It had grown to six questions in one
  place. Now `room.js` (what is here: the view, the grid with breaks, reach,
  drop, stairs, stations), `carry.js` (the load and the hands: bulk, tiers,
  the pack's shapes, the blade and its box), `record.js` (the record as this
  character reads it: chains, marks, leads, worth) and `prompt.js` (the toast).
  Deleted rather than kept as a barrel; every importer names the module it
  actually reads. No behaviour changed; every gate still passes.

### Added

- **What a blast does to the things in it** (`plans/blast-interactions.md`).
  One word per kind, `force`: a chest `stands`; everything else `breaks`.
  Barrels, pots, urns, tables, chairs and any loose thing inside the square are
  destroyed — taken and never dropped, so a key keeps its history. Furniture
  and pottery leave a **scar** on the floor (`s.scars`, a decal through the
  pack; placeholder art). A broken container rolls once, keyed to itself so
  replay agrees, and **one time in three** leaves its first thing lying where it
  stood with its own key; the rest go to `taken` so no trove advertises them.
  A chest inside the square is untouched, contents and all. `thingsIn()` in
  `room.js` answers what lies in any room, not only the one you are in, so a
  cap set in a room you have left still knows what it is about to break.

- **Polish** (`plans/polish-2026-09-25.md`). A **dithered fade** on every change
  of floor — 4×4 Bayer, all to none over 18 ticks, over the world and the light
  and under the HUD — keyed to a new `arrivedAt` in the delta, because the
  renderer may not touch the clock. A **pop** where a foe dies: a one-pixel
  midpoint-circle ring that grows for ten ticks and breaks halfway, in the
  kind's colour from the pack (rot-red dog, bone Sentinel). And the **cap keeps
  one colour** at every depth: iron, by the pack's fixed-tone rule. Both
  effects are hashed, replayed and gated on the glass.

- **The Blasting Cap** — `B.Cap` on the glass — the first tool. In the TOOL
  slot; the tool button (K / pad 3) sets it one tile ahead, or at your feet when
  the tile ahead is solid, and the next cap in your pack takes the slot. A
  45-tick fuse (it blinks, faster at the end), then a **56px square that lingers
  ten ticks** and is drawn for exactly those ticks, like the swing: what you see
  is the hitbox. Rubble in it becomes floor — the first thing in the game that
  changes the map, recorded as one line of delta per tile while the generator
  stays pure. It hurts each body in it once (8; you 4 if you stand there) and
  shoves with knock 48: the heavy impact that moves a Sentinel. The Worker is
  issued one; more lie in the shallows at 2 scrap. DJ's bomb icon in the project
  sheet, which now builds from `assets/sheets/paramyth-20.txt` by
  `tools/build-sheet.mjs`. A ninth gate suite, `tools/test-tools.mjs`.
- `sim/blast.js` (L3): fuses and blasts are world physics beside `carry()`;
  `roomView(s).grid` is now the grid everything walks and draws, with breaks
  applied; `hurt` joins `bite` in apply as a bite with no biter.

- **The Broken Sentinel (`S`).** The second foe, and the proof that the machine
  is a template: a policy table in `core/foes.js`, no new branch in
  `systems/combat/` (a gate reads the source and checks it names no kind). It
  does not stir until you are within three tiles; then it comes slowly and
  straight — slower than an overloaded player, so you can always walk away;
  commits only within reach after a long wind-up; hits for 4 and throws you a
  tile. Weight 6: a sword's shove is a 4px tap and does nothing; a heavy impact
  weapon (knock ≥ 30 — not yet built) would move it. Stands in the deep strata,
  never the shallows. Lichen-green in the pack; `tools/telegraph.html?kind=sentinel`.
- Two template knobs it needed: `strikeRange` (commit when in reach, not on the
  clock) and *no orbit means no tangent*. One general rule: a shove that would
  travel under `KNOCK_MIN` (5px) is no shove — no movement, no stagger — which
  is what lets weight mean something short of Infinity.

## [0.7.0] — 2026-09-25

*The dog learns to hunt.* DJ, after a playtest: “a genuinely challenging combat
encounter. God help you if you only have fists.”

### Added

- **Contact, not pace** — step 4 of `plans/foe-behaviour.md`. The two speed-tier
  gates that compared constants are replaced by a chase on the camp's open
  ground: after a bite, you run. Light breaks contact (123px clear at 400
  ticks); laden is bitten at tick 130; overloaded at 113, three times. Getting
  there exposed three geometry faults that no number could have fixed: recover
  backed off from a player already out of range (a free head start every
  bite); the circle's inward share was slower than a laden walk, so it never
  regained orbit on anyone who kept moving; and the dash ended AT the aim, so it
  could never catch a straight-line runner at any speed. Now recover holds at
  range, the radial dominates 3× out of band (a spiral in), and the lunge is a
  fixed 75px line *through* where you were at 2.5× walk. The telegraph draws
  that line as dots during the crouch.
- **The telegraph** — step 3 of `plans/foe-behaviour.md`. Every mode has a shape
  and a colour on the glyph: asleep dim; circle warm and upright; the **crouch**
  squashed low and ember-bright, with a small cross on the spot it will spring
  to — the aim is fixed the moment the crouch begins, so the mark is a promise
  and stepping off it is the dodge; the dash stretched along its line; recover
  flattened and dull; stagger pale and shuddering. All a function of the delta.
  `tools/telegraph.html` shows the six side by side. Four browser gates.

- **The dog learns to hunt** — step 2 of `plans/foe-behaviour.md`. Straight pursuit
  and the bite cooldown are gone; a foe runs a five-mode machine: `asleep`,
  `circle` (orbits you at two tiles, never bites), `lunge` (a 12-tick **crouch**
  with the aim fixed, then a dash at where you *were* — not homing, so it can be
  sidestepped), `recover` (backs off, cannot bite: the window you swing into),
  `stagger`. The cycle is the cooldown. Circle time is jittered per foe so a
  pack does not lunge as one. In a one-wide passage — judged by probing a tile
  to either side — it comes straight on, so a doorway is a place to fight, not
  to hide. Steering uses an octagonal norm: no square root, no float. The
  machine is a template; the dog is its first policy table. 14 new gates.
- **The orbit is not perfect.** The wanted radius breathes 26–54px on a
  120-tick triangle wave, phased per foe. At the bottom of the drift the dog is
  just inside a sword's reach: chase it and you can land a hit, and the close
  pass is also where a crouch begins. Gated as DJ said it — a chasing bot lands
  hits and is bitten for it (12 and 3 in 900 ticks).

- **Knockback, both ways** — step 1 of `plans/foe-behaviour.md`. A hit shoves the
  foe along the swing: the weapon's `knock` (sword 24px, fists 8px — a distance,
  not a force) divided by the foe's `weight` (dog 1; a rooted thing at Infinity
  does not move). It is a velocity worked off through `slide()` with a ×¾ decay,
  so walls and bodies stop it, and it **staggers** the foe for `staggerTicks`
  (15) — the back-off you can force. A bite that lands shoves you 12px the
  other way. `mode` (`asleep` / `hunt` / `stagger`) replaces the `awake` flag on
  the foe record: the seed of the mode machine. Integer throughout; every new
  field is hashed and replayed. A staggered foe shudders on screen. 18 gates.

- **The first piece of our own art.** DJ's 20×20 sword, drawn in ASCII and
  rendered to `assets/sheets/paramyth-20.png` in the pack's exact light tone, so
  the stratum remap tints it like everything else. It is a third sheet in the
  manifest — the swap point working as designed — and `items.sword` now points
  at it instead of the decor sheet's spike cluster. `tools/icon-preview.html`
  shows every item icon per era so a new one can be judged beside its neighbours.

### Fixed

- **Stuck in your own furniture.** Putting a table down out of a container
  landed it on your tile, and `blocked()` then refused every move — including
  the ones that led out. A body already overlapping an obstacle may now move so
  long as the move takes it no deeper: off a table, never onto it. The drop
  itself is unchanged; standing in furniture is allowed to happen. (DJ, who
  called it “a fascinating emergent feature” — the collision, drop and
  footprint systems composing into a situation nobody wrote.)
- **The slab gate decoded sheets at hardcoded sizes.** Anything not named
  `tiles` was read as 140×280, so the first sheet of our own art (160×20) was
  decoded with the wrong stride and the gate passed on noise. It now reads each
  PNG's IHDR, and a new gate refuses any cell that lies outside its sheet.

- **Actors are solid to each other.** The player is blocked by every foe; each
  foe by the player and every other foe. Until now `blocked()` walked walls and
  barrels and nothing else, so a dog's move was never tested against you — which
  is why it walked *into* you. Contact is now *touching*, not overlap, because
  overlap can no longer happen. Arriving in a room on a foe's tile nudges the
  foe, never you. Step 0 of `plans/foe-behaviour.md`.

### Fixed

- `npm start` on a busy port printed an `EADDRINUSE` stack trace. It now probes
  the port: if a paramyth server is already there it says so and how to open or
  stop it; if something else is, it suggests `PORT=3141`. Exits 1 either way
  rather than half-starting. The usual cause was a server left running by an
  earlier session, and a gate now starts a second server against a live one.

## [0.6.1] — 2026-09-24

### Fixed

- **0.6.0 was tagged with `check.sh` red.** The items suite failed to import
  `bestWeapon` for a new equipment gate. The game itself was fine — the browser
  gates had passed and nothing in `core/`, `sim/` or `render/` was wrong — but a
  tag with a failing suite behind it breaks the one rule this project has. The
  import is fixed; nothing else changes.

## [0.6.0] — 2026-09-24

The game can be put down and picked up again. Three save files, a front door,
an equipment row, and a page that says who you are.

### Added

- **Saves.** Three slots in `localStorage`. A save is the delta — every field of
  the state that does not begin with an underscore — a few hundred bytes, not
  the frame log. Written at natural checkpoints: a room crossed, a screen closed,
  a sale, a death, and on leaving the tab. A `SCHEMA` number changes only when
  the delta's shape does; an older save is shown as such and can be deleted, and
  is never silently reinterpreted.
- **A title screen.** Choose one of three files or delete one. An empty slot is
  a fresh world with its own seed.
- **The equipment row.** Five labelled slots above the pack — weapon, tool,
  armor, helm, accessory. What sits in a slot is worn or wielded and still
  counts against bulk. `A` on a weapon in the pack equips it and the old blade
  takes its place; `A` on a slot unequips. You swing what is in the slot.
- **A status page.** Tab from the pack. Stats, health, scrap, bulk, deaths,
  rooms, records read, what you wield and wear. Read, not operated.
- `roomView(s)` — what is in the room, computed **once per tick** and cached on
  a transient `_view` field. It was rebuilt five times a tick, each time turning
  ever-growing lists into fresh Sets.
- **Transient fields.** Anything beginning `_` is derived: never hashed, never
  saved, rebuilt on demand. `toDelta(s)` is the save serialiser and the gates
  measure size with it.
- `plans/review-2026-09-24.md` — a full pass against the brief, with the
  recommendations on `interact.js`, seed sweeps, `pagecheck.html` and the docs
  ratio. Backlog entry 11: measure it on the Retroid.

### Changed

- You start with the sword **equipped**, not in the pack. Drop-load jettisons
  the pack whole and leaves the row alone. Death empties both.
- Tab flips between the pack and status pages while the menu is open; it still
  closes a container.

### Fixed

- Nothing on disk survived a page reload. Now it does.

### Changed

- **Objects keep their own colour; architecture keeps the region's.** Any pack
  def — tile, item or station — may declare a fixed `tone`, a two-tone pair that
  replaces the stratum's remap. That is the whole rule and it is worth stating:
  the stratum tint is for *architecture*, which should read as the region it is
  in; an object is made of a material and carries it around with it.
- **Pottery is glazed, and a glaze belongs to a stratum.** Pots and urns are not
  one colour the way timber is — a piece is whatever it was dipped in, and which
  glazes existed depends on where and when it was fired. Recent is earthenware
  and cream; the War Dead's is olive and pale green; Imperial is cobalt, gold and
  white-glaze; the Lost Empire's is violet, oxblood and bone. Three to a stratum,
  twelve in all, none shared.
- **A piece is glazed from its own address, not from the room it is lying in.**
  So an imperial cobalt urn stays cobalt when you carry it up into the
  terracotta, and it stays cobalt in your pack. That is
  `design/world-shape.md`'s tell — *"an item found shallow that carries a deep
  chain is immediately, legibly wrong"* — rendered for free, with no writing and
  no UI.
- **Chests are banded gold**, in the world, in your pack, and on the stash
  counter — which is the same sprite and now the same colour. **Barrels, tables
  and chairs are timber**, one timber everywhere.
- **Stairs are bright pale stone, fixed across strata, and hard to miss.** They
  were pulled down to the floor's own value to stop them reading as a block
  pasted on the ground; that worked and left them nearly invisible. Their own
  tone answers both — bright enough to find, with the dark half kept dark so a
  descent still reads as a hole rather than a slab.
- **The surface is daylit.** Camp and every above-ground location render with no
  lamp pass at all — the overlay simply does not run. `design/palette.md`'s
  no-ambient-term law is a law about *the dark*: it governs rooms with no source
  in them, and the sky is a source.
- Skipping the overlay alone was not enough: it left the surface **dimmer** than
  a lantern-lit room, because the warm pass adds light on top of the tiles, so
  removing it removed light. The surface lifts its whole two-tone pair instead
  (×1.9), which is the same mechanism `shade` already uses and keeps the
  stratum's hue. Above about ×2.2 two channels clamp together and warm stone
  turns to overcast concrete, so there is a gate holding it under that.
- **The lamp swings round rather than snapping.** Turning takes eight ticks for
  a right angle, always the short way, so the light lags the body the way a
  lantern in a hand actually does. The angle is an **integer** — 1024 brads to a
  turn — and it lives in the delta, not the renderer: easing it per draw would
  make two draws of one state differ, which the *rendering is deterministic for
  a fixed state* gate forbids, and it would come apart entirely at the 120 Hz
  render option where draws outnumber ticks.
- **The lamp is an egg, not a disc.** It is pinched behind you and swells toward
  whatever you are facing — three to one, front to back, measured at 92px ahead
  against 38px behind on the rendered frame. A disc read as an *aura*, something
  the character emits; an egg reads as something held in a hand, with the body
  shading the rest. It is also the cheapest directional tension available: what
  is behind you is darker than what is in front, so backing away from something
  you can see means stepping into something you cannot.
- The back of the egg is deliberately **not** zero (34% of full radius). A
  delver who cannot see the floor they are retreating onto backs into a wall, and
  the interesting decision is meant to be the load in their hands.
- Lamp gates: the turn is whole-numbered, never exceeds its rate, always takes
  the short way, never leaves the circle however long you spin, and survives
  replay. Plus the vector stays unit length, so the egg keeps its declared
  radius at every angle.
- Costs 0.04 ms a frame of a 16.67 ms budget — one `sqrt` per light-buffer pixel,
  and that buffer is quarter scale in both axes, so a sixteenth of the screen.

- **Base speed raised 50%** — 192 to 288, with the diagonal recomputed rather
  than eyeballed (204 = round(288 × 0.7071)). **Laden is now −25%** rather than
  −20%; overloaded stays at −45%.
- **The dog moves with it: 170 to 255.** Its speed is a *dependent* number and
  the design dies without it. At the old 170 against the new base, laden ran at
  216 and simply outran the dog, which deletes the entire point of the enemy —
  `design/combat-and-tools.md`'s claim that threat is denominated in cargo.
  The ratio is preserved: 288 light escapes, 216 laden is caught, 158 overloaded
  is eaten.

### Fixed

- **A combat gate kept its own copy of `SPEED` and the load ratios**, so it
  reported `192 > 170` and passed cleanly while the engine ran at 288. It now
  imports the real constants. This is the spec's *unbound constants* failure
  mode, found in the gate written to prevent it — a gate that copies the number
  it is checking is testing itself.

### Added

- **The world can say a line.** `s.say` is a transient, tick-stamped message in
  the delta — not a render-side timer, so a replay says the same things at the
  same ticks. It outranks the contextual prompt while it lives, and expires on
  its own after 100 ticks.
- **Refusals speak.** Pressing attack in camp keeps the blade sheathed, as it
  always did, but now says *"Not in camp — the Company frowns on drawn steel"*
  instead of doing nothing at all. Swinging empty-handed says so too. A button
  that does nothing is indistinguishable from a button that is broken, and camp
  is the first place a player presses this one.
- `friendly(s)` marks where steel stays sheathed — camp today, Grimhaven and
  Ashmark when they exist.
- **Unarmed attacks.** Empty hands are fists, not a refusal: a 10×10 square
  directly in front of you for 1 damage, against a blade's 22×30 arc for 3.
  Being disarmed is a bad position rather than a dead stop, and the swing code
  never special-cases an empty pack — `weaponOf()` always answers, with the best
  blade in the pack or with `UNARMED`.
- Gates: J reaches the frame as ATTACK, the camp refusal is raised, drawn, and
  expires, a screen still swallows the verb entirely, and the fist box is
  measurably shorter, narrower and squarer than a blade's.

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
