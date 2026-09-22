# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Pre-1.0, so the surface is unstable: MINOR covers new systems and world-shape
changes, PATCH covers fixes and tuning. **1.0.0 is a shippable game — Act I
entire.** See `plans/roadmap.md`.

## [Unreleased]

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
