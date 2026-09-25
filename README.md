# Paramyth

A salvage game in the Barrowlands. You are a Worker arriving at a camp above a
mausoleum-continent of tombs; you go down, you take what you can carry, and the
whole game is deciding what that is.

Top-down, 640×360, physical controls first, **zero dependencies**.

```sh
npm start              # http://localhost:3140 — the LAN URL is printed too
./check.sh             # every headless gate, stopping at the first failure
```

Nothing to build and nothing to install. Node 18+.

## The idea

Sprawl by arithmetic, not by accretion. The world is a **pure function of its
address** — rooms, items, their histories — so it costs nothing to store and a
save is a seed plus a list of what play changed. A ten-hour session that takes
nothing grows the save by nothing.

Every object carries a **provenance chain** you mostly cannot read. What it is
worth depends on whose it was, and finding that out costs coin, time, or the
right eyes. That is why sorting a pile of junk is a decision rather than a chore.

Design lives in `design/`; `specs/spec-layer-contract.md` is the constitution.

## Layout

| Path | What it is |
|---|---|
| `core/` | **L0–L2.** Address algebra, the world, items, palette. Pure; runs in Node and the browser |
| `sim/` | **L3.** The delta, `apply`, the fixed-timestep tick, the frame log |
| `render/` | **L5.** Canvas2D, the tile pack, the light pass. Reads everything, changes nothing |
| `app/` | The page, the input binding, the loop |
| `assets/packs/` | Tile pack manifests — **the art swap point**; the game runs without one |
| `tools/` | Server, gates, and the browser tools below |
| `design/` · `specs/` · `plans/` | Game design · normative specs · scheduled work |
| `case-study-log.md` | Every notable decision: what · why · evidence · outcome |

## Tools

With `npm start` running:

| Page | For |
|---|---|
| `/` | The game |
| `/tools/atlas.html` | Floor topology by site and depth — the whole-shape view |
| `/tools/tile-mapper.html` | Assign sheet cells to tile types, with a live lit room preview |
| `/tools/tileset-sheet.html` | Contact sheet with grid coordinates (`?sheet=decor&scale=5`) |
| `/tools/icon-preview.html` | Every item icon per stratum, drawn through the pack screen's path |
| `/tools/telegraph.html` | The dog in every mode, through the real renderer, cropped (`?scale=4`) |
| `/tools/pagecheck.html` | The browser gates |

## Gates

`./check.sh` runs five headless suites; two more need a browser and it says so
when it finishes, because a gate nobody is reminded of is a gate nobody runs.

The load-bearing ones: **replay** (seed + frame log reproduces the state
exactly), **purity** (an address always yields the same room), **no isolated
interior walls**, **every stair down is answered by a stair up below**, **every
doorway and stair stays reachable**, and **the toast predicts what the button
does**.

Some gates are deliberately *measurements* rather than requirements — loot
behind an obstruction and sealed floor are content, not defects, because
boulder-breaking and tunnelling tools are coming. See "Obstruction is content"
in `design/world-shape.md`.

## Art

`assets/packs/onebit.json` is the swap point: sheets, tile size and grid
references are all data, and a build with no pack falls back to flat colour and
still runs.

**The 1-bit reference set in `inbox/` is unlicensed placeholder art.** It is here
to develop against and must be replaced or cleared before anything ships. The
Dungeon Crawl Stone Soup tiles are CC0 and are *not* committed — see
`.gitignore`.

## Versioning

Semver. Pre-1.0, so the public surface is not yet stable: **MINOR** for new
systems or world-shape changes, **PATCH** for fixes and tuning. The version lives
in `core/version.js`, `package.json` must match it, and a gate checks.

**1.0.0 means a shippable game** — at minimum the whole of Act I: the Field, the
mausoleums, the upper Barrow Deep, and the Company Camp, Grimhaven and Ashmark
above them, with the loop closed end to end and no placeholder art left in it.
`plans/roadmap.md` lists what stands between here and there. It is a long way.
