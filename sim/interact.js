// What can be reached, and what the toast should say about it.
// Shared by apply and by the renderer, so the prompt and the action can never
// disagree about what you are standing next to.

import { contentsOf, insideOf, roomTiles, ERAS, eraFor, absDepth,
         COLS, ROWS, TILE, T } from '../core/gen.js';
import { chainOf, marksOf, readMarks, worthMultiplier, describe,
         leadOf, placeLabel, possessionsOf, occupantOf } from '../core/provenance.js';
import { campStations, STATION } from '../core/camp.js';
import { KIND, UNARMED, SLOTS, slotOf, isContainer, isPortable, isWeapon, damageOf, reachOf, wideOf,
         fragilityOf, footOf, bulkOf, valueOf, verbFor } from '../core/items.js';
import { UNITS } from './state.js';

export const BULK_BUDGET = 20;
export const PACK_COLS = 6, PACK_ROWS = 4;
export const CONT_COLS = 4, CONT_ROWS = 3;
export const STASH_COLS = 6, STASH_ROWS = 4;
export const STASH_SLOTS = STASH_COLS * STASH_ROWS;
const REACH = 1;                                  // tiles, Chebyshev

export const keyOf = (s, slot, idx) =>
  idx === undefined ? `${s.site}:${s.floor}:${s.room}:${slot}`
                    : `${s.site}:${s.floor}:${s.room}:${slot}.${idx}`;

// What you are wearing and wielding, as a list, for anything that walks it.
export const equippedRefs = (s) => SLOTS.map((k) => s.equipped[k]).filter(Boolean);

// Bulk counts the pack AND the row: armor, tools and haul draw from one budget.
export const carriedBulk = (s) =>
  s.carried.reduce((n, r) => n + bulkOf(r.kind), 0) +
  equippedRefs(s).reduce((n, r) => n + bulkOf(r.kind), 0);

// --- provenance, as the game sees it ---------------------------------------
// The key IS the address, so a chain is computable from a reference alone.

export function chainFor(s, key) {
  const floor = Number(String(key).split(':')[1]);
  const depth = absDepth(floor);
  return chainOf(s.seed, key, ERAS.indexOf(eraFor(depth)), depth);
}

export const marksFor = (s, key) => readMarks(marksOf(chainFor(s, key)), s.stats);

// You can put a price on a thing when its record has been read for you, or when
// you can read every mark on it yourself. That is what Keen and Lore buy.
export function assessed(s, key) {
  if (s.known.includes(key)) return true;
  const m = marksFor(s, key);
  return m.length > 0 && m.every((x) => x.legible);
}

// Base worth until the history is legible; the chain multiplies it after.
export function itemValue(s, ref) {
  const base = valueOf(ref.kind);
  return assessed(s, ref.key) ? Math.round(base * worthMultiplier(chainFor(s, ref.key))) : base;
}

export const readOut = (s, key) => describe(chainFor(s, key), s.stats);

// An appraised record is read TO you, so it is read in full. That is what the
// fee buys, and it is why a low-Keen character can still follow a thread.
const READ_ALL = { keen: 9, lore: 9 };

// The payoff: a legible mark names a person, and that person lies somewhere
// real. Null when this character cannot read far enough to get a name — which
// is most of the time, early, and is the point.
export function leadFor(s, key) {
  return leadOf(chainFor(s, key), s.known.includes(key) ? READ_ALL : s.stats);
}

export { placeLabel };

// Everything of that person's still lying where it was left. Taken things drop
// out, so a trove you have already emptied stops advertising itself.
export function troveFor(s, actorId) {
  const taken = new Set(s.taken);
  return possessionsOf(s.seed, actorId).filter((it) => !taken.has(it.key));
}

// Every lead you are actually carrying. This is the reason to look in your own
// pack before deciding which way to walk, and it is derived — nothing about a
// lead is stored, so the delta never learns what you have worked out.
export function leads(s) {
  const out = [], seen = new Set();
  for (const ref of [...s.carried, ...s.stash]) {
    const l = leadFor(s, ref.key);
    if (!l || !l.place) continue;
    const tag = `${l.actor.id}|${l.place}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push({ ...l, from: ref });
  }
  return out;
}

export const placeHere = (s) => `${s.site}:${s.floor}:${s.room}`;
export const atPlace = (s, place) => place === placeHere(s);

// Whose room this is. Standing in a grave you were sent to is worth saying so.
export const occupantHere = (s) =>
  s.floor < 0 ? null : occupantOf(s.seed, s.site, s.floor, s.room, ERAS.indexOf(eraFor(absDepth(s.floor))));

// You swing with the best blade you are carrying. No equip slot, no second
// inventory, no new state — and because a weapon is an ordinary carried item it
// is paid for out of the bulk budget like everything else, every single run.
export function bestWeapon(s) {
  const w = s.equipped.weapon;
  return w && isWeapon(w.kind) ? w : null;
}

// What a hit puts at risk. The most fragile thing you carry goes first, which
// is why the cargo worth most is the cargo hardest to bring home.
export function mostFragile(s) {
  let at = -1, worst = 0;
  for (const [i, ref] of s.carried.entries()) {
    const f = fragilityOf(ref.kind);
    if (f > worst) { worst = f; at = i; }
  }
  return at;
}

// What you are actually swinging. Always a real answer: the best blade in the
// pack, or your fists. Nothing downstream has to ask whether you are armed.
export function weaponOf(s) {
  const ref = bestWeapon(s);
  if (!ref) return UNARMED;
  return { label: ref.kind, damage: damageOf(ref.kind), reach: reachOf(ref.kind),
           wide: wideOf(ref.kind), ref };
}

// The swing's hitbox: a weapon-reach deep in front of you and its own width
// across, derived from `facing` alone so it is strictly forward. Fists make a
// small square right in front of you; a sword makes a wide arc a tile out. It
// lives here rather than in systems/combat/ so the renderer can draw the shape
// without importing a system — which is what lets the system be deleted.
const FACE = [[0, -1], [1, 0], [0, 1], [-1, 0]];        // s.facing: N E S W

export function hitBox(s) {
  const [fx, fy] = FACE[s.swing ? s.swing.dir : s.facing];
  const w = weaponOf(s);
  const reach = (w.reach || TILE) * UNITS;
  const wide = (w.wide || TILE * 3 / 4) * UNITS;
  const half = 5 * UNITS;
  const cx = s.x + fx * (half + reach / 2);
  const cy = s.y + fy * (half + reach / 2);
  return {
    x0: cx - (fx ? reach / 2 : wide), x1: cx + (fx ? reach / 2 : wide),
    y0: cy - (fy ? reach / 2 : wide), y1: cy + (fy ? reach / 2 : wide),
  };
}

export const inHitBox = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

export function tier(bulk) {
  if (bulk <= 8) return 'light';
  if (bulk <= 16) return 'laden';
  return 'overloaded';
}

// ONE VIEW PER TICK. What is in this room — the things still lying here, and
// the boxes you walk around — computed once and cached on a transient field.
//
// It used to be rebuilt five times a tick, each time turning `taken` and
// `opened` (lists that grow for the life of a save) into fresh Sets. The cache
// is valid while nothing that changes the room's contents has changed, and
// every such change alters one of three list lengths — so validity is a string
// compare and needs no invalidation calls. plans/review-2026-09-24.md.
export function roomView(s) {
  const stamp = `${s.site}|${s.floor}|${s.room}|${s.taken.length}|${s.opened.length}|${s.dropped.length}`;
  const v = s._view;
  if (v && v.stamp === stamp) return v;

  const taken = new Set(s.taken), opened = new Set(s.opened);
  const visible = [];
  for (const c of contentsOf(s.seed, s.site, s.floor, s.room)) {
    const k = keyOf(s, c.slot);
    if (!taken.has(k)) visible.push({ ...c, key: k, open: opened.has(k) });
  }
  // And what you put down. A dropped thing keeps its own address, so its whole
  // history follows it across the world — which is what `inherit` will need
  // when a corpse starts writing provenance of its own.
  for (const d of s.dropped)
    if (d.site === s.site && d.floor === s.floor && d.room === s.room)
      visible.push({ slot: -1, tile: d.tile, kind: d.kind, key: d.key, dropped: true });

  const bodies = [];
  for (const c of visible) {
    const f = footOf(c.kind);
    if (!f) continue;
    const tx = c.tile % COLS, ty = (c.tile / COLS) | 0;
    bodies.push({ cx: (tx * TILE + TILE / 2) * UNITS, cy: (ty * TILE + TILE / 2) * UNITS, f: f * UNITS, tile: c.tile });
  }

  s._view = { stamp, taken, opened, visible, bodies };
  return s._view;
}

export const visible = (s) => roomView(s).visible;

// Where a thing you let go of lands: the tile under you, or the nearest free
// floor to it, searched in rings so the result is the same every replay.
export function dropTile(s) {
  const { grid } = roomTiles(s.seed, s.site, s.floor, s.room);
  const used = new Set(roomView(s).visible.map((c) => c.tile));
  const tx = Math.floor(s.x / (TILE * UNITS)), ty = Math.floor(s.y / (TILE * UNITS));
  const free = (x, y) => {
    if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) return false;
    const i = y * COLS + x;
    return grid[i] === T.FLOOR && !used.has(i);
  };
  for (let r = 0; r < Math.max(COLS, ROWS); r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (free(tx + dx, ty + dy)) return (ty + dy) * COLS + (tx + dx);
      }
  return -1;
}

// What is still inside a container. Contents stay in it until taken — spilling
// them across the floor made an opened chest look like it had done nothing.
export function containerItems(s, key) {
  const slot = Number(String(key).split(':')[3]);
  const { taken } = roomView(s);
  return insideOf(s.seed, s.site, s.floor, s.room, slot)
    .map((it) => ({ ...it, key: keyOf(s, it.slot, it.idx) }))
    .filter((it) => !taken.has(it.key));
}

// The nearest thing with a verb, within reach.
export function reachable(s) {
  const px = Math.floor(s.x / (TILE * UNITS)), py = Math.floor(s.y / (TILE * UNITS));
  let best = null, bd = Infinity;

  for (const c of visible(s)) {
    if (isContainer(c.kind) && c.open && !containerItems(s, c.key).length) continue;  // open and empty
    if (!verbFor(c.kind)) continue;                     // a fixture has no verb
    const cx = c.tile % COLS, cy = (c.tile / COLS) | 0;
    const d = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    if (d > REACH) continue;
    const t = Math.abs(cx - px) + Math.abs(cy - py);
    if (t < bd) { bd = t; best = c; }
  }
  return best;
}

// The stair you are standing on. It outranks anything lying beside it: an item
// dropped next to a staircase used to capture the button entirely, which is how
// a descent became a one-way trip.
export function stairUnder(s) {
  const { grid } = roomTiles(s.seed, s.site, s.floor, s.room);
  const tx = Math.floor(s.x / (TILE * UNITS)), ty = Math.floor(s.y / (TILE * UNITS));
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
  const t = grid[ty * COLS + tx];
  return t === T.STAIR_D ? 'down' : t === T.STAIR_U ? 'up' : null;
}

export const haulValue = (s) => s.carried.reduce((n, r) => n + itemValue(s, r), 0);
export const APPRAISAL_FEE = 6;

// A station you are standing at. Camp only, and reachable from a tile away so
// you do not have to stand exactly on the counter.
export function stationAt(s) {
  if (s.floor >= 0) return null;
  const px = Math.floor(s.x / (TILE * UNITS)), py = Math.floor(s.y / (TILE * UNITS));
  let best = null, bd = Infinity;
  for (const st of campStations()) {
    const cx = st.tile % COLS, cy = (st.tile / COLS) | 0;
    const d = Math.max(Math.abs(cx - px), Math.abs(cy - py));
    if (d > 1) continue;
    const t = Math.abs(cx - px) + Math.abs(cy - py);
    if (t < bd) { bd = t; best = st; }
  }
  return best;
}

// The toast line. One button, one verb, and the one refusal that matters.
export function prompt(s) {
  const station = stationAt(s);
  if (station) {
    if (station.kind === STATION.QUARTERMASTER) {
      const v = haulValue(s);
      return v > 0
        ? { text: `Sell salvage \u2014 ${v} scrap`, station }
        : { text: 'Nothing to sell', refuse: true, station };
    }
    if (station.kind === STATION.STASH) return { text: 'Open stash', station };
    if (station.kind === STATION.APPRAISER) {
      return s.carried.length
        ? { text: 'Consult the appraiser', station }
        : { text: 'Nothing to appraise', refuse: true, station };
    }
  }

  const st = stairUnder(s);
  if (st) return { text: st === 'down' ? 'Descend' : 'Ascend', stair: st };
  const c = reachable(s);
  if (!c) return null;
  if (isPortable(c.kind) && carriedBulk(s) + bulkOf(c.kind) > BULK_BUDGET)
    return { text: `Too heavy — drop something first`, refuse: true, target: c };
  if (isContainer(c.kind) && c.open) return { text: `Search ${KIND[c.kind].label}`, target: c };
  return { text: verbFor(c.kind), target: c };
}
