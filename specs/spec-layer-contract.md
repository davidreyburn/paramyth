---
templateVersion: 2.0.0
id: spec-layer-contract
title: The Layer Contract
version: 0.1.0
status: draft
summary: >
  The architectural kernel for Paramyth: a world that is a pure function of its
  address, a single mutation chokepoint, perception as redaction, and a strict
  downward-only dependency order across six layers. Its purpose is to make
  systems addable and removable indefinitely without the accumulated structure
  becoming load-bearing on itself.
category: architecture
controlBoundary: internal
mode: normative
created: 2026-09-22
updated: 2026-09-22
author: David Reyburn
contributors: []
maintainer: David Reyburn
provenance:
  workflow: >
    Extracted from two working systems before being written down. The pure
    address-to-content generator and its CPU/GPU conformance discipline come
    from library-of-babel (LIB-G-001, LIB-G-020). The apply / legalActions /
    viewFor separation, the seed-plus-log game identity, and the coverage
    instrumentation requirement come from barrowlands-tcg, where each was
    already load-bearing in a shipped engine. This spec generalizes both to a
    real-time game and adds the dependency-direction rule, which is the only
    genuinely new clause.
tags: [architecture, procedural, determinism, modularity]
relationships:
  - { type: generalizes, target: spec-web-game-engine }
prose: markdown

constraints:
  must:
    - The world MUST be a pure function of (seed, address). Two callers at the same address, at any time, on any device, MUST compute the same result.
    - All mutation MUST pass through apply(delta, action). No system may write delta directly.
    - All perception MUST pass through viewFor(delta, actor). What an actor knows is derived, never separately stored.
    - A layer MAY read layers strictly below it. A layer MUST NOT read a layer above it, and an L4 system MUST NOT read another L4 system.
    - Every L4 system MUST be deletable — with it removed, the game still boots, loads, plays and saves.
    - The simulation MUST advance on a fixed timestep, and the ordered sequence of input frames MUST be sufficient, with the seed, to reconstruct the delta exactly.
    - Every scripted effect MUST carry an instrumentation marker and appear in the coverage enumeration.
    - Any two constants that must agree MUST be bound by an assertion that fails when they diverge.
  mustNot:
    - Generated world content MUST NOT be persisted. The delta records what play changed, never what generation produced.
    - No system MUST NOT consult wall-clock time, an unseeded RNG, device locale, or frame duration inside the simulation path.
    - A generator function MUST NOT omit a dimension along which its output is required to vary.
    - Content MUST NOT be expressed as code where a data table would serve.

validation:
  invariants:
    - "purity: for a fixed seed, world(address) is referentially transparent — assertable by recomputation, and by a second implementation if one exists"
    - "replay: seed + frame log replays to a byte-identical delta on the same build and device"
    - "acyclic: the module import graph contains no edge from a layer to a higher layer, and no edge between two L4 systems — grep-able, and gated in CI"
    - "deletable: for each L4 system, a build with that system's directory removed still passes the smoke gate"
    - "coverage: every marker in the effects enumeration fires at least once across the fuzz corpus"
    - "storage: save size is bounded by play performed, not by world explored — a long walk that changes nothing grows the save by nothing"
  failureModes:
    - "Sideways read. Two L4 systems start consulting each other's state and within a few weeks neither can be removed. This is the single failure this document exists to prevent; it is invisible in review and obvious in a lint."
    - "Caching generation into the save. Begins as a defensible optimization for one expensive site and ends with the world materialized, at which point regenerating anything is a migration. LIB-G-001 in library-of-babel forbids this outright and the prohibition is load-bearing there for the same reason it is here."
    - "Uninstrumented effect. A scripted branch with no marker is invisible to coverage, so content that never fires looks identical to content that works. This shipped a dead card in barrowlands-tcg (the Mass Grave incident) and is the origin of the instrumentation clause."
    - "Generator blind to a dimension. In library-of-babel, cellType was a function of (q,r) and could not see the floor, so every reading room stood in a column running the full height of the Library — correct-looking at every single address and structurally wrong. A procedural world tiles along any axis its generator cannot see, and no amount of local inspection reveals it. Only a view of the whole did."
    - "Unbound constants. A vertex gained a float, STRIDE followed, the vertex count did not, and the atlas drew nothing on every Metal machine for weeks while looking perfect on the one it was written on. Constants that must agree and are not held together by an assertion will diverge, and the divergence will be visible only on hardware you do not own."
    - "Float drift across devices. Replay across an x86 desktop and an ARM handheld is not guaranteed by this spec. Per-device replay is; cross-device replay requires fixed-point arithmetic in the simulation path and is deliberately deferred."
---

# The Layer Contract

## Kernel

### Thesis

A world that can keep growing is one where every part of it can be removed.
Achieved by four rules: the world is computed, not stored; all change goes
through one function; all knowing goes through another; and dependencies point
strictly downward.

### Definitions

- **Seed** — the single integer from which a world is derived. Two worlds with
  the same seed are the same world.
- **Address** — a coordinate naming a place, an object, or a person. Addresses
  are total: every address names something, and nothing needs to exist before
  it is addressed.
- **World** — the pure function `(seed, address) → content`. Infinite, immutable,
  costs nothing to store because it is not stored.
- **Delta** — the only mutable state: what play has changed. What was taken,
  who died, what is known, where the player stands. Absent a delta entry, the
  world's own answer stands.
- **Frame** — one fixed-timestep quantum of input. The ordered frame log is the
  record of a playthrough.
- **System** — a unit of game behavior at L4. Reads downward, emits actions,
  owns no state of its own outside the delta.
- **View** — `viewFor(delta, actor)`, the redacted world as one actor can
  perceive it. Not a copy, not a cache: a projection computed on demand.

### Principles

1. **Computed world** (`pure-world`). The world is a function, not a database.
   *Rationale: an infinite world costs the same as a small one, saves stay in
   kilobytes, and any address can be reached without a load. The moment
   generation is cached into the save, none of those hold.*

2. **One chokepoint** (`one-apply`). Every mutation is an action applied by a
   single function. *Rationale: one place to log, one place to validate, one
   place to replay. Systems that write state directly cannot be replayed,
   cannot be tested in isolation, and cannot be deleted.*

3. **Perception is redaction** (`view-redacts`). What an actor knows is derived
   from the delta, never stored beside it. *Rationale: build-gated lore is
   exactly hidden-information redaction. An item's chain always exists in full;
   a Cave Wretch and a Blighted Scholar are two projections of it. Storing
   per-actor knowledge separately means two sources of truth and eventual
   disagreement.*

4. **Downward only** (`downward-only`). A layer reads below it. Never above,
   never sideways. *Rationale: this is the whole anti-fragility claim. Cyclic
   dependency is how a system becomes unremovable, and it always arrives as a
   small reasonable convenience.*

5. **Deletable** (`deletable`). Every L4 system can be removed with the game
   still playable. *Rationale: the test is cheap, mechanical, and it is the only
   reliable detector of a system that has quietly become infrastructure. A
   module that cannot be deleted is not a module; it belongs below L4 and must
   justify itself there.*

6. **Frames are the log** (`frames-are-log`). Seed plus input frames
   reconstructs the delta. *Rationale: preserves the seed-plus-log identity
   through real-time action. Bug reports are frame logs. Saves are tiny.*

7. **Instrumented** (`instrumented`). Every scripted effect is marked and
   enumerable. *Rationale: without it, dead content and working content are
   indistinguishable. See the Mass Grave incident.*

8. **Content is data** (`content-is-data`). Items, sites, tools, enemies and
   text are tables the kernel interprets. *Rationale: content added as code
   grows the kernel; content added as data does not. The kernel should stop
   growing early and stay stopped.*

### Mechanism

**State.** `{ seed, delta, frameIndex }`. Nothing else persists. The world is
recomputed from `seed`; presentation is recomputed from the view; every other
quantity is derived.

**The layers.**

```
L0  Address algebra   seed → hashes, noise, coordinate math. No state at all.
L1  Entities          site / item / actor as pure functions of address
L2  Provenance        chains and the actor graph; a pure function of L1
L3  Delta             the only mutable thing — space, bodies, taken, known, dead
L4  Systems           salvage · economy · combat · tools · encounters · language …
L5  Presentation      renderer, UI, audio, input binding
```

**Steps** — one tick:

1. **Sample.** The input layer produces one frame: a normalized verb set, never
   raw device events. Keyboard, gamepad and virtual stick all reduce to the
   same frame, so the binding is L5 and the frame is canonical.
2. **Append.** The frame is appended to the log. This is the save.
3. **Propose.** Each L4 system reads the view it needs from L0–L3 and returns
   zero or more actions. Systems run in a declared fixed order. A system may
   not observe another system's proposals.
4. **Apply.** `apply(delta, action)` folds every proposed action into the delta,
   in order. This is the only writer in the program.
5. **Project.** `viewFor(delta, actor)` is computed for whoever needs to see —
   the player for rendering, an AI for deciding. Views are never retained
   between ticks.
6. **Present.** L5 draws the view. L5 may read anything and change nothing.

**Termination.** Step 6 is a loop, not a destination. The simulation has no
end state; a run ends, a world does not.

**Edge cases.**

- *A system needs another system's result.* It does not get it. Either the
  producing system writes a fact into the delta and the consumer reads that, or
  the dependency is real and one of them is misplaced. The delta is the only
  legal channel between siblings.
- *Generation is expensive at some address.* Cache it in memory, keyed by
  address, evictable, never written to the save. A cache the save can see is a
  cache that has become the world.
- *A system needs randomness.* It derives it from `(seed, address, frameIndex)`.
  There is no other source.
- *A tool changes the world permanently — a blown wall.* That is a delta entry
  at an address. The world still computes the intact wall; the delta overrides
  it. Every permanent change is an override, never an edit.

### Canonical example

*Adding Language Deciphering as an L4 system — traced to show the contract
doing its work.*

**Setup.** The game ships without it. Inscriptions render as untranslated
glyphs. A player finds a funerary stele in the Outer Mausoleum bearing the name
of the man whose sword they are carrying, and cannot read it.

**Trace:**

1. The stele's text already exists — `L2.chain(item)` yields the actor, and the
   actor yields a name. The system invents no content; it changes what is
   *visible*, which makes it a perception feature, not a content feature.
2. The new system `systems/language/` reads L1 (what the glyphs are), L2 (what
   they say) and L3 (which scripts the player has learned). It reads no other
   L4 system. In particular it does not ask `economy` what the stele is worth,
   even though an appraiser plainly would want to know.
3. It proposes one action: `LEARN_GLYPH(script, glyph)`. `apply` folds it into
   the delta as three bytes.
4. `viewFor` now renders that glyph as a letter for this actor and as a glyph
   for every other. No second store of player knowledge exists.
5. The economy system, wanting the appraisal bonus for a legible inscription,
   does not call `language`. It reads `delta.knownGlyphs` — a fact in the
   delta — and computes its own answer. The two systems never meet.
6. Deleting `systems/language/` leaves `delta.knownGlyphs` as an ignored field.
   The game boots, the stele renders as glyphs, the appraisal bonus never
   applies, and nothing throws.

**Result.** A system that adds a progression axis, a new information economy
and a reason to revisit sites, in one directory, reading three layers, writing
three bytes, and removable without a trace. That is the contract holding. Had
step 5 been a call into `language`, both systems would now be permanent.

## Constraints (tradeoffs deliberately accepted)

- **Per-device replay, not cross-device.** Cost: a frame log from the handheld
  will not replay bit-identically on the desktop. Rationale: fixed-point
  arithmetic through the whole movement and collision path is a real tax on
  development speed and on the feel of the game, paid up front against a
  benefit that only matters if frame logs are ever exchanged between machines.
  *Reopens if:* LAN play needs authoritative replay, or bug reports start
  arriving from devices that cannot reproduce them.

- **Systems cannot see each other, even when it would be convenient.** Cost:
  genuine cross-system features route through the delta, which is more verbose
  and occasionally feels absurd. Rationale: the verbosity is the price of
  deletability, and it is paid in small amounts continuously rather than in one
  large amount later.

- **Content as data means an interpreter.** Cost: an item table that can
  express behavior needs a small evaluator, and evaluators grow. Rationale:
  bounded growth in one place beats unbounded growth everywhere. *Watch for:*
  the evaluator acquiring control flow. That is the signal it has become a
  language, at which point the trade should be re-argued.

- **Fixed timestep.** Cost: rendering and simulation decouple, requiring
  interpolation for smooth motion at non-multiple refresh rates. Rationale:
  determinism is unobtainable without it, and frame-rate-dependent physics on
  Android is a defect generator regardless.

## Applicability

**Requires:** a world large enough that storing it is worse than computing it;
a desire to add systems over a long period; and enough discipline to run the
lint, because the rule is unenforceable by good intentions.

**Contraindications:** a small authored world, where generation is strictly
worse than placement. A game whose content is mostly hand-made set pieces —
those are data, but their relationships are not, and forcing them through an
address algebra buys nothing. Any project that will ship once and never be
extended: the contract's entire return is on future additions, and it charges
its premium immediately.

## Bindings

| Abstract role | library-of-babel (proven) | barrowlands-tcg (proven) | Paramyth (this spec) |
|---|---|---|---|
| Pure world | `address → index → base-25 expansion` | card definitions | `(seed, address) → site / item / actor` |
| Mutation chokepoint | *(none — read-only world)* | `apply(state, action)` | `apply(delta, action)` |
| Perception | *(none — total visibility)* | `viewFor(state, seat)` | `viewFor(delta, actor)` — also the build-gated lore |
| Identity of a playthrough | route + step index | seed + action log | seed + frame log |
| Second implementation | GLSL port, conformance-gated | web engine snapshot, parity-gated | *(none yet — see roadmap)* |
| Dead-content detector | 57 gates | coverage: 47/47 effects | coverage enumeration |
| Whole-shape view | `babel-atlas.html` | `sim.js stats` | *(unbuilt — and the column bug argues it should be)* |
