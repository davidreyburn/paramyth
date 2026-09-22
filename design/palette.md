# Palette

*v0.1, 2026-09-22. Derived from `barrowlands-tcg/design/tokens.json` — the
canonical source — and re-anchored for an emissive dark screen.*

## Why it has to be derived rather than reused

The TCG palette is normative and it is correct for what it does: **dark ink on
parchment**, gated at 3:1 contrast on a light card face, optimised for
perceptual separation *on the channel that prints*. Its whole tuning problem was
five bars fitting in a ~48-wide lightness window capped near L\*58.

This game is the inverse: **emissive light on true black**, on an AMOLED panel
where unlit pixels are off. Reusing the card hexes directly would put
parchment-bright values on a screen whose entire premise is darkness.

So the identity carries over and the anchoring does not. What transfers:

- **The five element hues**, as the identity axis. Flame, Flesh, Rot, Darkness,
  Stone keep their meaning and roughly their hue; they change role from *ink* to
  *light and tone*.
- **Principle 3, verbatim and load-bearing**: *"Light has a source. No ambient
  glow, no decorative gradient."* That was an art-direction rule for card
  illustration. Here it is the **rendering law** — it is the argument for banded,
  source-anchored, pixel-quantised light and against the smooth radial gradient
  the first build shipped.
- **Principle 4**: *"Damage is erosion before it is gore."* Wear and things worn
  smooth. This is what the two-tone tileset does natively.

## The palette — 16 colours

Seven values are lifted **verbatim** from `tokens.json`, so element identity is
traceable rather than re-invented.

| # | name | hex | role | source |
|---|---|---|---|---|
| 0 | `void` | `#000000` | unlit. The AMOLED floor, pixels off | — |
| 1 | `pitch` | `#0b0a09` | barely-lit stone | — |
| 2 | `umbra` | `#16130f` | floor at the edge of the lamp | — |
| 3 | `stoneShadow` | `#2b2521` | masonry in shadow | Stone, darkened |
| 4 | `stoneMid` | `#4a443f` | masonry, mid | Stone, darkened |
| 5 | `stone` | `#736d6a` | **masonry lit** | **`elements.stone` verbatim** |
| 6 | `bone` | `#b1afa8` | the tileset's own light tone — kept | tileset |
| 7 | `parchment` | `#e5cba6` | player, bone, paper, the brightest surface | **`elements.flesh.mark` verbatim** |
| 8 | `lanternDeep` | `#8a4f08` | the lamp's outer falloff | Flame, prior revision |
| 9 | `lantern` | `#d77000` | **the lamp** | **`elements.flame.mark` verbatim** |
| 10 | `ember` | `#f0a340` | the hottest core, and only there | Flame, lightened |
| 11 | `rot` | `#a5004c` | corruption, infected flesh, ichor | **`elements.rot.mark` verbatim** |
| 12 | `verdigris` | `#3d6b62` | damp, oxidised bronze, standing water | **`chrome.verdigris` verbatim** |
| 13 | `lichen` | `#8a9472` | growth on old stone | **`chrome.lichen` verbatim** |
| 14 | `spore` | `#77c23a` | fungal light — the **only** cold-bright | **`chrome.spore` verbatim** |
| 15 | `deep` | `#001d42` | the Fundament, and true depth | **`elements.dark.mark` verbatim** |

### Rules of use

1. **`void` is the default state of the screen.** Everything visible is an
   exception to darkness, and the lamp is what makes the exception.
2. **`spore` is the only cold-bright value.** Its scarcity is what makes fungal
   light read as *wrong*. Never use it for UI.
3. **`ember` only at a source.** Not as a highlight, not as an accent.
4. **`rot` never tints stone.** It belongs to flesh, ichor and growth. Rot-touched
   *architecture* reads as `lichen` over `stoneShadow`, because the corruption in
   this setting colonises rather than stains.
5. **HUD uses only 1–7.** The interface is never mistaken for a light source.

## Region toning — the two-tone remap

The reference tileset is genuinely two-tone: exactly `#b1afa8` light, `#312f28`
dark, and transparent. That makes region flavour a **two-colour remap**, not a
tint wash — the art is a mask, and each stratum supplies its own pair.

| Stratum | light | dark | reads as |
|---|---|---|---|
| Field / Recent | `#8a7a5e` | `#2b2521` | dry dust, sun-bleached masonry |
| War Dead | `#7d8470` | `#242822` | damp, lichen-touched, cold |
| Imperial | `#6e7f96` | `#1e242e` | cut granite, blue-grey, deliberate |
| Lost Empire | `#8a6b91` | `#2a1f2d` | wrong colour for stone. Dormant, not ruined |
| Rot-touched *(overlay)* | `#8a9472` | `#221f16` | colonised |

Each pair is a hue from the palette above at two lightnesses, so the strata stay
inside one colour world while remaining instantly distinguishable — which is what
the atlas needed and did not have on its first run.

Toning is applied once per pack-and-tone at load and cached. Cost is one pass
over a 440×280 sheet per tone: about 123k pixels, a few milliseconds, never
repeated.

## Lighting

Principle 3 becomes a rendering law:

- The light buffer renders at **¼ resolution (160×80)** and upscales with nearest
  neighbour, so light has the same pixel grid as everything else.
- Falloff is **6 discrete bands with hard edges**, drawn as annuli. No gradient
  anywhere in the pipeline.
- Light is always at a source: a carried lamp, a torch, a rune, spore-bloom. No
  ambient term, ever. A room with no source in it is `void`.

## Flicker as an effect state

The resting lamp is **near-still**: 1.5 Hz, 1.8% radius pulse, 3% edge crumble.
A first pass at 4 Hz with 5%/7% read as *alarming* — and that is the finding
worth keeping, because it means visible flicker is a strong signal and should
not be spent on the default state.

So flicker is reserved as an **effect state**, raised deliberately:

| State | Cause | Reads as |
|---|---|---|
| *rest* | nothing — the shipped default | steady, barely alive |
| *guttering* | low oil, a damaged lamp | you are about to be in the dark |
| *draught* | near a shaft, a chasm, an open gate | there is air moving, and somewhere it comes from |
| *disturbed* | something close, not yet seen | look up |

None of these are implemented, and they are deliberately **not** in
`core/palette.js` — shipping unreachable data is how the era table ended up with
four dead archetype generators (`case-study-log.md`, 2026-09-22). They land with
the system that drives them: oil with the economy, draught with the world,
disturbance with `encounters`.

Flicker derives from the **simulation tick**, never a wall clock, so it is
deterministic and replay reproduces the frame exactly. That is gated.

## Open

- **Dithered transition bands.** A checkerboard between two light bands would read
  as more authentically retro than a hard step. Cheap, and worth trying once the
  bands are in.
- **Coloured light sources.** The lamp is `lantern`; spore-bloom should be
  `spore` and a rune `deep`. This wants the light buffer to be RGB rather than
  alpha-only, which it is not yet.
- **Contrast gate.** The TCG has `tools/contrast-check.mjs`. An equivalent here
  would assert HUD text clears a legibility threshold against `#0a0908`, and that
  the four stratum light-tones are mutually distinguishable at the measured ΔE
  the atlas actually needs.
