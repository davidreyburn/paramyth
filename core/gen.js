// L1: the world. Every room is a pure function of its address.
// Nothing here is ever stored; the delta records only what play changed.

import { h, hi, hrange, hpick, hchance, pair } from './addr.js';
import { pickKind, isContainer, isSolidItem } from './items.js';
import { campRoom } from './camp.js';

// The grid's shape lives in grid.js so authored places can share it without a
// circular import. Re-exported here because everything already reads it from gen.
export { TILE, COLS, ROWS, T, solidTile } from './grid.js';
import { TILE, COLS, ROWS, T, solidTile } from './grid.js';

// Floors below zero are the surface. -1 is the camp above every mausoleum.
export const CAMP = -1;

export const GW = 3, GH = 2;                 // room grid per floor

// No PILLAR type and RUBBLE is solid — both decided in grid.js, which is the
// one place the tile vocabulary lives.

// Depth is era, and the depth that matters is ABSOLUTE, not floor-within-site.
// Keying era to the local floor index capped it at 1 and left four archetype
// generators unreachable — see case-study-log 2026-09-22. Tints are pushed far
// apart because the atlas could not distinguish the first two.
export const ERAS = [
  { name:'Recent',      tint:'#7a6242', arch:['vestibule','salvage-cut'] },
  { name:'War Dead',    tint:'#6b7355', arch:['crypt-hall','niche-gallery'] },
  { name:'Imperial',    tint:'#4a5f7a', arch:['hero-tomb','reliquary'] },
  { name:'Lost Empire', tint:'#6b4a72', arch:['ascension-chamber','warden-post'] },
];

// Strata, per design/world-shape.md. A mausoleum floor sits one level below the
// Field, so floors 0..3 occupy absolute depths 1..4 — which means the deepest
// mausoleums do reach imperial material, as the Ransacked Archive implies.
export const absDepth = (floor) => floor + 1;
export const eraFor = (d) => d <= 1 ? ERAS[0] : d <= 3 ? ERAS[1] : d <= 8 ? ERAS[2] : ERAS[3];

// Connected-by-construction floor shapes. Determinism without a solver.
const SHAPES = [
  [1,1,0, 0,1,0], [1,1,1, 0,0,0], [1,1,0, 1,1,0], [1,0,0, 1,1,1],
  [1,1,1, 0,1,0], [0,1,1, 1,1,0], [1,1,1, 1,0,1], [1,1,1, 1,1,1],
  [0,1,0, 1,1,1], [1,1,0, 0,1,1],
];

export const floorCount = (seed, site) => hrange(2, 4, seed, site, 0xf100);

const cellsOf = (seed, site, floor) => {
  const shape = hpick(SHAPES, seed, site, floor, 0x5ade);
  const cells = [];
  for (let i = 0; i < GW * GH; i++) if (shape[i]) cells.push(i);
  return { shape, cells };
};

const gpos = (i) => [i % GW, (i / GW) | 0];
function nearestCell(cells, target) {
  const [tx, ty] = gpos(target);
  let best = cells[0], bd = Infinity;
  for (const c of cells) {                       // ascending, so ties are stable
    const [x, y] = gpos(c);
    const d = Math.abs(x - tx) + Math.abs(y - ty);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// A descent and the ascent that answers it are ONE SHAFT. The up-stair is
// therefore derived from the down-stair above it, not rolled independently:
// it lands in the same grid cell where that cell exists on this floor, and in
// the nearest one where it does not. Independent rolls put the two ends of a
// staircase in unrelated rooms.
export function stairDownCell(seed, site, floor) {
  if (floor >= floorCount(seed, site) - 1) return -1;
  return hpick(cellsOf(seed, site, floor).cells, seed, site, floor, 0xd0);
}
export function stairUpCell(seed, site, floor) {
  if (floor < 0) return -1;
  // Floor 0's up-stair is the way back to the camp, so it always exists.
  if (floor === 0) return cellsOf(seed, site, 0).cells[0];
  const above = stairDownCell(seed, site, floor - 1);
  const { cells } = cellsOf(seed, site, floor);
  return cells.includes(above) ? above : nearestCell(cells, above);
}

export function floorPlan(seed, site, floor) {
  if (floor < 0) return campRoom().plan;
  const { shape, cells } = cellsOf(seed, site, floor);

  const links = [];
  for (const i of cells) {
    const gx = i % GW, gy = (i / GW) | 0;
    if (gx + 1 < GW && shape[i + 1]) links.push([i, i + 1, 'h']);
    if (gy + 1 < GH && shape[i + GW]) links.push([i, i + GW, 'v']);
  }

  return {
    shape, cells, links,
    stairDown: stairDownCell(seed, site, floor),
    stairUp: stairUpCell(seed, site, floor),
    era: eraFor(absDepth(floor)),
  };
}

// Both sides of an edge compute the same opening from the normalized pair key,
// so neighbours agree without either storing anything.
export function exitAt(seed, site, floor, a, b, axis) {
  const [lo, hi_] = pair(a, b);
  return axis === 'h'
    ? hrange(3, ROWS - 4, seed, site, floor, lo, hi_, 0xe1)
    : hrange(4, COLS - 5, seed, site, floor, lo, hi_, 0xe2);
}

export function linksFor(plan, room) {
  return plan.links.filter((l) => l[0] === room || l[1] === room);
}

function carve(g, archetype, seed, site, floor, room) {
  const set = (x, y, t) => { if (x>0 && y>0 && x<COLS-1 && y<ROWS-1) g[y*COLS+x] = t; };
  // A pillar is a 2x2 mass, which the nine-slice renders as four outer corners
  // — masonry with edges, rather than a blank square.
  const pillar = (x, y) => { set(x, y, T.WALL); set(x+1, y, T.WALL); set(x, y+1, T.WALL); set(x+1, y+1, T.WALL); };
  const k = [seed, site, floor, room];

  switch (archetype) {
    case 'vestibule':
      for (let n = 0; n < 14; n++)
        set(hrange(2, COLS-3, ...k, n, 1), hrange(2, ROWS-3, ...k, n, 2), T.RUBBLE);
      break;

    case 'salvage-cut':
      // Solid masses with rubble spilled around them — never interleaved.
      for (let n = 0; n < 4; n++) {
        const x = hrange(4, COLS-8, ...k, n, 3), y = hrange(3, ROWS-6, ...k, n, 4);
        const w = hrange(2, 5, ...k, n, 5), hh = hrange(2, 3, ...k, n, 6);
        for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) set(x+i, y+j, T.WALL);
        for (let m = 0; m < 5; m++) {
          const rx = x + hrange(-1, w, ...k, n, m, 7), ry = y + hrange(-1, hh, ...k, n, m, 8);
          if (g[ry*COLS+rx] !== T.WALL) set(rx, ry, T.RUBBLE);
        }
      }
      break;

    case 'crypt-hall':
      for (let row = 0; row < 2; row++) {
        const y = row === 0 ? 5 : ROWS - 7;
        for (let x = 4; x < COLS - 5; x += 5)
          if (hchance(5, 6, ...k, x, y)) { set(x, y, T.SARC); set(x+1, y, T.SARC); }
      }
      break;

    case 'niche-gallery':
      for (let x = 3; x < COLS - 3; x += 3) {
        if (hchance(3, 4, ...k, x, 7)) set(x, 1, T.NICHE);
        if (hchance(3, 4, ...k, x, 8)) set(x, ROWS-2, T.NICHE);
      }
      for (let n = 0; n < 3; n++)
        pillar(hrange(6, COLS-8, ...k, n, 9), hrange(6, ROWS-8, ...k, n, 10));
      break;

    case 'hero-tomb': {
      const cx = COLS >> 1, cy = ROWS >> 1;
      for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) set(cx+i, cy+j, T.SARC);
      for (const [dx, dy] of [[-7,-4],[6,-4],[-7,3],[6,3],[-11,-1],[10,-1]]) pillar(cx+dx, cy+dy);
      break;
    }

    case 'reliquary':
      for (let cy = 4; cy < ROWS - 4; cy += 6) for (let cx = 5; cx < COLS - 6; cx += 8) {
        for (let i = 0; i < 6; i++) { set(cx+i, cy, T.WALL); set(cx+i, cy+4, T.WALL); }
        for (let j = 0; j <= 4; j++) { set(cx, cy+j, T.WALL); set(cx+6, cy+j, T.WALL); }
        set(cx + hrange(1, 5, ...k, cx, cy, 11), cy+4, T.FLOOR);   // one way in
        set(cx+3, cy+2, T.SARC);
      }
      break;

    case 'ascension-chamber': {
      const cx = COLS >> 1, cy = ROWS >> 1;
      for (let a = 0; a < 6; a++) {
        const ang = (a * 2 * Math.PI) / 6;
        pillar(cx + Math.round(Math.cos(ang) * 11), cy + Math.round(Math.sin(ang) * 5));
      }
      set(cx, cy, T.SARC);
      break;
    }

    case 'warden-post':
      for (let n = 0; n < 3; n++) {
        const x = hrange(5, COLS-12, ...k, n, 12), y = hrange(4, ROWS-8, ...k, n, 13);
        const w = hrange(5, 9, ...k, n, 14);
        for (let i = 0; i < w; i++) set(x+i, y, T.WALL);
        for (let j = 0; j < 3; j++) set(x, y+j, T.WALL);
      }
      break;
  }
}

// The room's main walkable component, seeded from its most central floor tile.
function mainSpace(g) {
  const cx = COLS >> 1, cy = ROWS >> 1;
  let start = -1, bd = Infinity;
  for (let i = 0; i < g.length; i++) {
    if (solidTile(g[i])) continue;
    const d = Math.abs((i % COLS) - cx) + Math.abs(((i / COLS) | 0) - cy);
    if (d < bd) { bd = d; start = i; }
  }
  const seen = new Uint8Array(g.length);
  if (start < 0) return seen;
  seen[start] = 1;
  const st = [start];
  while (st.length) {
    const i = st.pop(), x = i % COLS, y = (i / COLS) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (seen[j] || solidTile(g[j])) continue;
      seen[j] = 1; st.push(j);
    }
  }
  return seen;
}

const memo = new Map();                       // in-memory only, never saved

export function roomTiles(seed, site, floor, room) {
  if (floor < 0) return campRoom();          // authored, identical every time
  const key = `${seed}|${site}|${floor}|${room}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const plan = floorPlan(seed, site, floor);
  const g = new Uint8Array(COLS * ROWS);
  for (let x = 0; x < COLS; x++) { g[x] = T.WALL; g[(ROWS-1)*COLS + x] = T.WALL; }
  for (let y = 0; y < ROWS; y++) { g[y*COLS] = T.WALL; g[y*COLS + COLS-1] = T.WALL; }

  const archetype = hpick(plan.era.arch, seed, site, floor, room, 0xa5);
  carve(g, archetype, seed, site, floor, room);

  // (stray-wall pass moved below the door carve)
  const demoteStrays = () => {
  // A wall must be part of a mass. An isolated wall tile has no edge to show,
  // so a nine-slice resolves it to the top-left corner — which reads as broken
  // masonry speckled through a room. Demote strays to rubble. Border walls sit
  // outside this loop and are never touched.
  for (let y = 1; y < ROWS-1; y++) {
    for (let x = 1; x < COLS-1; x++) {
      const i = y*COLS + x;
      if (g[i] !== T.WALL) continue;
      if (g[i-COLS] === T.WALL || g[i+COLS] === T.WALL ||
          g[i-1] === T.WALL   || g[i+1] === T.WALL) continue;
      g[i] = T.RUBBLE;
    }
  }
  };
  demoteStrays();

  // Openings are punched last so no feature can wall over one. That was not
  // enough: a feature can wall the tile INSIDE a doorway, leaving the opening
  // itself clear and unreachable. The approach has to be carved too.
  const doors = [];
  for (const [a, b, axis] of linksFor(plan, room)) {
    const p = exitAt(seed, site, floor, a, b, axis);
    const [lo] = pair(a, b);
    if (axis === 'h') {
      const x = room === lo ? COLS - 1 : 0, dx = room === lo ? -1 : 1;
      g[p*COLS + x] = T.FLOOR; g[(p+1)*COLS + x] = T.FLOOR;
      doors.push({ i: p*COLS + x, dx, dy: 0 }, { i: (p+1)*COLS + x, dx, dy: 0 });
    } else {
      const y = room === lo ? ROWS - 1 : 0, dy = room === lo ? -1 : 1;
      g[y*COLS + p] = T.FLOOR; g[y*COLS + p+1] = T.FLOOR;
      doors.push({ i: y*COLS + p, dx: 0, dy }, { i: y*COLS + p + 1, dx: 0, dy });
    }
  }

  let reach = mainSpace(g);
  for (const d of doors) {
    if (reach[d.i]) continue;
    let x = (d.i % COLS) + d.dx, y = ((d.i / COLS) | 0) + d.dy;
    for (let k = 0; k < Math.max(COLS, ROWS); k++) {
      if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) break;
      const j = y*COLS + x;
      if (reach[j]) break;
      g[j] = T.FLOOR;
      x += d.dx; y += d.dy;
    }
    reach = mainSpace(g);
  }

  demoteStrays();

  // Stairs go on a real floor tile, never stamped over whatever was carved
  // there. Deterministic scan from a hashed start, so the spot is stable.
  const placeStair = (salt, avoid) => {
    const n = COLS * ROWS, start = h(seed, site, floor, room, salt) % n;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const x = i % COLS, y = (i / COLS) | 0;
      if (x < 2 || y < 2 || x >= COLS - 2 || y >= ROWS - 2) continue;
      if (g[i] !== T.FLOOR || !reach[i]) continue;
      if (avoid >= 0) {
        const ax = avoid % COLS, ay = (avoid / COLS) | 0;
        if (Math.abs(x - ax) + Math.abs(y - ay) < 4) continue;
      }
      return i;
    }
    return -1;
  };

  let downAt = -1;
  if (plan.stairDown === room) { downAt = placeStair(0xd1, -1); if (downAt >= 0) g[downAt] = T.STAIR_D; }
  if (plan.stairUp === room)   { const i = placeStair(0x1f, downAt); if (i >= 0) g[i] = T.STAIR_U; }

  const protect = doors.map((d) => d.i);
  for (let i = 0; i < g.length; i++) if (g[i] === T.STAIR_D || g[i] === T.STAIR_U) protect.push(i);
  const out = { grid: g, archetype, era: plan.era, plan, reach, protect };
  if (memo.size > 512) memo.clear();
  memo.set(key, out);
  return out;
}

export const isSolid = (grid, tx, ty) =>
  tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS ? solidTile(grid[ty*COLS + tx]) : false;


// ---------------------------------------------------------------------------
// Contents: what lies in a room. A pure function of its address, like the room
// itself — nothing is placed until something is taken, and only the taking is
// recorded.

const contentsMemo = new Map();

function freeFloorTile(grid, start, used, reach) {
  const n = COLS * ROWS;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const x = i % COLS, y = (i / COLS) | 0;
    if (x < 2 || y < 2 || x >= COLS - 2 || y >= ROWS - 2) continue;
    if (grid[i] !== T.FLOOR || used.has(i)) continue;
    if (reach && !reach[i]) continue;          // never in a sealed pocket
    return i;
  }
  return -1;
}

// May a solid thing stand here? Only ONE thing is protected: the ways out.
//
// Obstruction is content, not a defect (DJ, 2026-09-22) — tools for breaking
// boulders and driving tunnels are coming, so loot behind a wall is something
// to come back for, and unreachable floor is a mining target. What must never
// happen is a player sealed on a floor with no route to a door or a stair,
// because nothing in the game can yet undo that.
function keepsWayOut(grid, protect, blockedSet, extra) {
  if (!protect.length) return true;
  const shut = (i) => solidTile(grid[i]) || blockedSet.has(i) || i === extra;

  const cx = COLS >> 1, cy = ROWS >> 1;
  let start = -1, bd = Infinity;
  for (let i = 0; i < grid.length; i++) {
    if (shut(i)) continue;
    const d = Math.abs((i % COLS) - cx) + Math.abs(((i / COLS) | 0) - cy);
    if (d < bd) { bd = d; start = i; }
  }
  if (start < 0) return false;

  const seen = new Uint8Array(grid.length);
  seen[start] = 1;
  const st = [start];
  while (st.length) {
    const i = st.pop(), x = i % COLS, y = (i / COLS) | 0;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = ny * COLS + nx;
      if (seen[j] || shut(j)) continue;
      seen[j] = 1; st.push(j);
    }
  }
  return protect.every((i) => seen[i]);
}

export function contentsOf(seed, site, floor, room) {
  if (floor < 0) return [];                  // nobody leaves salvage lying in camp
  const key = `${seed}|${site}|${floor}|${room}`;
  const hit = contentsMemo.get(key);
  if (hit) return hit;

  const { grid, protect } = roomTiles(seed, site, floor, room);
  const depth = absDepth(floor);
  const n = hrange(2, 6, seed, site, floor, room, 0xc000);
  const used = new Set();      // tiles already holding something
  const choke = new Set();     // tiles a solid thing may never stand on
  const solids = new Set();    // solid placements so far
  const out = [];

  for (let slot = 0; slot < n; slot++) {
    const kind = pickKind(depth, h(seed, site, floor, room, slot, 0xc002));
    const solid = isSolidItem(kind);
    let start = h(seed, site, floor, room, slot, 0xc001) % (COLS * ROWS);
    let tile = -1;

    for (let tries = 0; tries < 12; tries++) {
      const t = freeFloorTile(grid, start, solid ? new Set([...used, ...choke]) : used);
      if (t < 0) break;
      if (!solid || keepsWayOut(grid, protect, solids, t)) { tile = t; break; }
      choke.add(t);                       // learned: nothing solid goes here
      start = (t + 1) % (COLS * ROWS);
    }
    if (tile < 0) continue;               // no legal spot for this one; skip it

    used.add(tile);
    if (solid) solids.add(tile);
    out.push({ slot, tile, kind });
  }

  if (contentsMemo.size > 512) contentsMemo.clear();
  contentsMemo.set(key, out);
  return out;
}

// What is inside a container, and where it lands when opened. Adjacent tiles,
// so opening a chest spills onto the floor you can already see.
export function insideOf(seed, site, floor, room, slot) {
  const here = contentsOf(seed, site, floor, room).find((c) => c.slot === slot);
  if (!here || !isContainer(here.kind)) return [];

  const { grid } = roomTiles(seed, site, floor, room);
  const depth = absDepth(floor);
  const n = hrange(0, 2, seed, site, floor, room, slot, 0xc100);
  const taken = new Set(contentsOf(seed, site, floor, room).map((c) => c.tile));
  const out = [];

  for (let i = 0; i < n; i++) {
    const tile = freeFloorTile(grid, h(seed, site, floor, room, slot, i, 0xc101) % (COLS * ROWS), taken);
    if (tile < 0) break;
    taken.add(tile);
    let kind = pickKind(depth, h(seed, site, floor, room, slot, i, 0xc102));
    if (isContainer(kind)) kind = 'trinket';        // no nested containers
    out.push({ slot, idx: i, tile, kind });
  }
  return out;
}
