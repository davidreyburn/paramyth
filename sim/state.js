// L3: the delta. The only mutable thing in the program.
// Positions are integers in subpixel UNITS, never floats — so the whole
// movement path is exact arithmetic and replay holds on any device.

import { roomTiles, floorPlan, FIELD_CAMP, groundTile, COLS, ROWS, TILE, T } from '../core/gen.js';

export const UNITS = 256;
export const px = (u) => u / UNITS;

// "a bar of a dozen or so points" — design/combat-and-tools.md
export const MAX_HP = 12;

// The lamp swings round with you rather than snapping between four directions.
// The angle is INTEGER brads — 1024 to a full turn — because it is delta, and
// the simulation path stays in exact arithmetic. The renderer turns it into a
// vector; nothing in the simulation ever needs a cosine.
//
// This belongs in the delta and not in the renderer. Easing it per draw call
// would make two draws of the same state differ, which the "rendering is
// deterministic for a fixed state" gate exists to forbid — and it would come
// apart entirely at the 120 Hz render option, where draws outnumber ticks.
export const LAMP_BRADS = 1024;
export const LAMP_AIM = [768, 0, 256, 512];   // facing N E S W, screen y-down
export const LAMP_TURN = 32;                  // brads per tick: a right angle in 8

// Render-side only: the one place a float is allowed near the lamp.
export const lampVec = (dir) => {
  const a = (dir / LAMP_BRADS) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
};

// One tick of turn, the short way round, so spinning from west to north sweeps
// a quarter turn rather than three quarters.
export function lampStep(cur, facing) {
  const half = LAMP_BRADS / 2;
  const target = LAMP_AIM[facing] ?? cur;
  const diff = (((target - cur) % LAMP_BRADS) + LAMP_BRADS + half) % LAMP_BRADS - half;
  if (diff === 0) return cur;
  const step = diff > 0 ? Math.min(diff, LAMP_TURN) : Math.max(diff, -LAMP_TURN);
  return (cur + step + LAMP_BRADS) % LAMP_BRADS;
}

// A blow in flight. These live here, in L3, because `s.swing` is delta and its
// phase is a pure function of the delta — not of any system. Putting them in
// systems/combat/ would have forced step.js to read upward to slow a swinging
// player down, which is the exact edge the layer contract forbids.
export const WINDUP = 6, ACTIVE = 6, RECOVER = 10;
export const SWING_TICKS = WINDUP + ACTIVE + RECOVER;
export const HURT_INVULN = 30;          // ticks of grace after taking a hit
// What a bite's shove is divided by. Armor will add to this; today you are a
// dog's equal, which is the reference the dog's `knock` was tuned against.
export const PLAYER_WEIGHT = 1;

// How long a spoken line stays on the glass. It is delta and not a render-side
// timer so that a replay says the same things at the same ticks.
export const SAY_TICKS = 100;
// Two effects, both a tick stamped in the delta and a draw that is a pure
// function of it — because the renderer may not touch the clock.
export const FADE_TICKS = 18;           // the dithered fade after a change of floor
export const POP_TICKS = 10;            // a slain foe's bubble, expanding and breaking
export const saying = (s) => (s.say && s.tick - s.say.at < SAY_TICKS) ? s.say : null;

// Above ground. The surface is DAYLIT: the Field, the camp, Grimhaven, Ashmark.
// A lantern is for underground, and a hub you have to squint at is a hub that
// makes selling a haul feel like another delve.
export const surface = (s) => s.floor < 0;

// Where steel stays sheathed: the camp, and only the camp. The Field around it
// is surface and emphatically not friendly. Day does not mean safe.
export const friendly = (s) => s.floor < 0 && s.room === FIELD_CAMP;

export const swingPhase = (s) => {
  if (!s.swing) return null;
  const t = s.tick - s.swing.at;
  if (t < WINDUP) return 'windup';
  if (t < WINDUP + ACTIVE) return 'active';
  if (t < SWING_TICKS) return 'recover';
  return null;
};

export function spawnIn(seed, site, floor, room) {
  const { grid, reach } = roomTiles(seed, site, floor, room);
  const cx = COLS >> 1, cy = ROWS >> 1;
  for (let r = 0; r < Math.max(COLS, ROWS); r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 1 || y < 1 || x >= COLS-1 || y >= ROWS-1) continue;
      if (groundTile(grid[y*COLS + x]) && reach[y*COLS + x])
        return { x: (x*TILE + TILE/2) * UNITS, y: (y*TILE + TILE/2) * UNITS };
    }
  }
  return { x: cx*TILE*UNITS, y: cy*TILE*UNITS };
}

export function createState(seed) {
  seed = seed >>> 0;
  // You start in the camp, above the mausoleum, as the campaign itself begins.
  const site = 0, floor = -1;
  const room = 0;
  const p = spawnIn(seed, site, floor, room);
  return {
    seed, tick: 0,
    site, floor, room,
    x: p.x, y: p.y,
    vx: 0, vy: 0,      // a shove in flight; see space.js carry()
    facing: 2, moving: false,
    lamp: 112 * UNITS,
    lampDir: LAMP_AIM[2],   // the lamp starts pointing where you do: south
    lastFrame: 0,
    moves: 0,          // room transitions, so the HUD can show progress
    scrap: 0,          // the only currency
    // Stats. Insight is the eye, Lore is the education; a Worker starts able
    // to see that a thing is marked but not to read what the marks say.
    stats: { might: 1, swift: 1, vigor: 1, lore: 0, insight: 1, charm: 1 },
    // The body. Health is small and legible and does not regenerate in the
    // field, per design/combat-and-tools.md. `hurtAt` is the tick of the last
    // hit taken, which is the whole invulnerability rule.
    hp: MAX_HP, hurtAt: -9999,
    swing: null,       // { at, dir, hit: [] } while a blow is in flight
    say: null,         // { text, at } — a transient line, not a log
    arrivedAt: -FADE_TICKS,   // tick of the last change of floor; the fade is drawn from it
    pops: [],          // { x, y, at, kind } where something just died
    foes: [],          // live enemies in THIS room, rebuilt on entry
    slain: [],         // ids of the dead — the only durable fact about them
    stash: [],         // item refs left in camp
    // You start ARMED. It is dangerous out there (DJ, 2026-09-22), and a first
    // delve that begins by hunting for a weapon is a tutorial, not an opening.
    // The blade still costs three of your twenty bulk, so the decision it poses
    // is whether to put it DOWN — which is the more interesting question anyway.
    carried: [],
    // The equipment row. Five labelled slots; what is in them is worn or
    // wielded and still counts against bulk.
    // The Company issues a blade and one Blasting Cap. The cap is how the
    // first rubble you meet becomes content instead of a wall.
    equipped: { weapon: { kind: 'sword', key: 'issue:0:0:0' }, tool: { kind: 'bcap', key: 'issue:0:0:1' }, armor: null, helm: null, accessory: null },
    charges: [],       // caps set and fusing: { kind, key, site, floor, room, x, y, at }
    blasts: [],        // detonations still lingering: { x, y, r, at, ..., hit: [] }
    broken: [],        // rubble made floor, as `site:floor:room:tile` — the world changed, recorded
    scars: [],         // where furniture was blasted, same shape: the floor, remembered
    deaths: 0,
    known: [],         // keys whose record has been read
    taken: [],         // keys of contents removed from the world
    dropped: [],       // what you put back down, and where it lies
    remains: [],       // where you died: { site, floor, room, tile, at, items } — a container in the delta
    opened: [],        // keys of containers opened
    screen: '',        // '' | 'pack' | 'container'
    screenKey: '',     // which container, when screen is 'container'
    cur: 0,            // grid cursor
    side: 0,           // 0 container, 1 pack
  };
}

// Fields beginning `_` are TRANSIENT: derived from the delta, never hashed,
// never saved, rebuilt on demand. `_view` is the first. A save is every field
// that does not begin with an underscore, which is what makes the schema
// explicit without listing it twice.
export const isTransient = (k) => k.startsWith('_');
export function toDelta(s) {
  const out = {};
  for (const k of Object.keys(s)) if (!isTransient(k)) out[k] = s[k];
  return out;
}

export function hashState(s) {
  let h = 0x811c9dc5;
  const mix = (v) => { v = v >>> 0; for (let i = 0; i < 4; i++) { h ^= (v >>> (i*8)) & 0xff; h = Math.imul(h, 0x01000193); } };
  mix(s.seed); mix(s.tick); mix(s.x); mix(s.y); mix(s.facing);
  mix(s.moving ? 1 : 0); mix(s.site); mix(s.floor); mix(s.room); mix(s.moves);
  mix(s.lampDir); mix(s.vx); mix(s.vy);
  const roll = (arr) => { mix(arr.length); for (const v of arr) for (let i = 0; i < v.length; i++) mix(v.charCodeAt(i)); };
  const rollRefs = (arr) => { mix(arr.length); for (const r of arr) { for (let i = 0; i < r.kind.length; i++) mix(r.kind.charCodeAt(i)); for (let i = 0; i < r.key.length; i++) mix(r.key.charCodeAt(i)); } };
  rollRefs(s.carried); rollRefs(s.stash);
  for (const slot of ['weapon','tool','armor','helm','accessory']) {
    const r = s.equipped[slot];
    mix(r ? 1 : 0);
    if (r) { for (let i = 0; i < r.kind.length; i++) mix(r.kind.charCodeAt(i)); for (let i = 0; i < r.key.length; i++) mix(r.key.charCodeAt(i)); }
  }
  mix(s.deaths || 0);
  // A dropped thing is a ref plus a position, and the position is part of the
  // state: replay has to put it back on the same tile.
  mix(s.dropped.length);
  for (const d of s.dropped) {
    for (let i = 0; i < d.kind.length; i++) mix(d.kind.charCodeAt(i));
    for (let i = 0; i < d.key.length; i++) mix(d.key.charCodeAt(i));
    mix(d.site); mix(d.floor); mix(d.room); mix(d.tile);
  }
  mix(s.remains.length);
  for (const r of s.remains) { mix(r.site); mix(r.floor); mix(r.room); mix(r.tile); mix(r.at); rollRefs(r.items); }
  // The body and what is hunting it. Foe positions are part of the state, so
  // replay has to reproduce them tick for tick.
  mix(s.hp); mix(s.hurtAt < 0 ? 0 : s.hurtAt);
  mix(s.swing ? 1 : 0);
  if (s.swing) { mix(s.swing.at); mix(s.swing.dir); mix(s.swing.hit.length); }
  mix(s.say ? s.say.at : 0);
  mix(s.arrivedAt);
  mix(s.pops.length);
  for (const p of s.pops) { mix(p.x); mix(p.y); mix(p.at); for (let i = 0; i < p.kind.length; i++) mix(p.kind.charCodeAt(i)); }
  if (s.say) for (let i = 0; i < s.say.text.length; i++) mix(s.say.text.charCodeAt(i));
  mix(s.foes.length);
  for (const f of s.foes) {
    for (let i = 0; i < f.id.length; i++) mix(f.id.charCodeAt(i));
    mix(f.x); mix(f.y); mix(f.hp);
    mix(f.modeAt); mix(f.vx); mix(f.vy); mix(f.spin + 1); mix(f.aimX); mix(f.aimY);
    for (let i = 0; i < f.mode.length; i++) mix(f.mode.charCodeAt(i));
  }
  roll(s.taken); roll(s.opened); roll(s.known); roll(s.slain); roll(s.broken); roll(s.scars);
  mix(s.charges.length);
  for (const c of s.charges) { for (let i = 0; i < c.key.length; i++) mix(c.key.charCodeAt(i)); mix(c.site); mix(c.floor); mix(c.room); mix(c.x); mix(c.y); mix(c.at); }
  mix(s.blasts.length);
  for (const b of s.blasts) { mix(b.x); mix(b.y); mix(b.r); mix(b.at); mix(b.site); mix(b.floor); mix(b.room); roll(b.hit); }
  mix(s.scrap);
  for (const k of Object.keys(s.stats).sort()) mix(s.stats[k]);
  mix(s.cur); mix(s.side); roll([s.screen, s.screenKey]);
  return h >>> 0;
}
