// L3: what you carry, and what you swing. The bulk budget and its tiers, the
// pack's and the stash's grid shapes, the blade in your hand and the box it
// sweeps. `hitBox` lives here rather than in systems/combat/ so the renderer
// can draw the shape without importing a system — which is what lets the
// system be deleted.
//
// One of four files that were `sim/interact.js`. This one answers: what am I
// CARRYING, and what happens when I swing it?

import { TILE } from '../core/gen.js';
import { UNARMED, SLOTS, isWeapon, damageOf, reachOf, wideOf, knockOf, fragilityOf, bulkOf } from '../core/items.js';
import { UNITS } from './state.js';

export const BULK_BUDGET = 20;
export const PACK_COLS = 6, PACK_ROWS = 4;
export const CONT_COLS = 4, CONT_ROWS = 3;
export const STASH_COLS = 6, STASH_ROWS = 4;
export const STASH_SLOTS = STASH_COLS * STASH_ROWS;
// What you are wearing and wielding, as a list, for anything that walks it.
export const equippedRefs = (s) => SLOTS.map((k) => s.equipped[k]).filter(Boolean);

// Bulk counts the pack AND the row: armor, tools and haul draw from one budget.
export const carriedBulk = (s) =>
  s.carried.reduce((n, r) => n + bulkOf(r.kind), 0) +
  equippedRefs(s).reduce((n, r) => n + bulkOf(r.kind), 0);

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
           wide: wideOf(ref.kind), knock: knockOf(ref.kind), ref };
}

// The swing's hitbox: a weapon-reach deep in front of you and its own width
// across, derived from `facing` alone so it is strictly forward. Fists make a
// small square right in front of you; a sword makes a wide arc a tile out. It
// lives here rather than in systems/combat/ so the renderer can draw the shape
// without importing a system — which is what lets the system be deleted.
export const FACE = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // s.facing: N E S W

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
