// L1: what lives down there. Pure data and a pure roster — no behaviour.
// Behaviour is `systems/combat/`, which can be deleted; this file is the table
// it reads, and a table nobody reads is inert rather than broken.
//
// design/combat-and-tools.md sets the rules this obeys:
//   "Encounters are rare, and most are avoidable."
//   "Threat is denominated in cargo as well as health."

import { h, hi, hrange, hchance } from './addr.js';
import { roomTiles, absDepth, groundTile, FIELD_CAMP, COLS, ROWS, T } from './gen.js';

// The speed column is the whole design, so it is worth stating plainly here
// rather than leaving it in a balance spreadsheet nobody opens.
//
//   player, light       288   breaks contact: the dog falls behind while it
//                             circles, and its next lunge falls short
//   player, laden       216   cannot make the distance before the next lunge
//   player, overloaded  158   is run down almost at once
//
// A dog is therefore not a damage problem, it is a CARGO problem. Greed is
// what makes it lethal and the drop-load button is the answer. Since the
// machine, the chase is no longer a footrace: the dog walks at 255 and lunges
// at 408, so what decides it is whether you are clear of lunge range when the
// crouch ends — and that is a function of load. The two contact gates in
// tools/test-combat.mjs measure exactly that, on the camp's open ground, and
// they only work because they import the real constants instead of copying
// them. These numbers move with the player's base speed and must be re-run
// whenever it does.
export const FOE = {
  dog: {
    label: 'rot-touched dog',
    glyph: 'D',
    hp: 6,
    damage: 2,
    speed: 255,       // circling and backing off
    foot: 5,          // collision half-extent in pixels, as items use
    wake: 5,          // tiles: how near you must be before it notices
    // The machine's policy: circle, crouch, strike, back off. The machine
    // itself is systems/combat/; these numbers are what make it a DOG. The
    // bite cooldown is gone — the cycle is the cooldown.
    orbit: 40,               // px: two tiles out, close enough to threaten
    // The orbit is not perfect. The wanted radius drifts by this much either
    // way over a period, so a dog that is chased can JUST be caught inside a
    // sword's reach (27px from your centre) at the bottom of its drift — and
    // the bottom of the drift is also where a crouch is most likely to begin.
    // DJ: “if you go chasing it you can just about land a hit, but it's risky.”
    orbitWobble: 14,         // px: 26..54
    orbitPeriod: 120,        // ticks for a full in-and-out
    circleTicks: [45, 90],   // jittered per foe, so a pack does not lunge as one
    lungeWindup: 12,         // the crouch: still, aim fixed. The sidestep window.
    // The dash is a LINE THROUGH where you were, not a trip to it: a fixed
    // length at a fixed speed. That is what lets it run down a laden player
    // who keeps running, and what makes a light one — who is further out when
    // the crouch ends — get clear. Worked by tier in plans/foe-behaviour.md.
    lungeSpeed: 640,         // 2.5x its walk, for the dash only: 50px of closure on a laden runner, 41 on a light one
    lungeTicks: 42,          // the crouch plus 30 ticks of dash: 75px, nearly four tiles
    recoverTicks: 30,        // half a second of open window
    // Knockback, both ways. `weight` divides what a hit does to it — a dog is
    // the reference weight, a Sentinel will be heavy, a Warden rooted at
    // Infinity. `knock` is how far its own bite carries you, in px.
    weight: 1,
    knock: 12,
    staggerTicks: 15, // a quarter second helpless after a hit lands
  },

  // design/combat-and-tools.md: “Enormous damage, slow, blocks a route rather
  // than chasing. Walk around it.” DJ: it does not stir until you are within
  // its radius, then comes slowly and straight; much heavier, so only a heavy
  // impact weapon moves it. The SAME machine as the dog — this table is the
  // proof that it is a template — with no orbit, so it walks a line, and a
  // strike range, so it commits when it can reach you rather than on a clock.
  sentinel: {
    label: 'Broken Sentinel',
    glyph: 'S',
    hp: 16,
    damage: 4,
    speed: 120,              // slower than an overloaded player: you can always walk away
    foot: 5,
    wake: 3,                 // tiles: it stirs late
    orbit: 0,                // no circle: straight at you
    orbitWobble: 0, orbitPeriod: 1,
    circleTicks: [20, 30],   // between blows, once in reach
    strikeRange: 28,         // px: commits only from here
    lungeWindup: 24,         // a long, visible wind-up
    lungeSpeed: 400,
    lungeTicks: 34,          // wind-up plus a 10-tick lurch: 15px
    recoverTicks: 40,
    staggerTicks: 20,
    weight: 6,               // a sword's 24 is a 4px tap: nothing. A maul's 48 is 8px: it moves.
    knock: 24,               // its blow throws you a tile
  },
};

export const foeAt = (kind) => FOE[kind];

// Per-foe jitter, derived and never stored: a string id folded to a number.
const idNum = (id) => { let k = 0; for (let i = 0; i < id.length; i++) k = (Math.imul(k, 31) + id.charCodeAt(i)) | 0; return k; };
// Which way round it circles. Fixed per foe so it reads as a habit.
export const spinOf = (seed, id) => (hi(2, seed, idNum(id), 0xd010) ? 1 : -1);
// The radius it wants THIS tick: a triangle wave, phased per foe so two dogs
// do not breathe in step. Integer, and a function of the delta alone.
export function orbitFor(def, id, tick) {
  const P = def.orbitPeriod || 1, w = def.orbitWobble || 0;
  // Hash the id into the phase: roster ids differ by one character, which is
  // one tick of phase, which rounds to the same radius.
  const phase = (((tick + hi(P, idNum(id), 0xd012)) % P) + P) % P;
  const tri = phase < P / 2 ? phase : P - phase;          // 0 .. P/2 .. 0
  return def.orbit + (((tri * 4 * w) / P) | 0) - w;         // orbit-w .. orbit+w
}

// How long THIS circle lasts, from the tick it began. Two dogs that woke on the
// same tick get different answers, which is the whole point of the jitter.
export function circleFor(def, seed, id, modeAt) {
  const [lo, hi_] = def.circleTicks;
  return hrange(lo, hi_, seed, idNum(id), modeAt, 0xd011);
}

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
  if (floor < 0 && room === FIELD_CAMP) return [];   // nothing hunts you in camp; the Field is not the camp
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
        if (!groundTile(grid[t]) || !reach[t]) continue;
        if (out.some((f) => f.tile === t)) continue;
        tile = t; break;
      }
      if (tile < 0) continue;
      // Sentinels stand in the deep strata — the War Dead and below — one room
      // in three that holds anything. The shallows are dogs.
      const kind = depth >= 3 && hi(3, seed, site, floor, room, i, 0xd003) === 0 ? 'sentinel' : 'dog';
      out.push({ id: `${site}:${floor}:${room}:${i}`, kind, tile });
    }
  }

  if (memo.size > 512) memo.clear();
  memo.set(key, out);
  return out;
}
