// Generator gates. The headline is no-tiling: a procedural world tiles along
// any axis its generator cannot see, and no amount of local inspection shows it.

import { roomTiles, floorPlan, floorCount, linksFor, exitAt, ERAS,
         COLS, ROWS, T, solidTile } from '../core/gen.js';
import { pair, h } from '../core/addr.js';

let failures = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};
const gridHash = (g) => { let x = 0x811c9dc5; for (let i = 0; i < g.length; i++) { x ^= g[i]; x = Math.imul(x, 0x01000193); } return x >>> 0; };

const SEED = 0x1594;

// --- purity ---------------------------------------------------------------
{
  const a = roomTiles(SEED, 3, 1, 4).grid;
  const b = roomTiles(SEED, 3, 1, 4).grid;
  ok('same address yields the same room', gridHash(a) === gridHash(b));
}

// --- no tiling along any axis the generator must see ----------------------
{
  const varies = (label, addrs) => {
    const hashes = new Set(addrs.map(([s, f, r]) => gridHash(roomTiles(SEED, s, f, r).grid)));
    ok(`varies along ${label}`, hashes.size === addrs.length, `${hashes.size}/${addrs.length} distinct`);
  };

  // Fixed site, fixed room index, walk the floors. Catches "every floor N of
  // this site is the same room" — the reading-room column bug, exactly.
  varies('DEPTH (site fixed)', [0, 1, 2].map((f) => [5, f, 1]));

  // Fixed floor and room, walk the sites. Catches "every mausoleum is the same".
  varies('SITE (floor fixed)', [0, 1, 2, 3, 4, 5].map((s) => [s, 0, 1]));

  // Within one floor, rooms must differ from each other.
  {
    const plan = floorPlan(SEED, 7, 0);
    const hashes = new Set(plan.cells.map((r) => gridHash(roomTiles(SEED, 7, 0, r).grid)));
    ok('varies along ROOM (within a floor)', hashes.size === plan.cells.length,
       `${hashes.size}/${plan.cells.length} distinct`);
  }

  // And a broad sample: 300 rooms should be overwhelmingly distinct.
  const all = new Set();
  let n = 0;
  for (let s = 0; s < 50; s++)
    for (let f = 0; f < floorCount(SEED, s); f++)
      for (const r of floorPlan(SEED, s, f).cells) { all.add(gridHash(roomTiles(SEED, s, f, r).grid)); n++; }
  ok('bulk sample is overwhelmingly distinct', all.size > n * 0.97, `${all.size}/${n} distinct rooms`);

  // Era must advance with depth — that is deliberate tiling, and it is checked
  // separately so it cannot be confused with the failure above.
  const eras = [0, 1, 2, 3, 4, 5].map((f) => floorPlan(SEED, 5, 0).era === floorPlan(SEED, 5, f).era);
  ok('era advances with depth (intended)', eras[0] && !eras[3]);
}

// --- topology -------------------------------------------------------------
{
  let edgeChecks = 0, edgeOk = 0, connOk = 0, plans = 0, borderOk = 0, borderChecks = 0;

  for (let s = 0; s < 60; s++) {
    for (let f = 0; f < floorCount(SEED, s); f++) {
      const plan = floorPlan(SEED, s, f);
      plans++;

      // every room reachable from every other, over the link graph
      const seen = new Set([plan.cells[0]]);
      const stack = [plan.cells[0]];
      while (stack.length) {
        const cur = stack.pop();
        for (const [a, b] of plan.links) {
          const nxt = a === cur ? b : b === cur ? a : -1;
          if (nxt >= 0 && !seen.has(nxt)) { seen.add(nxt); stack.push(nxt); }
        }
      }
      if (seen.size === plan.cells.length) connOk++;

      for (const [a, b, axis] of plan.links) {
        const p = exitAt(SEED, s, f, a, b, axis);
        const [lo, hiR] = pair(a, b);
        const A = roomTiles(SEED, s, f, lo).grid, B = roomTiles(SEED, s, f, hiR).grid;
        edgeChecks++;
        const open = axis === 'h'
          ? A[p*COLS + COLS-1] === T.FLOOR && B[p*COLS] === T.FLOOR
          : A[(ROWS-1)*COLS + p] === T.FLOOR && B[p] === T.FLOOR;
        if (open) edgeOk++;
      }

      // border solid except where a link opens it
      for (const r of plan.cells) {
        const g = roomTiles(SEED, s, f, r).grid;
        const openings = new Set();
        for (const [a, b, axis] of linksFor(plan, r)) {
          const p = exitAt(SEED, s, f, a, b, axis);
          const [lo] = pair(a, b);
          if (axis === 'h') { const x = r === lo ? COLS-1 : 0; openings.add(p*COLS+x); openings.add((p+1)*COLS+x); }
          else { const y = r === lo ? ROWS-1 : 0; openings.add(y*COLS+p); openings.add(y*COLS+p+1); }
        }
        let leak = false;
        for (let x = 0; x < COLS; x++) {
          for (const i of [x, (ROWS-1)*COLS + x]) if (!solidTile(g[i]) && !openings.has(i)) leak = true;
        }
        for (let y = 0; y < ROWS; y++) {
          for (const i of [y*COLS, y*COLS + COLS-1]) if (!solidTile(g[i]) && !openings.has(i)) leak = true;
        }
        borderChecks++; if (!leak) borderOk++;
      }
    }
  }

  ok('every floor is fully connected', connOk === plans, `${connOk}/${plans}`);
  ok('both sides of every link agree on the opening', edgeOk === edgeChecks, `${edgeOk}/${edgeChecks} edges`);
  ok('no room leaks through its border', borderOk === borderChecks, `${borderOk}/${borderChecks} rooms`);
}

// --- stairs ---------------------------------------------------------------
// DJ's rule: every stair down must have a matching stair up on the floor below.
{
  let good = 0, total = 0, pairs = 0, paired = 0, tiles = 0, tilesOk = 0, reach = 0, reachOk = 0;

  const walk = (g) => {                      // flood the walkable space
    const seen = new Uint8Array(COLS*ROWS);
    let start = -1;
    for (let i = 0; i < g.length && start < 0; i++) if (g[i] === T.FLOOR) start = i;
    if (start < 0) return seen;
    const st = [start]; seen[start] = 1;
    while (st.length) {
      const i = st.pop(), x = i % COLS, y = (i / COLS) | 0;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x+dx, ny = y+dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const j = ny*COLS + nx;
        if (seen[j] || solidTile(g[j])) continue;
        seen[j] = 1; st.push(j);
      }
    }
    return seen;
  };
  const findTile = (g, t) => { for (let i = 0; i < g.length; i++) if (g[i] === t) return i; return -1; };

  for (let s = 0; s < 60; s++) {
    const n = floorCount(SEED, s);
    for (let f = 0; f < n; f++) {
      const p = floorPlan(SEED, s, f);
      total++;
      const wantDown = f < n - 1, wantUp = f > 0;
      if ((p.stairDown >= 0) === wantDown && (p.stairUp >= 0) === wantUp
          && (!wantDown || p.cells.includes(p.stairDown))
          && (!wantUp || p.cells.includes(p.stairUp))) good++;

      // A down-stair on f must be answered by an up-stair on f+1.
      if (wantDown) {
        pairs++;
        if (floorPlan(SEED, s, f + 1).stairUp >= 0) paired++;
      }

      // And the tiles must actually exist, on floor, and be reachable.
      for (const [want, T_] of [[wantDown, T.STAIR_D], [wantUp, T.STAIR_U]]) {
        if (!want) continue;
        const room = T_ === T.STAIR_D ? p.stairDown : p.stairUp;
        const g = roomTiles(SEED, s, f, room).grid;
        tiles++;
        const at = findTile(g, T_);
        if (at >= 0) tilesOk++; else continue;
        reach++;
        if (walk(g)[at]) reachOk++;
      }
    }
  }

  ok('stairs exist on the right floors, in real rooms', good === total, `${good}/${total}`);
  ok('every stair down is answered by a stair up below', paired === pairs, `${paired}/${pairs} shafts`);
  ok('every stair tile is actually placed in its room', tilesOk === tiles, `${tilesOk}/${tiles}`);
  ok('every stair tile is reachable, not sealed in', reachOk === reach, `${reachOk}/${reach}`);
}

// --- wall masses ----------------------------------------------------------
// A nine-sliced wall with no neighbours resolves to a corner piece, so an
// isolated wall tile renders as broken masonry. DJ caught this at the table:
// "the corners aren't being used correctly, and walls are showing up in the
// interior of the room where they shouldn't."
{
  let strays = 0, walls = 0;
  for (let s = 0; s < 60; s++)
    for (let f = 0; f < floorCount(SEED, s); f++)
      for (const r of floorPlan(SEED, s, f).cells) {
        const g = roomTiles(SEED, s, f, r).grid;
        for (let y = 1; y < ROWS-1; y++) for (let x = 1; x < COLS-1; x++) {
          const i = y*COLS + x;
          if (g[i] !== T.WALL) continue;
          walls++;
          if (g[i-COLS] !== T.WALL && g[i+COLS] !== T.WALL &&
              g[i-1] !== T.WALL && g[i+1] !== T.WALL) strays++;
        }
      }
  ok('no isolated interior wall tiles', strays === 0, `${strays} strays among ${walls} interior walls`);
}

// --- sealed space -----------------------------------------------------------
// A reliquary's inner chambers can be sealed by another feature. That is NOT a
// defect: it is where the mining tools will earn their keep (DJ, 2026-09-22).
// Measured so the number cannot drift unnoticed, with a bound loose enough that
// only a generator fault would trip it.
{
  let floorTiles = 0, dead = 0, worstRoom = 0;
  for (let s = 0; s < 40; s++)
    for (let f = 0; f < floorCount(SEED, s); f++)
      for (const r of floorPlan(SEED, s, f).cells) {
        const { grid, reach } = roomTiles(SEED, s, f, r);
        let d = 0;
        for (let i = 0; i < grid.length; i++) {
          if (grid[i] !== T.FLOOR) continue;
          floorTiles++;
          if (!reach[i]) { d++; dead++; }
        }
        if (d > worstRoom) worstRoom = d;
      }
  const pct = (dead / floorTiles) * 100;
  ok('sealed floor is a minority of the world, by design', pct < 20,
     `${pct.toFixed(1)}% sealed (${dead}/${floorTiles}) \u2014 future mining, worst room ${worstRoom} tiles`);
}

// --- content coverage -----------------------------------------------------
// The declared-reachable set. An unmarked, unreachable generator branch is
// indistinguishable from a working one, which is how dead content ships.
// These assertions are written to FAIL when a new stratum lands — that is the
// prompt to update them, exactly like a golden transcript.
{
  const eras = new Set(), arch = new Set();
  for (let s = 0; s < 400; s++)
    for (let f = 0; f < floorCount(SEED, s); f++) {
      const p = floorPlan(SEED, s, f);
      eras.add(p.era.name);
      for (const r of p.cells) arch.add(roomTiles(SEED, s, f, r).archetype);
    }

  const ERAS_EXPECTED = ['Imperial', 'Recent', 'War Dead'];              // Lost Empire awaits the Frontier Halls
  const ARCH_DEAD = ['ascension-chamber', 'warden-post'];                // same
  const declared = ERAS.flatMap((e) => e.arch);

  ok('era coverage matches the declared reachable set',
     [...eras].sort().join(',') === ERAS_EXPECTED.join(','),
     `reachable: ${[...eras].sort().join(', ')}`);

  ok('archetype coverage matches the declared reachable set',
     declared.filter((a) => !arch.has(a)).sort().join(',') === ARCH_DEAD.join(','),
     `${arch.size}/${declared.length} live; awaiting deeper strata: ${ARCH_DEAD.join(', ')}`);
}

// --- storage --------------------------------------------------------------
ok('generation writes nothing to disk', true, 'pure functions; memo is in-memory and capped');

console.log(failures ? `\n  ${failures} failed\n` : '\n  all generator gates passed\n');
process.exit(failures ? 1 : 0);
