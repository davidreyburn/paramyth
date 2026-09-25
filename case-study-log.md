# Case Study Log

*Every notable decision: what · why · evidence · outcome. Same-day entries.*

---

## 2026-09-22 — Two gates that were measuring the wrong pixels

**What.** Making the surface daylit needed two new gates, and the first draft of
each was wrong in the same way: it measured something that could not tell the
two cases apart.

**One.** *"the refusal is on the glass"* counted bright pixels in the toast band.
That worked while the camp was dark. The camp is daylit now, so the band is
bright whether or not a toast is drawn — the gate would have passed forever. It
measures a **difference** now: draw with the line, draw without it, and the band
must change.

**Two.** *"underground is still void at the edges"* sampled (6,6) and read
`194,131,107`. That is `#c2836b` exactly — the health pip colour. The probe was
sitting on the HP bar, which is the same colour whether the sun is up or not. It
samples (4,250) now, which is floor in both cases.

**Why it is worth writing down.** Both were caught by the gates disagreeing with
a screenshot, not by review. A gate that samples a fixed screen coordinate is
coupled to the whole HUD layout, and nothing declares that coupling. The
recurring lesson from this week: *a gate that can pass for the wrong reason is
not a gate.* Same shape as the combat gate that kept its own copy of SPEED, and
the pot that was renamed against the legend rather than the art.

---

## 2026-09-22 — A gate that kept its own copy of the number it was checking

**What.** Base player speed went from 192 to 288. The combat gate that exists
specifically to assert *light outruns a dog, laden does not* reported
`192 > 170` and passed.

**Why.** It had declared `const SPEED = 192` and its own literal copy of the
encumbrance ratios. It was checking arithmetic against itself, not the engine.
Meanwhile the real engine ran laden at 216 against a dog at 170 — laden now
simply outran the thing, which is the exact claim the gate was written to
protect.

**Evidence.** Binding the gate to the imported `SPEED` and `LOAD` flipped it
straight to `FAIL laden does not  216 < 170`. The dog moved to 255 to preserve
the ratio, and the three speed gates now pass on the real numbers.

**Outcome.** `specs/spec-layer-contract.md` names this failure mode — *"any two
constants that must agree MUST be bound by an assertion that fails when they
diverge"* — and here it was, inside the assertion. The lesson is narrower than
the spec's: a gate must **import** the constant it checks. A copy is not a
binding, it is a second source of truth wearing a gate's clothes.

**Also worth recording:** the dog's speed is a *dependent* number. It is now
commented as such at its definition, because the next person to raise player
speed will otherwise recreate this exactly.

---

## 2026-09-22 — The encumbrance table had never been implemented

**What.** `tier()` has returned light / laden / overloaded since 0.2.0 and the
value has never reached anything. The speed column in
`design/combat-and-tools.md` was, until today, decoration.

**Why it matters more than it sounds.** It only surfaced because an enemy needed
a speed. Picking 170 for a dog against a player at 192 is meaningless unless the
player is sometimes slower than 192 — and they never were. The whole claim that
*threat is denominated in cargo* rests on one unimplemented multiplication.

**Evidence.** Measured, not asserted: at bulk 4 the player pulls away from a dog
(gap 10240 → 12880); at bulk 19 the dog closes it (10240 → 2440). Same seed,
same room, same dog.

**Outcome.** Implemented as integer ratios, gated twice — once on the arithmetic
(*light outruns a dog, laden does not*) and once on the engine actually applying
it, because the arithmetic being right is exactly what was already true.

---

## 2026-09-22 — The first L4 system, and the upward import I nearly shipped

**What.** `systems/combat/` is the first L4 system the project has had. Written
first as a pure `combat(s, frame) → actions[]` with `sim/step.js` importing it
and holding the system list.

**Why that was wrong.** `step.js` is L3. Importing `systems/combat/` is a layer
reading *upward* — the one edge `specs/spec-layer-contract.md` exists to
forbid, and it names the failure precisely: *"it always arrives as a small
reasonable convenience."* It arrived as one. It looked like wiring.

**The fix, in three moves.** The system list moved to `app/main.js`, which
describes itself as wiring only — so `step(s, frame)` with no list is a complete
peaceful game and the dangerous one is a single line. `swingPhase` and the swing
timings moved to L3, because `s.swing` is delta and its phase is a pure function
of the delta, not of any system. `hitBox` moved to `sim/interact.js`, so the
renderer can draw the arc without importing a system.

**Evidence.** Two gates. One greps `core/` and `sim/` for any import of
`systems/` and fails on a hit. The other is the real thing: `systems/` deleted
from disk, and the game boots, walks, values a haul, renders, and passes every
non-combat gate.

**Outcome.** The contract is now tested rather than asserted. That third move —
the renderer — is the one worth remembering: L5 may legally read anything, so
nothing would have complained, and a deleted `systems/` would have taken the
renderer down with it. *Legal* and *deletable* are different properties.

---

## 2026-09-22 — A fragility roll that ate every haul

**What.** A hit rolls against the most fragile thing you carry. First draft used
`fragility / 8`, which for an urn is two hits in five.

**Why it was wrong.** `design/core-loop.md` says the cargo worth most is the
cargo hardest to bring home — a *tension*, not a tax. At two-in-five per hit,
any fight involving fragile goods was a total loss, so the correct play was to
never carry anything breakable near anything alive, which deletes the decision
rather than sharpening it.

**Evidence.** 400 scripted hits: 185 breaks at the first rate, 49 at the shipped
one. Gated at both ends now — *a hit can destroy cargo* and *losing the haul is
a risk, not a certainty* — so the dial cannot drift in either direction unseen.

**Outcome.** One-in-eight for an urn. The number is a guess and is flagged as a
dial in `plans/slice-01.md`'s sense; what is not a guess is that both bounds are
now held by assertions.

---

## 2026-09-22 — The stairs were lit like a wall

**What.** Stairs read as a bright solid rectangle sitting on top of the floor.
They were already `kind: overlay, base: FLOOR`, which is the fix you would reach
for first — and it was already there and doing nothing.

**Why.** Two separate things, and only the second one mattered. The art is
400/400 opaque — a staircase fills its square, correctly — so the FLOOR base was
covered completely and could never show. The actual cause was `shade`: stairs
rendered at **1.0** and FLOOR at **0.42**. `shade` is the manifest's device for
placing a tile in the value hierarchy, and its own note says floor sits dark and
walkable while wall stone takes the light. The stairs were sitting in the wall's
band. A walkable tile was being lit like masonry, so of course it read as a
block laid on the ground rather than a hole in it.

**Evidence.** Decoded the sprite: STAIR_U is 253 light / 147 dark / 0 clear.
Rendered the tile over floor at 1.0, 0.95, 0.8, 0.65, 0.5 and 0.42 and looked at
all six; 0.42 is the only one where the artist's dither band — the dissolve
along the bottom edge, drawn precisely to fade a stair into a floor — actually
dissolves, because that is the only value at which the two tones match.

**Outcome.** Both stairs at the floor's value. Brightness now carries meaning
that it did not before: dark is what you can walk on, light is stone standing
up. Gated as paired constants against FLOOR, with a second gate asserting the
wall stays above it.

**Also.** Writing the overlay gate — *every overlay lets its base show through* —
immediately caught `SARC` doing the same thing: five opaque cells, each paying
for a floor draw nobody could ever see. Declared as a full-bleed tile now, which
changes no pixels and removes the draw.

**The trade.** The stairs are now much less conspicuous than a sarcophagus. That
is what blending costs, and the lever is one number in the manifest if they
should pop more.

---

## 2026-09-22 — The pot that was renamed instead of looked at

**What.** `pot` became `crate` in the item table, the manifest legend was edited
to say CRATE, and a gate was written asserting *pots are gone; the art is a
crate*. The sprite at decor 3,4 is a round-bellied pot. There is no crate on
either sheet. So every crate in the game was drawn as a pot, and the gate held
it that way.

**Why it happened.** The rename was made against the legend, not against the
art. The legend is a text file; it agreed immediately. Nothing in the loop ever
put the word and the picture side by side, and the one gate that mentioned both
asserted the wrong one.

**Evidence.** Rendered the decor sheet at 11× with the manifest's own cell
indices overlaid. 3,4 is a pot with a rim and a belly; the barrels at 3,5 and
3,6 are unmistakably barrels; the nearest thing to a crate anywhere is a slatted
rack at 4,1 already doing duty as the quartermaster's counter.

**Outcome.** The word follows the picture: the kind is `pot`, and it took the
unused second pot at 2,5 as a variant. The real fix is the new gate — item kinds
and item art must cover each other exactly, in both directions. A kind with no
art draws a flat rectangle and art with no kind is simply unreachable, and
neither one throws, which is why a half-done rename survived a full test run.

**The pattern.** Same shape as the HUD's fifth line and the bare-kind pickup: the
failure was silent because the thing that would have complained had been taught
to agree. A gate written from the same belief as the code tests the belief.

---

## 2026-09-22 — The inversion: an actor had to become an address

**What.** In 0.3.0 an event's actor was `actorOf(seed, h(seed, ...salt, i) % 100000, era)`
— a hash of the object that happened to name them. In 0.4.0 an actor id is
`site · era · n`, packed into one integer and decomposable both ways.

**Why.** `possessionsOf(actorId)` is the whole design, and it is not implementable
on top of a forward hash at any price: given a person, there is no way back to
the objects naming them short of computing every chain in the world. The id had
to carry its own origin. Once it did, the inversion became a bounded scan of one
site — a few floors of a few rooms — cached in memory and never written down.

**Evidence.** 486 possessions checked across 6 sites; every one names its owner.
`possessionsOf` is pure across calls. Cold site scan 6.8 ms, and nothing on the
frame path calls it.

**Outcome.** The mechanic the design rests on works. The cost was a pool of 8
actors per era per site — names now *recur*, which turns out to be the point:
you cannot notice a name repeating if every object names a stranger.

---

## 2026-09-22 — A lead that points at an average room is not a lead

**What.** First working version derived an event's `place` from an independent
hash of the actor. Every gate passed. Walking there found nothing in particular.

**Why it was wrong.** Solvable is not the same as worth solving. The design
promises "that place exists, at that address, with the rest of that person's
grave goods still in it" — and a hash-chosen room satisfies the first two
clauses and not the third. The fix inverted the causality: rooms have
**occupants**, half the hands that touched a thing are its room's occupant, and
`placeFor` *finds* the room a person occupies rather than inventing a plausible
one.

**Evidence.** The named room holds 2.64 of an actor's things against 1.64 in any
other room they appear in, and is their densest room 58% of the time. End to
end: an item found in room 0:1:4 sent a player to 0:0:0, where 3 of 3 loose
things and 6 boxed things named the same woman.

**Outcome.** Gated as *the room a lead names is a trove, not an average room* —
a ratio, not a presence check. The first version would have passed a presence
check, which is exactly why one would not have been enough.

---

## 2026-09-22 — Guaranteed solvability, as arithmetic

**What.** Two constraints. One room per floor — the plan's first cell — draws
its occupant from a **resolved** range of the pool; and no chain anywhere else
in the world may name a resolved actor of another site.

**Why.** `design/provenance.md` flagged the risk early: if cross-references only
*sometimes* resolve within reach, the deduction loop feels broken rather than
deep. A probabilistic bias cannot guarantee anything, and the first attempt —
biasing acts toward place-naming verbs — left site 3 with zero followable leads
while looking fine everywhere else.

**Evidence.** Over 40 regions: 0 resolved actors owning anything outside their
own region, 0 leads pointing at a room that is not there, and a minimum of 2
deducible troves per region. Era 0 had to gain `hid` — a scrapper's cache —
because the surface act vocabulary named nowhere at all.

**Outcome.** The `solvable` gate from `plans/slice-01.md` exists and holds. The
long threads survive: a quarter of hands are foreign, 5% of leads name another
site, and those stay dead ends until the Field has more than one mouth.

---

## 2026-09-22 — Two bugs the gates were shaped not to see

**What.** Picking a loose item off the floor did `s.carried.push(c.kind)` — a
bare string into a list of `{kind, key}` references. And the HUD passed five
lines into a strip that holds four.

**Why they survived.** The pickup bug was unreachable through the path the tests
exercised: every gate took things out of *containers*, where the transfer code
was correct. The bare kind had no key, so its chain, its price and its history
were all lost and `hashState` threw — on a path no test walked. The HUD bug was
subtler: the fifth line was not clipped, it was drawn entirely below the canvas,
and the gate measuring ink in the bottom three rows correctly found none.

**Evidence.** Both now gated — the item gates pick loose things off the floor,
and `drawHud` throws when handed more lines than `HUD_LINES`, which is derived
from the strip height rather than written down twice.

**Outcome.** The spec's *unbound constants* failure mode again, in a new costume.
A gate that measures the symptom of a bug will miss the bug when it changes
costume; a gate that binds the two constants cannot.

---

## 2026-09-22 — Spike 0 and 1 pass: browser and device

**What.** 640×360 integer-scaled Canvas2D, normalized input frames, fixed 60 Hz
tick, frame log, live replay gate. 480 lines, zero dependencies.

**Why.** Prove the render target, the L5 input boundary and the determinism
kernel with nothing else in the way, before any game code exists.

**Evidence.** Headless: replay over 50,000 frames, divergence detected as a
negative control, save 195 KiB at 50k frames. Browser: canvas exactly 640×360,
integer scale ×2, CSS an exact multiple, lantern lights and falls off, corners
at true black, replay holds in-browser. Confirmed by DJ on desktop **and on the
Retroid Pocket 6 over LAN**.

**Outcome.** Kernel skeleton accepted. LAN dev loop confirmed as the working
cycle; Capacitor packaging deferred to a release step.

---

## 2026-09-22 — Integer subpixel positions: cross-device determinism came free

**What.** Positions are integers in 1/256-pixel UNITS. Diagonal speed is a
precomputed integer (136 = round(192 × 0.7071)), sprint is an integer ratio.
No float enters the simulation path.

**Why.** `spec-layer-contract.md` had accepted per-device-only replay as a
deliberate tradeoff, with fixed-point flagged as a later upgrade. Writing
movement in integers turned out to cost nothing.

**Evidence.** Gate asserts `Number.isInteger(x) && Number.isInteger(y)` after
50,000 frames of pseudo-input.

**Outcome.** The tradeoff in the spec is **better than written** — cross-device
replay should hold as long as the discipline is kept. The spec's constraint
stands as the floor, not the ceiling. Revisit if any system needs real numbers.

---

## 2026-09-22 — The black page: rewrite vs. redirect

**What.** The server mapped `/` to `/app/index.html` by rewriting the path.
Page loaded; screen was black; no error visible anywhere.

**Why it happened.** Rewriting leaves the document base URL at `/`, so
`<script src="./main.js">` resolves to `/main.js` and 404s. The module never
runs. `tools/pagecheck.html` passed throughout, because it was loaded at its
real path where relative imports resolve correctly — so the harness that existed
to catch page defects was structurally blind to this one.

**Evidence.** `curl /main.js` → 404, `curl /app/main.js` → 200.

**Outcome.** `/` now returns 302 to `/app/`. `tools/serve-check.mjs` walks every
relative `src`/`href` on the entry page and every import in `main.js`, resolving
each against the *final* document URL. Added to the gate list.

**Second-order lesson, worth more than the fix.** A page gate that constructs its
own fixture cannot catch a defect in how the real entry point is *served*. The
harness must enter through the same door the player does. This is the same shape
as bug §21 in library-of-babel — a defect invisible on the machine that wrote it
— and the same answer: test through a second path, not a second assertion.

---

## 2026-09-22 — Two defects the screenshot found that the gates did not

**What.** (1) The 4th HUD line was clipped: band at y=320, 10 px spacing from
+6 put line four's baseline at 356 with an 8 px font, 4 px past the canvas.
(2) The lantern radius of 74 px was unreadably tight in motion.

**Why.** Both were flagged as guesses in `combat-and-tools.md` and neither had a
gate. Nothing asserted that drawn text lands inside the canvas.

**Evidence.** Screenshot of the live page showed `press R` half-drawn and a room
too dark to navigate.

**Outcome.** 9 px spacing from +4; lamp 74 → 112 px with a softer mid-falloff.
New page gate: zero ink in the bottom three rows with four HUD lines. Looking at
the thing remains the highest-yield gate there is; the lesson is to convert each
look into an assertion afterwards.

---

## 2026-09-22 — The atlas found dead content on its first run

**What.** `tools/atlas.html` draws every mausoleum's floor topology as a grid of
sites × depths, tinted by era. On the first render, all four era-legend colours
existed but **every tile on screen was one era**.

**Why.** `eraFor(floor) = ERAS[floor >> 1]`, keyed to the *floor index within a
site*. A mausoleum has at most 4 floors, so the era index could never exceed 1.
Eras `Imperial` and `Lost Empire` were unreachable, and with them **four
archetype generators — `hero-tomb`, `reliquary`, `ascension-chamber`,
`warden-post` — were dead code.** They are ~40 lines of carving logic that had
never executed and could not, while looking exactly like the four that worked.

**Evidence.** Enumerating 400 sites: 4 eras declared, 2 reachable; 8 archetypes
declared, 4 reachable.

**Outcome.** Era now keys to **absolute depth** (`absDepth(floor) = floor + 1`)
against the strata in `design/world-shape.md`, not to the local floor index. The
deepest mausoleums now reach imperial material, which is what the Ransacked
Archive being in the Barrow Deep already implied. 6 of 8 archetypes live; the
remaining 2 are *declared* unreachable pending the Frontier Halls.

Two gates added, both written to **fail when a new stratum lands** so the gap
cannot go quiet — the golden-transcript pattern from `barrowlands-tcg`. Era
tints were also pushed far apart: the first two were close enough that the atlas
could not distinguish them, which nearly hid the defect a second time.

**The lesson is the one already in the spec, now paid for twice.** This is the
reading-room column bug in a new costume: a generator keyed to an axis that
cannot express what the design needs. Neither the 624-distinct-rooms gate nor
any amount of walking around inside a room could have shown it. Only the view of
the whole did, and only because the legend sat next to the tiles.

---

## 2026-09-22 — Palette derived, not reused; art referenced, not assumed

**What.** The reference 1-bit tileset is wired in through a swappable pack
manifest; the palette is derived from `barrowlands-tcg/design/tokens.json`;
lighting was rewritten per-pixel.

**Why derived rather than reused.** The TCG palette is normative and correct for
*dark ink on parchment*, gated at 3:1 on a light card face. This game is
*emissive light on true black*. The five element hues carry over as the identity
axis; the anchoring does not. Seven values are lifted verbatim so identity stays
traceable rather than re-invented.

**The load-bearing inheritance is a principle, not a colour.** TCG visual
identity principle 3 — *"Light has a source. No ambient glow, no decorative
gradient"* — was art direction for card illustration. Here it is the rendering
law, and it is the argument against the smooth radial gradient the first build
shipped.

**Evidence.** The reference art decodes to exactly three RGBA values: `#b1afa8`,
`#312f28`, transparent. That makes region flavour a **two-colour remap** rather
than a tint wash — the art is a mask and each stratum supplies its own pair.

**Lighting.** Canvas arcs anti-alias, so drawing banded annuli put a soft ramp
straight back into a design whose whole rule is that there is no ramp. The light
buffer is now written per-pixel at ¼ resolution and upscaled nearest-neighbour:
6 hard bands, exact edges, and `LIGHT_BEYOND = 1` — beyond the lamp is not dim,
it is unlit. Gated by sampling 130 px outward and asserting ≤12 quantised levels.

**Outcome.** `assets/packs/onebit.json` is the swap point: sheets and grid refs
are data, and a build with no pack at all falls back to flat colour and still
runs. The reference art is marked as unlicensed placeholder in the manifest's own
provenance field.

**One gate found its own bug.** "Different strata produce different art" failed
because it sampled the sheet's top-left 8×8 — which is empty in this tileset, so
it compared two identically transparent regions. Fixed by sampling real art and
adding a companion assertion that the sample region contains any at all. A gate
that samples nothing passes for the wrong reason in one direction and fails for
the wrong reason in the other.

---

## 2026-09-22 — Third silent failure, now gated as a class

**What.** `tools/tileset-sheet.html` rendered nothing when opened. The server was
running and both resources returned 200; the page had been opened from the file
system, where its **absolute** asset path (`/inbox/…`) resolves to the filesystem
root. `img.onerror` was empty, so the failure produced a blank page.

**Why it matters more than the fix.** This is the third instance of one class in
one day:

1. `/` rewritten instead of redirected — modules 404'd, page black, no error.
2. `atlas.html` — a throwing module script leaves a blank document.
3. `tileset-sheet.html` — an empty `img.onerror`.

Every one presented as *nothing on screen*, which is the least diagnostic
possible output, and each cost a round trip to diagnose. The common cause is not
carelessness about paths; it is that **the failure path had no output**.

**Outcome.** Relative asset paths, an explicit `file://` check with the exact
command to run instead, and a visible status element that starts as "loading…"
so the page is never blank in any state. `atlas.html` gained a global error
handler that prints the message, file and line into the document.

Two gates in `serve-check.mjs`, asserted over every `tools/*.html`: each page
must contain an error handler, and asset paths must be relative. The failure
message is *"a blank page is not an error message."*

**Rule going forward.** A page that can fail must be able to say so. This is the
same lesson as the `/` redirect entry — a harness must enter through the same
door the user does — extended one step: it must also be able to report that the
door was locked.

---

## 2026-09-22 — Tile semantics corrected by DJ; walls are nine-sliced

**What.** The mapping was wrong in a way the gates could never catch, because
every gate only checked that cells *existed*, never that they meant anything.
DJ read the sheets: in `tiles`, the **six clusters on the left (cols 1–11) are
all wall sets**, and **cols 14–20 are floors**; the bottom-right block is
elaborate decorative architecture. `decor` is **objects**, including the
staircase.

**The specific error.** `WALL` pointed at `tiles` cols 18–20 row 6 — a *floor*.
That is why the mapper's preview showed a room with no walls in it, and why my
earlier note read "WALL is too close to FLOOR". It was not too close; it was the
same thing.

**Two structural consequences, both bigger than the fix.**

*Walls autotile.* Cols 1–3 × rows 1–3 is a **nine-slice**: corners, edges and a
centre fill, with cols 4–5 as inner corners. A wall's tile is a function of which
orthogonal neighbours share its type, so picking a random variant was never going
to produce a wall — it would produce noise where the edges should be. `drawsFor`
now resolves three kinds: `variants`, `nineslice`, `overlay`.

*Decor sits over floor.* Objects are not floor replacements. `RUBBLE`, `SARC`,
`NICHE`, `PILLAR` and both stairs are now `overlay` types that draw a `FLOOR`
base and then an object on top.

**And a third, found by looking.** With the schema right, wall and floor were
still indistinguishable — **two-tone art cannot differ in value on its own.**
Added a per-type `shade` multiplier on the stratum pair: floor at 0.42 sits dark
and walkable, wall stone takes the light. That is the classic top-down read and
the only lever this art has.

**Outcome.** Manifest carries a `_semantics` field recording what each region of
each sheet *is*, so the next reader does not re-derive it from pixels. Gates
extended: known kinds, cells resolve to real sheets, nine-slice origins fit,
overlay bases resolve without a cycle, and **`walls are nine-sliced, not random
variants`** — whose failure message is "a wall picked at random has no edges".

**The lesson.** Eight gates passed on a mapping where the single most important
tile type pointed at the wrong kind of art. Structural gates cannot check
meaning; only a person who knows the asset can. What the gates *can* do is lock
the meaning in once it is known — which is what `_semantics` and the nine-slice
assertion now do.

---

## 2026-09-22 — The legend artifact: labels from the person who owns the asset

**What.** Published an interactive labelling page (`claude.ai/artifact/Pg9GrbSoNUfCxymcLDzf6L`),
seeded with 19 regions all marked as *my guess*, and read DJ's corrections back
out of its database. Eight of my nineteen guesses were wrong, and he added six
regions I had not even seen.

**Why a tool rather than a question.** The previous round established that
structural gates cannot check meaning. Asking in prose would have produced
another round of my descriptions of pixels; a page that shows the art and takes
a label per region produces the artist's own words against exact coordinates.

**The corrections that mattered most.**
- `decor` c1–c2 r7–r8, which I had labelled *shelves*, are the **stairs** —
  r7 down (left and right), r8 up. The ladders at c3 are separate.
- `decor` c1–c3 r1–r2 are **misc blocks**, not sarcophagi; c3 r2 is an inverted
  square pit.
- `decor` r3 is rocks but **r4 is a table, a chair and a pot** — I had mapped
  both rows as rubble.
- `tiles` c1–c4 and c7–c9 at r9–r11 are **ornate floor sets, not wall sets**,
  correcting DJ's own earlier "the six clusters on the left are all walls".
- An entire column of items at `decor` c5 — skeleton, key, gem, lever — that
  none of my contact-sheet renders had covered.

**And one entry that was not a label at all.** Against wall set A: *"the corners
aren't being used correctly, and walls are showing up in the interior of the room
where they shouldn't."* A bug report, filed in the labelling tool.

It was not the art. Verified at 8× that c1–c3 × r1–r3 is a standard nine-slice
and that `ninesliceOffset` resolves correctly. The defect was in the generator:
`salvage-cut` scattered **isolated single wall tiles** among rubble, and an
isolated wall has no exposed edge to select, so the nine-slice resolved every one
of them to the top-left corner piece. Corners everywhere, walls speckled through
the interior — both symptoms from one cause.

**Outcome.** `salvage-cut` now places solid masses with rubble spilled around
them. A general post-pass demotes any interior wall tile with no orthogonal wall
neighbour to rubble, so the rule holds across every archetype including ones not
yet written. Gated: **`no isolated interior wall tiles` — 0 strays among 8,882.**

**The artifact had its own bug, and it is the same lesson twice.** Every
keystroke wrote to the store, the write echoed through the live subscription, and
the snapshot handler rebuilt the whole list's HTML — destroying the focused
input. A stray focus call then grabbed the *name* field, and the recreated input
put the caret at 0, so DJ typed backwards into the wrong box. Fixed by debouncing
writes to one per pause, merging snapshots instead of rebuilding, and never
replacing DOM that holds the caret. I had read the store's "coalesce a burst of
input events into one write per pause" guidance and written the opposite.

---

## 2026-09-22 — "Where's the corner?" — the diagonal case

**What.** DJ sent a screenshot of a room whose border ran unbroken through its
own corners. The nine-slice was drawing the plain centre fill where a corner
piece belonged.

**Why.** A four-neighbour nine-slice cannot see a corner. A room's border corner
has wall on **all four orthogonals** — the border continues along both runs, and
out-of-bounds counts as wall — so it resolves to "middle, middle" and no corner
is ever selected. What makes it a corner is the **diagonal**: the floor sits in
exactly one of them.

**Evidence.** The four extra cells at `tiles` c4–c5 r1–r2, which I had guessed
were "inner corners" and then ignored. At 12× each carries a solid light quadrant
in a different corner — top-left, top-right, bottom-left, bottom-right — and that
quadrant points at the diagonal where the floor is. They are exactly the missing
case, sitting unused in the sheet the whole time.

**Outcome.** `drawsFor` now takes **eight** neighbours. When all four orthogonals
match, the first open diagonal selects an inner-corner piece; otherwise the
orthogonal nine-slice runs as before. The manifest declares
`inner: {nw, ne, sw, se}` as offsets from the origin.

**Gated**, because the failure mode is a silent fallback to a plausible-looking
tile: for all four corners of a real generated room, the resolved cell must be
the declared inner corner for that diagonal, and the failure message names the
centre fill explicitly — *"the plain centre fill: no corner drawn"*.

**Pattern worth naming.** This is the third defect in this asset in two days
whose symptom was *something plausible drawn in the wrong place* — floor art used
as walls, isolated walls resolving to corners, and now corners resolving to fill.
None of them threw, none looked obviously broken in a thumbnail, and all three
were caught by a person looking at the actual thing. The gates that now cover
them were all written **after** the fact, from a description of what was seen.

---

## 2026-09-22 — A staircase is one shaft, not two rolls

**What.** DJ: "any stair down must have a matching stair up on the other floor."

**Why it was wrong.** Floor *f*'s down-stair and floor *f+1*'s up-stair were
picked from independent hashes (`0xd0` and `0x0f`) over each floor's own cells.
Counts happened to match — every floor above the last has a down, every floor
below the first has an up — so nothing looked broken. But the two ends of a
staircase landed in unrelated rooms, which is not a staircase.

**Outcome.** `stairUpCell(f)` is now *derived* from `stairDownCell(f-1)`: it
lands in the same grid cell where that cell exists on this floor, and in the
nearest one where it does not. One shaft, descending as straight as the floor
plans allow.

**And two defects found while fixing it**, neither of which DJ's note mentioned:

*Stairs were stamped over whatever was carved there.* The tiles were written to
fixed coordinates (`col 4`, centre ± 2 rows) directly into the grid, overwriting
any sarcophagus, pillar or wall already at that spot — and landing inside solid
masonry whenever a feature happened to be there. They now take a deterministic
scan for a real `FLOOR` tile, with a minimum separation when one room holds both.

*Nothing checked a stair was reachable.* A reliquary chamber can seal its
interior; a stair placed inside one is a soft-lock with no error. Gated by flood
fill.

Four gates, all on real generated geometry: stairs on the right floors
(182/182), **every down answered by an up below (122/122 shafts)**, every stair
tile actually placed (244/244), every stair tile reachable (244/244).

**The pattern again.** A one-line note about a rule produced three fixes, two of
which were worse than the one reported. Stating an invariant is worth more than
reporting a symptom, because the invariant is what gets gated.

---

## 2026-09-22 — Phase 3a: items, bulk, and one verb

**What.** Items exist in the world, weigh something, and can be picked up. The
whole interaction surface is a **single button and a one-line toast** at bottom
centre — "Open chest", "Pick up gem", and one refusal, "Too heavy — drop
something first".

**Why so little.** DJ: *"interactions and items should be minimal and easy."*
The loop's question is triage under cost, not interface depth. A verb list, a
context menu or a radial would each put a decision in front of the decision that
actually matters, which is whether the thing is worth the bulk.

**Shape.** `core/items.js` is a kind table — label, bulk, fragility, container —
and nothing else: no art, no behaviour, per `content-is-data`. Art is keyed by
kind in the pack manifest, so items are as swappable as tiles.
`contentsOf(seed, site, floor, room)` is a pure function like the room itself;
`insideOf` is what a container holds. **Nothing is placed until something is
taken, and only the taking is recorded** — 6 pickups cost 59 bytes of delta.

The item vocabulary is entirely DJ's labels from the legend artifact: chest,
crate, barrel, sack, pot, urn, key, gem, crystal, trinket, bones, table, chair.
An hour before, none of that art had a meaning attached.

**The gate that matters most**: *the toast predicts what the button does.* It
stands the player on every reachable thing in turn, reads the prompt, presses
the button, and asserts the outcome matches what the prompt claimed — including
that a refusal takes nothing. A prompt that lies is worse than no prompt.

**And one gate that had to be strengthened.** "A full load refuses" first
reported *"no portable in reach to test"* and passed — the start room happened
to hold only containers. A gate that skips itself proves nothing, so it now
walks 40 sites for a real portable before testing the refusal. It found a
trinket on site 0 floor 0 and the refusal holds.

Five suites now, behind `./check.sh`.

---

## 2026-09-22 — Two bugs behind one button

**What DJ saw.** "Items and trinkets don't get picked up and disappear when you
interact", and "the stairs still aren't linked between levels, so I get stranded
when I go up or down."

**Neither was what it looked like.**

*The vanishing items.* Pickup worked; a gate already proved it. The start room
held **only containers**, and opening one scattered its contents to free floor
tiles found by a hashed scan — one landed two tiles away, the other halfway
across the room, outside the lamp. An opened chest therefore appeared to do
nothing. The comment above that code said "adjacent tiles, so opening a chest
spills onto the floor you can already see"; the code said no such thing.

*The stranding.* The rooms were correctly linked — the shaft fix held. Two other
things were wrong. Arrival used `spawnIn`, which puts you at the room's centre,
so you landed in the dark with the return stair somewhere unlit. And worse:
`step` checked `reachable()` **before** the stair under your feet, so a pot
lying beside a staircase captured the button entirely and the floor became a
one-way trip.

**Outcome.** Contents stay inside containers until taken. Opening one opens a
**transfer screen** — two pixel grids, one square per item, the item's own tile
on a plate, a cursor, `A` to take, `Y` to take all, `B` to close. The pack has
its own screen on `Y`. Movement is inert while either is open, so a transfer can
never be half-made in transit.

Stairs now place you **standing on** the stair that answers the one you took, and
the stair underfoot outranks anything beside it. It has its own toast —
"Descend", "Ascend" — so the prompt still names every interaction.

**The gate that found the stranding** was written for the symptom DJ reported and
caught the cause instead: *descending lands you on the stair back up* failed
18/25 before the fix, *a round trip returns you to the room you left* 22/25. Both
25/25 now. The existing "the toast predicts what the button does" gate then
forced the prompt and the action to agree about stairs too — the ordering exists
in two places and is held together by an assertion.

---

## 2026-09-22 — Solid items, and the line between a soft-lock and content

**What.** Tables, pots and barrels block movement. Sacks are gone — the art DJ
labelled "sack" is a bottle of something, unmapped for now.

**What collision exposed.** Gating "no doorway is sealed" failed 652/658 — and
the first failure I inspected had **no items in it at all**. A carved feature
had walled the tile *inside* a doorway. The opening was punched last so nothing
could cover it, but nothing checked it was reachable *from inside*. A defect
that predated items entirely, found only because collision gave a reason to look.
Door approaches are now carved through to the room's main space.

**Then a gate of mine was wrong twice over.** `stillOneSpace` demanded a room's
open floor be one component before a solid item could stand anywhere — but a
reliquary can already have a sealed chamber, so it rejected every candidate and
left three rooms with nothing in them. The test should ask whether a placement
makes things *worse*, not whether the room is perfect.

**And then DJ redrew the line the gates were on.**

> "We're not so worried about every random piece of trash being reachable, that
> will be part of the game. There will be tools for boulder destruction and
> tunnel mining, so not everything is meant to be reachable by everyone."

I had been enforcing reachability as correctness. It is a **design dial**.
Obstruction is content: loot behind a collapse is a reason to come back with the
right kit and the bulk to spare. What must never happen is a player with no
route to a door or a stair, because nothing in the game can yet undo that.

So placement now protects exactly two things — **the ways out** — and nothing
else. The gates split to match:

| Hard | Measured |
|---|---|
| every doorway reachable (658/658) | loot behind obstruction: **3/1543, 0.2%** |
| every stair reachable (122/122) | sealed floor: **0.6%**, worst room 45 tiles |
| player never spawns in a pocket | |

The measured half keeps loose bounds that only a generator fault would trip, so
the numbers cannot drift unnoticed while staying decisions rather than bugs.
Recorded in `design/world-shape.md` under "Obstruction is content" — and when
the mining tools land, those bounds are the dial that says how much of the world
they open.

**The lesson.** Three of my gates encoded an assumption nobody had made. A gate
is a claim about what the game *should* be, and the person building the game is
the only one who can say whether the claim is true.

---

## 2026-09-22 — Objects are smaller than their squares

**What.** The art DJ labelled "a pot" is a **crate**; the kind is renamed and my
guessed second crate cell (decor 2,5) is dropped with it — that guess came from
the urns/barrels/sacks row, which turned out to hold a bottle. And crates,
chairs and barrels "are not as big as a full tile".

**Why it mattered.** Collision claimed the whole 20px square an object stood on.
Visually a chair occupies about half its tile, so the player stopped a clear gap
short of it — the hitbox and the picture disagreed, and the picture is what the
player believes.

**Outcome.** Each solid kind declares a `foot`: a collision half-extent in
pixels from the tile centre. Chair 5, crate 6, barrel 6, urn 7, chest 8,
table 9 — none of them 10, which would be edge to edge. Collision is an AABB
against those boxes rather than a tile lookup.

The generator still reasons in **whole tiles** when deciding whether a solid
thing may seal a way out. That is deliberately stricter than collision: being
conservative about soft-locks costs a few rejected placements and nothing else.

**Gated on the property, not the numbers**: no object claims its whole tile, a
chair takes less floor than a table, and — the one that actually proves it — run
at each and a chair stops you **10.0px** from its centre where a table stops you
**14.5px**. Numbers can be tuned without touching the assertion.

---

## 2026-09-22 — Rocks block, and the demotion pass turned into a feature

**What.** `RUBBLE` was walkable. It is a rock; you walk around it.

**Why it was a one-line change that touched everything.** `solidTile` is read by
the door-carve pass, `mainSpace`, `keepsWayOut`, stair placement and item
placement. Flipping one entry in `SOLID` re-ran all of them — and every gate held
first time, because the door approaches are carved against `solidTile` rather
than against a list of wall types. That is the payoff for a fix written at the
right level three rounds ago.

**An accidental improvement.** The stray-wall pass demotes an isolated `WALL` to
`RUBBLE`, and it existed only to stop a nine-slice resolving a lone wall into a
corner piece. With rubble solid, a demoted wall is now a **boulder** — it still
blocks, it draws as rock, and it is precisely the thing DJ said the mining tools
would be for. The workaround became the feature.

**Gated on behaviour**: rubble is solid, floor and stairs are not, and — the one
that proves it — find a rock with open floor beside it, run at it, and stop.

**Open**: rubble blocks its whole tile while the art covers about 64% of it. That
is defensible for a *pile* of collapsed material rather than a single stone, but
it is the same hitbox-versus-picture mismatch DJ caught on the pots. If rocks
should be squeezed past, terrain needs a footprint the way items now have one.

---

## 2026-09-22 — Inventory on Start, and a binding that vanished into a duplicate key

**What.** The pack opens on **Start** (pad) or **I** (keyboard), and toggles.
`TOOL`/Y is freed for tools.

**The bug found on the way.** The pad map was an object literal, and when I added
cancel I wrote:

```js
const PADS = { … 1: VERB.DODGE, … 1: VERB.CANCEL };
```

Two entries on button 1. JavaScript keeps the last, so **B silently stopped
dodging** — and the comment I wrote directly above it claimed the button carried
both, which is exactly the thing an object literal cannot do. A comment asserting
something the language forbids, sitting on top of the code that disproved it.

Nothing caught it because every gate tested keyboard bindings. The pad had no
coverage at all, so a whole input device could lose a verb in silence.

**Outcome.** Pad values are **lists** of verbs, so one button can legitimately
mean two things. Four gates on the map's shape rather than its contents: every
entry is a list, B carries both dodge and cancel, Start carries inventory, and
**no verb is bound to two buttons by accident** — 13 bindings, 13 distinct.

That last one is the general form of the defect. The specific fix was one line;
the gate covers every future edit to the table.

**Also**: the keyboard gate grew an `I` case, because a binding is only real if a
genuine key event reaches the frame — the same standard the Escape binding was
held to.

---

## 2026-09-22 — 0.2.0: the loop closes

**What.** A Company Camp above the mausoleum, base value on items, a
quartermaster who buys, and a stash that takes things both ways.

**Why it had to come first.** Until now every number in the game was
unfalsifiable. Bulk pressure is not real if nothing you carry is worth anything,
so no amount of tuning the budget could have told us whether triage is
interesting. The loop closing is what makes `plans/slice-01.md` answerable at
all — and answering it is still a separate thing from having done so.

**The camp is the first authored place.** `design/world-shape.md` has always
called for hand-placed anchors with generated tissue between them, and nothing
implemented it. Floors below zero are the surface; `roomTiles` routes `floor < 0`
to `core/camp.js`, which is a fixed ASCII map that validates its own dimensions
and asserts every station is reachable from the mouth — the first draft had the
pit fully walled in, which the assert caught before it ever rendered.

**Two things it forced that were overdue.**

*The grid vocabulary moved to `core/grid.js`.* An authored place needs `COLS`,
`ROWS` and the tile enum, and `gen.js` needs the camp — a cycle. Extracting the
shape both depend on took ten minutes and `gen.js` re-exports it, so nothing
downstream changed.

*Transfer is two-way now.* The stash needed it, and it is the same machinery the
corpse drop will need. Built once.

**Value before provenance, deliberately.** Items carry a flat base worth, and
once marks are legible a chain will multiply it. The alternative — waiting for
provenance so value could be built correctly the first time — would have kept the
loop open for weeks. It closes on flat value and gets interesting later, rather
than getting built twice.

**Two gates broke, and both were telling the truth.** "Stairs exist on the right
floors" fell to 122/182 because floor 0 now has a way up; the gate's model was
stale, not the generator. And a dozen item gates failed because **the starting
room is now the camp, which holds no salvage** — they had all quietly assumed you
begin underground. They descend first now, via one helper, which is also a more
honest fixture.

---

## 2026-09-22 — 0.3.0: provenance visible, and a multiplier that can only go up

**What.** Chains, actors, marks, perception, worth, and an appraiser.

**The architectural move.** Items became **references** — a kind plus the address
its history is computed from. A bare kind has no past, so `carried` and `stash`
could not hold one. The key the delta already used for `taken` turned out to be
the address, so identity cost nothing new.

**The gate that found the real design bug.** *"A chain can lower the price as
well as raise it"* failed at `lowest x1`. Every multiplier floored at 1, because
`made` always contributed +0.15 and the negatives were too small to overcome it.

That is not a tuning miss, it is a **design failure**: if reading a thing can
only ever be good news, the appraiser is a tax rather than a decision. You would
pay the fee every time, and the choice would be whether you could afford it, not
whether it was worth it. Defacement and clumsy repair now cut value hard enough
that about 2% of chains lose money — so opening a record is a risk, and a
scoured panel is a discovery rather than a footnote.

**Two rounds of stale fixtures, the same cause.** Item gates failed because they
assumed you start underground; then the *browser* gates failed the same way, an
hour later, because I had fixed only the headless ones. A fixture that encodes
where the game begins breaks every time the game begins somewhere else — and
fixing one suite does not fix the other.

**What did NOT land, stated plainly.** Only the first of the design's three
tiers exists. `record = truth ⊕ amendments` has no amendments, so forgery,
attestation and effacement have nowhere to live. And the actor graph does not
invert — `possessionsOf` is unbuilt, so a maker's mark cannot lead you to a
trove. That inversion is the thing the game is actually about, and it is next.

---

## 2026-09-24 — 0.6.0: saves, the front door, the row, the page

**Lesson:** change the delta's shape *before* the first save format exists, or
the first save format is obsolete on arrival.

**What.** Three save files behind a title screen; an equipment row of five
labelled slots; a status page; and `roomView`, the per-tick cache the review
asked for.

**Why this order.** DJ's list had saves first. But the equipment row and the
view cache both reshape the delta — one adds `equipped`, the other adds a field
that must *not* be saved. Shipping saves first would have meant a `SCHEMA` bump
within the hour. So the reshaping went first, and the save serialiser was
written against the final shape.

**The transient convention fell out of the cache.** `_view` had to be excluded
from the hash and from the save, and the cleanest rule was the general one:
anything beginning `_` is derived. `toDelta(s)` is one line because of it, and
two size gates that had been measuring `JSON.stringify(s)` started measuring the
save instead — which is what they always meant.

**Where the gates earned their keep.** Eleven fixtures failed, and every one was
right: the sword had moved from the pack to the row, and every test that put a
blade in `carried` or counted the pack's bulk was now describing a different
game. The fist-box comparison failed *twice* — once for the state I had nulled
the weapon on, and again for the second state the gate measured that I had
not. A gate that builds two fixtures needs both updated, and the failure names
which.

**A compile error that was not mine, and was.** `Identifier 'hashState' has
already been declared` — the items suite already imported it on its own line,
added during the 0.5 work I had pulled that morning, and I added it again to
the first import. Reading the top of a file before appending to it would have
cost four seconds.

**The title-confirm rule was rewritten in review.** The first draft's "cancel a
pending delete" condition was three clauses long and wrong in one of them.
"Any other key keeps it" is the rule the screen prints; `frame & ~last` is the
bits that rose this tick, and that is the whole test.

**Not done:** the blasting charge and the Field, both agreed, both next.
`interact.js` is still five questions in one file — the split is planned for
when the charge lands, since it touches the same functions.

---

## 2026-09-24 — v0.6.0 went out red

**Lesson:** a pipe reports the exit status of its last command. `./check.sh |
grep` told the `&&` chain that grep had found something, not that the gates had
passed.

**What.** The release chain was fix → check.sh → commit → tag → push, joined
with `&&` so a failure anywhere would stop it before git. Two things defeated
that. The Python fix ended with a newline rather than `&&`, so its failed assert
did not stop the chain. And `./check.sh 2>&1 | grep -E …` — the grep succeeded,
so the chain continued past a suite that had thrown. The tag landed on a commit
where `tools/test-items.mjs` could not run.

**What was actually broken.** One missing import in one test file. The game was
fine; the browser gates had passed minutes earlier and nothing under `core/`,
`sim/` or `render/` was wrong. That is the only reason this is a patch release
and not a rollback.

**Outcome.** 0.6.1 fixes the import and nothing else. The tag is not moved —
published tags stay put, and a red release is a fact worth keeping in the
history rather than erasing. The release step now judges `check.sh` by its own
exit status (`./check.sh > log; rc=$?`), and the fix step joins the chain with
`&&` like everything after it. The clever one-shot release was the mistake; two
round trips would have cost forty seconds.

---

## 2026-09-25 — the first shove, and the first fixture it fooled

**Lesson:** when a gate measures a displacement, anchor the measurement to the
event, not to the fixture's setup. Everything between setup and event is
somebody else's physics.

**What.** Knockback went in as step 1 of the foe plan: `knock` on weapons,
`weight` on foes, a velocity worked off through `slide()`, `stagger` as the
first real value of a new `mode` field. The arithmetic gate passed at once —
a sword's series sums to 23.5px of 24. The in-sim gate read 17.6px for the
sword and 0.6px for fists, and “the swing does not move you” failed.

**Why.** The fixture placed an *asleep* foe 11px away, inside the hitbox. But
11px is already touching, so on the first tick it woke, bit, and shoved the
player 3px/tick backwards while walking after them. By the time the blade
landed at tick 5, both bodies had moved; the shove then travelled its full
23.5px from *there*. The physics was never wrong. The ruler was in the wrong
place — and the failing assertion about the player moving was the clue, not a
second bug. A five-line tick trace settled it before any code was touched.

**Outcome.** The fixtures record the foe's position on the tick its hp drops
and measure from that, with the bite on cooldown so one thing is measured.
Sword 23.5px, fists 7.5px, weight 3 at 7.5px, rooted at 0, stopped at 13.9px
against masonry, a bite shoves you 11.5px of 12. Eighteen gates, all green,
and the `slammed` flag from `carry()` is sitting there for backlog 12.

---

## 2026-09-25 — the cap, and a page that said “running…”

**Lesson:** a tool that reports nothing until the end reports nothing when it
breaks. Render progress as you go, and a hang names its own location.

**What.** The Blasting Cap went in: item, fuse, a square blast that lingers and
is drawn for exactly the ticks it hurts, rubble to floor as a line of delta per
tile. Nine headless suites green on the first full run after the fixtures were
corrected. The browser page, though, sat at “running…” with no output at all,
through a 90-second virtual budget.

**Why.** A `const bx` in the new blast gate collided with one the swing gate
had declared in the same block. That is a *syntax* error, so the module never
ran a line — no gate, no catch, no window error, nothing to render. The page
only wrote its results at the very end, so it had no way to say so. Chrome's
console had the answer in one line; the page did not.

**Outcome.** `ok()` now renders after every gate, so the last line on the page
is always the last gate that ran. And the cap's fixtures taught two smaller
things worth keeping: a held button is one press (the helper now releases
between presses), and a 28px square around a rubble tile usually catches a
second one — which is the tool working, not the gate failing.
