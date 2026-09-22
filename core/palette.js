// The machine-readable half of design/palette.md, which is normative.
// Seven values are verbatim from barrowlands-tcg/design/tokens.json.

export const P = {
  void:        '#000000',
  pitch:       '#0b0a09',
  umbra:       '#16130f',
  stoneShadow: '#2b2521',
  stoneMid:    '#4a443f',
  stone:       '#736d6a',   // tokens.json elements.stone
  bone:        '#b1afa8',   // the reference tileset's own light tone
  parchment:   '#e5cba6',   // tokens.json elements.flesh.mark
  lanternDeep: '#8a4f08',
  lantern:     '#d77000',   // tokens.json elements.flame.mark
  ember:       '#f0a340',
  rot:         '#a5004c',   // tokens.json elements.rot.mark
  verdigris:   '#3d6b62',   // tokens.json chrome.verdigris
  lichen:      '#8a9472',   // tokens.json chrome.lichen
  spore:       '#77c23a',   // tokens.json chrome.spore
  deep:        '#001d42',   // tokens.json elements.dark.mark
};

// Two-colour remap targets, one pair per stratum. The reference art is a mask;
// these supply its colour. Keyed by era name from core/gen.js.
export const TONES = {
  'Recent':      { light: '#8a7a5e', dark: '#2b2521' },
  'War Dead':    { light: '#7d8470', dark: '#242822' },
  'Imperial':    { light: '#6e7f96', dark: '#1e242e' },
  'Lost Empire': { light: '#8a6b91', dark: '#2a1f2d' },
};

// Discrete falloff, written per-pixel so band edges are exact. Canvas arcs
// anti-alias, which puts a soft ramp back into a design whose whole rule is
// that there is no gradient — design/palette.md, and principle 3 of the TCG
// visual identity spec: light has a source.
//
// THREE bands, with DESCENDING widths (0.52, 0.28, 0.20). Evenly spaced bands
// read as a technical ramp; a wide core falling off into progressively thinner
// rings reads as a flame. `warm` is [r,g,b,alpha] per band, never interpolated.
export const LIGHT_BANDS = [
  { r: 0.52, dark: 0.00, warm: [238, 156,  58, 0.26] },   // ember core
  { r: 0.80, dark: 0.32, warm: [196,  99,   8, 0.11] },   // lantern
  { r: 1.00, dark: 0.74, warm: [124,  68,   6, 0.03] },   // guttering edge
];
// Beyond the lamp is void. A room with no source in it is not dim, it is unlit.
export const LIGHT_BEYOND = 1.0;

// Flicker, at REST. Derived from the simulation tick, never from a wall clock,
// so it is deterministic and replay still reproduces the frame exactly.
// `pulse` breathes the whole radius; `edge` crumbles the outermost boundary per
// pixel, so the lamp's limit gutters rather than the circle throbbing.
//
// These numbers are deliberately near-still. A lamp that visibly flutters reads
// as alarm, and alarm should mean something. Strong flicker is reserved as an
// EFFECT STATE — guttering on low oil, draught near a shaft, disturbance when
// something is close — so that when the light does move, the player looks up.
// See design/palette.md, "Flicker as an effect state".
export const FLICKER = { hz: 1.5, pulse: 0.018, edge: 0.03 };
export const LIGHT_DOWNSCALE = 4;

// The lamp is an EGG, not a disc: pinched behind the player and swelling toward
// whatever they are facing. A carried lantern throws its light where it is
// pointed and the body holding it shades the rest, so a disc was always the
// wrong shape — it read as an aura rather than as something in your hand.
//
// LAMP_BACK is the fraction of full radius that survives directly behind you.
// It is deliberately NOT zero: a delver who cannot see the floor they are
// backing onto is a delver who backs into a wall while running from a dog, and
// the drop-load button is supposed to be the interesting decision, not the
// camera. Three to one, front to back.
export const LAMP_BACK = 0.34;

// cosT is the cosine of the angle between a pixel and the facing direction: 1
// straight ahead, 0 abeam, -1 directly behind. Returns the fraction of the full
// lamp radius that reaches that way, so the outermost band still touches the
// declared radius dead ahead and a gate can still assert that it does.
export const lampShape = (cosT) => LAMP_BACK + (1 - LAMP_BACK) * (1 + cosT) / 2;

export const HUD = { bg: '#0a0908', rule: '#3a332c', text: P.bone, dim: '#6b6357' };
