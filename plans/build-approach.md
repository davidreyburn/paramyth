# Build Approach

*v0.1, 2026-09-22. How to build this given the goals: minimal first, sprawling
by arithmetic, modular without becoming a house of cards, and shipping to a
browser, a local server, and an Android handheld.*

## Stack

**Vanilla ESM, zero dependencies, Canvas2D first.** Not conservatism — it is the
only stack that satisfies the layer contract instead of fighting it, and it is
the one already proven twice in `barrowlands-tcg` and `library-of-babel`.

| Layer | Choice | Why |
|---|---|---|
| Kernel (L0–L4) | Plain ESM, runs in Node **and** browser | One set of modules, headless-testable, the `engine/` pattern |
| Renderer (L5) | Canvas2D → WebGL2 once lighting lands | 640×360 is trivial for Canvas2D; swap behind the L5 interface |
| Server | ~200-line zero-dep Node static server | Copy `tools/serve.mjs` from library-of-babel |
| Packaging | Capacitor | ~3 MB shell + system WebView; total install under 10 MB |
| Editor (anchors only) | Tiled, exporting JSON | Authored anchors need hand-placement; generated tissue does not |

### Ruled out, with reasons

- **Godot.** Excellent 2D and native APK export, but it owns the game loop, which
  breaks `frames-are-log`, and its minimum APK exceeds the entire size budget.
- **A JS framework** (Phaser, Kaplay, Excalibur). Faster on day one, then brings
  a build step and architectural opinions that will fight the layer contract
  within a month.
- **Rust/wasm.** Buys cheap fixed-point determinism, which is a deferred concern,
  and costs iteration speed, which is the thing that matters most now.

## Spike ladder

Three spikes, in order, before any game code. Each one answers a question that
invalidates the plan if the answer is no.

### Spike 0 — desktop browser *(first)*

A page that renders **640×360 integer-scaled**, reads **keyboard and gamepad**
through one normalized frame, runs a **fixed 60 Hz tick**, records a **frame
log**, and asserts that replaying the log reproduces the state exactly.

*Proves:* the render target, the input normalization at L5, and the determinism
kernel — with nothing else in the way. This is also the skeleton every later
phase is built inside, so it is not throwaway.

*Done when:* a recorded log replays to an identical state, and the canvas is
pixel-exact at ×2 and ×3 with no filtering.

### Spike 1 — device over LAN

The same page, served from the dev machine, opened in **Chrome on the Retroid**
at the LAN address.

*Proves:* the Gamepad API sees the Retroid's physical controls; integer scaling
is genuinely unfiltered on the panel; and a battery figure for 30 minutes at
60 Hz.

### Spike 2 — Capacitor APK

*Proves:* the Gamepad API works through the **Android System WebView**, which is
not the same runtime as Chrome-on-Android and is configured differently. Also
proves asset loading from the bundle and cold-start time.

If gamepad input fails at Spike 2 but worked at Spike 1, the answer is a
Capacitor plugin bridging native input — a contained problem, but one worth
discovering before there is a game attached to it.

## The dev loop

**Do not rebuild an APK to test.** Run the dev server on the workstation, open
the LAN IP in a browser on the handheld, iterate in seconds against real hardware
and real controls. Capacitor packaging becomes a release step, not a dev loop.
This is the single highest-leverage decision in this document.

```
npm start                 # zero-dep static server, prints the LAN URL
# workstation: localhost — handheld: http://<lan-ip>:PORT
```

## Order of construction

Headless before rendered. The kernel runs in Node with no renderer at all, so the
world generator, items, chains, bulk and the tick are all fuzz-tested and
replay-tested before a single pixel exists. This is why the TCG engine is solid
and it is the pattern to repeat.

1. **Kernel** — L0 address algebra, L3 delta, `apply`, tick, frame log. Headless.
2. **World** — mausoleum generation reading depth and region. **Plus the atlas
   debug view**, built here and not later, because it is the only thing that
   catches a generator blind to a dimension.
3. **Items and marks** — L1/L2, mark derivation, part-based sprite composition,
   bulk and encumbrance. Art becomes load-bearing at this step and not before.
4. **The loop** — appraiser, quartermaster, stash, extraction, sell.
5. **Threat** — two enemies, three tools, damage, fragility, death, corpse.

Steps 1–3 carry the risk. Step 4 is where `slice-01.md`'s question gets answered.

## Gates, from day one

An afternoon now; nearly impossible to retrofit once there are twelve systems.

| Gate | Asserts |
|---|---|
| `replay` | seed + frame log → identical delta |
| `purity` | `world(address)` recomputes identically across processes |
| `layers` | no import to a higher layer; **no L4↔L4 edge** |
| `deletable` | build without `systems/combat/` boots, walks, loots, sells |
| `coverage` | every act verb and mark type fires across the fuzz corpus |
| `solvable` | sampled runs contain ≥1 fully reachable resolvable actor |
| `storage` | a session that takes nothing grows the save by ~0 |
| `constants` | paired constants bound by assertions |
| `perf` | sustained 60 Hz on device, with a battery figure |

`layers` is a grep and it is the only mechanical thing standing between this
project and the failure mode the layer contract exists to prevent.

## The headless twin

Build the sim runner early. A policy that plays a full run — walk, loot, triage,
extract — lets bulk budget, mark rarity, appraisal fees and price curves be tuned
across thousands of iterations before a human plays.

Carry the TCG's discipline with it: **the numbers are biased, only relative
shifts across conditions are trustworthy, and sim informs while the table
decides.** A/B tests run in scratch copies of the kernel, not in the repo.

## Graphics

**The conclusion first: invest in the lighting model, and use placeholder sprites
for months.**

In a lightless underworld on an AMOLED panel with true blacks, the lighting *is*
the visual identity. A warm lantern falloff against actual `#000`, with wall
occlusion, reads as atmospheric and expensive with programmer art underneath it.
The inverse — good sprites under flat lighting — reads as a mobile game. One of
those costs a shader pass; the other costs a year. This is also the real reason
to move to WebGL2: not throughput, the light pass.

**Phases 1–2: colored rectangles.** No art is needed to prove a generator does
not tile along an axis.

### Placeholder sources

| Need | Source | License |
|---|---|---|
| Tiles, character, props | [Kenney](https://kenney.nl) top-down / roguelike packs, 16×16 | CC0, unambiguous |
| Dark-palette alternative | 1-bit and 2-bit dungeon packs on itch.io | Varies — check |
| Item sprite density | Dungeon Crawl Stone Soup tileset — hundreds of weapons, armor, jewelry at 32×32 | Largely CC0; **check the license file per directory**, contributions vary |

### Items are composed, not drawn

The part system is under test from Phase 3, so it is not placeholder work. The
budget math is why it is worth building properly:

```
 ~15 base forms        blade · hilt · band · buckle · vessel · plate · haft …
×  5 material palettes bronze · iron · silver · bone · stone   (recolor, not art)
×  ~8 mark overlays    stamp · stain · grave-dirt · repair seam · scoured panel · heraldry …
= hundreds of distinct, readable items from ~25 small drawings
```

Palette-swapping at this resolution is trivial — index the sprites and swap in a
shader, or pre-bake at load. The item atlas stays tiny no matter how many kinds
ship, which is the "every megabyte earned" answer for art.

### Palette and tooling

Pick a **constrained ~16-colour palette early**, bottoming out at true black. It
is an identity choice, a compression win, and it makes palette-swapping coherent.
What the game wants is a warm lantern range and a cold deep range that both floor
at `#000`. Lospec has thousands of CC0 palettes worth browsing.

Aseprite (exports spritesheets plus JSON) or LibreSprite for the free fork.

## Repository

`paramyth/` is not yet a git repository. Initialize before the kernel lands, so
frame-log-as-bug-report has somewhere to live.

Planned shape, with future repo boundaries drawn where they would fall:

```
paramyth/
├── core/        L0–L2. Pure. Zero deps. Runs in Node and browser
├── sim/         L3 delta, apply, tick, frame log
├── systems/     L4. One directory per system. Each deletable
├── render/      L5. Canvas2D now, WebGL2 later. Reads everything, changes nothing
├── app/         the page, the input binding, the shell
├── tools/       serve.mjs, atlas, lints, the headless twin
├── design/      game design
├── specs/       normative
└── plans/       scheduled work
```
