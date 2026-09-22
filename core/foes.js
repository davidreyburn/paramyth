// L1: what lives down there. Pure data and a pure roster — no behaviour.
// Behaviour is `systems/combat/`, which can be deleted; this file is the table
// it reads, and a table nobody reads is inert rather than broken.
//
// design/combat-and-tools.md sets the rules this obeys:
//   "Encounters are rare, and most are avoidable."
//   "Threat is denominated in cargo as well as health."

import { h, hi, hchance } from './addr.js';
import { roomTiles, absDepth, COLS, ROWS, T } from './gen.js';

// The speed column is the whole design, so it is worth stating plainly here
// rather than leaving it in a balance spreadsheet nobody opens.
//
//   player, light       288   outruns a dog
//   player, laden       216   caught
//   player, overloaded  158   eaten
//
// A dog at 255 is therefore not a damage problem, it is a CARGO problem. Greed
// is what makes it lethal and the drop-load button is the answer, which is the
// exact moment plans/slice-01.md is waiting to observe.
//
// This number is DEPENDENT on the player's base speed and must move with it.
// It sat at 170 against a base of 192; the base went to 288 and laden began
// outrunning it, which quietly deleted the entire point of the enemy. The three
// speed gates in tools/test-combat.mjs are what bind the two together, and they
// only work because they import the real constants instead of copying them.
export const FOE = {
  dog: {
    label: 'rot-touched dog',
    glyph: 'D',
    hp: 6,
    damage: 2,
    speed: 255,
    foot: 5,          // collision half-extent in pixels, as items use
    wake: 5,          // tiles: how near you must be before it notices
    bite: 45,         // ticks between bites, so contact is not a shredder
  },
};

export const foeAt = (kind) => FOE[kind];

// How often a room holds anything at all. Rare near the surface and commoner
// with depth, because depth is era and the recent strata have been walked over
// by every scrapper in the Company.
const DENSITY = [[1, 4], [3, 3], [8, 3], [99, 2]];   // [upTo depth, one room in N]
const oddsAt = (depth) => (DENSITY.find((d) => depth <= d[0]) || DENSITY[3])[1];

const memo = new Map();

// The roster for a room: a pure function of its address, exactly like the
// contents lying in it. Nothing here is stored — the delta records only which
// of them you killed.
export function foesOf(seed, site, floor, room) {
  if (floor < 0) return [];                     // nothing hunts you in camp
  const key = `${seed}|${site}|${floor}|${room}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const out = [];
  const depth = absDepth(floor);
  if (hchance(1, oddsAt(depth), seed, site, floor, room, 0xd000)) {
    const { grid, reach } = roomTiles(seed, site, floor, room);
    const n = 1 + (hi(4, seed, site, floor, room, 0xd001) === 0 ? 1 : 0);   // usually one, sometimes two

    for (let i = 0; i < n; i++) {
      // Walk from a hashed start until a free, reachable floor tile turns up.
      // Never in the outer ring: a foe wedged against the border is a foe you
      // cannot get a swing at.
      const start = h(seed, site, floor, room, i, 0xd002) % (COLS * ROWS);
      let tile = -1;
      for (let k = 0; k < COLS * ROWS; k++) {
        const t = (start + k) % (COLS * ROWS);
        const x = t % COLS, y = (t / COLS) | 0;
        if (x < 2 || y < 2 || x >= COLS - 2 || y >= ROWS - 2) continue;
        if (grid[t] !== T.FLOOR || !reach[t]) continue;
        if (out.some((f) => f.tile === t)) continue;
        tile = t; break;
      }
      if (tile < 0) continue;
      out.push({ id: `${site}:${floor}:${room}:${i}`, kind: 'dog', tile });
    }
  }

  if (memo.size > 512) memo.clear();
  memo.set(key, out);
  return out;
}
