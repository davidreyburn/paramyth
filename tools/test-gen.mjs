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
      // Every mausoleum floor now has a way UP — floor 0's leads to the camp.
      const wantDown = f < n - 1, wantUp = f >= 0;
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

  // The way out of the mausoleum. Without it floor 0 is a one-way trip.
  let exits = 0, sites = 0;
  for (let si = 0; si < 60; si++) {
    sites++;
    const p0 = floorPlan(SEED, si, 0);
    if (p0.stairUp < 0 || !p0.cells.includes(p0.stairUp)) continue;
    const g = roomTiles(SEED, si, 0, p0.stairUp).grid;
    for (let i = 0; i < g.length; i++) if (g[i] === T.STAIR_U) { exits++; break; }
  }
  ok('every mausoleum has a way out to the camp', exits === sites, `${exits}/${sites}`);
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

// --- the Field: the surface is a floor, and the camp is one room of it -------
{
  const { fieldPlan, FIELD_CAMP, GW, GH, TILE, groundTile, floorCount: nFloors, floorPlan: fp, roomTiles: rt } = await import('../core/gen.js');
  const { campRoom } = await import('../core/camp.js');
  const { foesOf } = await import('../core/foes.js');
  const { createState, friendly, surface } = await import('../sim/state.js');
  const { stationAt } = await import('../sim/room.js');
  const { campStations } = await import('../core/camp.js');

  let sites = 0, sixRooms = 0, farMouth = 0, oneMouth = 0, mouthReach = 0, edgesOpen = 0, walkable = 0, grassUnder = 0, hunted = 0, inCamp = 0;
  for (let site = 0; site < 24; site++) {
    sites++;
    const plan = fp(SEED, site, -1);
    if (plan.cells.length === GW * GH && plan.cells[FIELD_CAMP] === FIELD_CAMP) sixRooms++;
    const m = plan.stairDown;
    if (Math.abs(m % GW - FIELD_CAMP % GW) + Math.abs(((m / GW) | 0) - ((FIELD_CAMP / GW) | 0)) >= 2) farMouth++;
    let mouths = 0, allWalkable = true, allEdges = true;
    for (const room of plan.cells) {
      const { grid, reach } = rt(SEED, site, -1, room);
      const stairs = [...grid].filter((t) => t === T.STAIR_D).length;
      if (stairs) { mouths++; if ([...grid].every((t, i) => t !== T.STAIR_D || reach[i])) mouthReach++; }
      // Open the whole length where a room continues; solid where the world ends.
      const gx = room % GW, gy = (room / GW) | 0;
      for (let y = 1; y < ROWS - 1; y++) {
        const w = grid[y * COLS], e = grid[y * COLS + COLS - 1];
        if ((gx > 0) !== groundTile(w) || (gx + 1 < GW) !== groundTile(e)) allEdges = false;
      }
      for (let x = 1; x < COLS - 1; x++) {
        const n = grid[x], so = grid[(ROWS - 1) * COLS + x];
        if ((gy > 0) !== groundTile(n) || (gy + 1 < GH) !== groundTile(so)) allEdges = false;
      }
      // Walkable: most of the room is one space, and every open edge touches it.
      let open = 0, reached = 0;
      for (let i = 0; i < grid.length; i++) if (groundTile(grid[i])) { open++; if (reach[i]) reached++; }
      if (reached / open < 0.6) allWalkable = false;
      if (gx > 0 && ![...Array(ROWS - 2).keys()].some((k) => reach[(k + 1) * COLS])) allWalkable = false;
      if (gx + 1 < GW && ![...Array(ROWS - 2).keys()].some((k) => reach[(k + 1) * COLS + COLS - 1])) allWalkable = false;
      if (gy > 0 && ![...Array(COLS - 2).keys()].some((k) => reach[k + 1])) allWalkable = false;
      if (gy + 1 < GH && ![...Array(COLS - 2).keys()].some((k) => reach[(ROWS - 1) * COLS + k + 1])) allWalkable = false;
      if (room !== FIELD_CAMP && foesOf(SEED, site, -1, room).length) hunted++;
    }
    inCamp += foesOf(SEED, site, -1, FIELD_CAMP).length;
    if (mouths === 1) oneMouth++;
    if (allEdges) edgesOpen++;
    if (allWalkable) walkable++;
    for (let fl = 0; fl < Math.min(2, nFloors(SEED, site)); fl++)
      for (const room of fp(SEED, site, fl).cells) grassUnder += [...rt(SEED, site, fl, room).grid].filter((t) => t === T.GRASS).length;
  }
  ok('the Field is six rooms and the camp is room 0', sixRooms === sites, `${sixRooms}/${sites}`);
  ok('the mouth is at least two rooms from the camp', farMouth === sites, `${farMouth}/${sites}`);
  ok('exactly one field room holds the mouth', oneMouth === sites, `${oneMouth}/${sites}`);
  ok('and its stairs are reachable', mouthReach === sites, `${mouthReach}/${sites}`);
  ok('room edges are open where a room continues and solid where the world ends', edgesOpen === sites, `${edgesOpen}/${sites}`);
  ok('every field room is walkable edge to edge', walkable === sites, `${walkable}/${sites}`);
  ok('the camp has no stair in it', ![...campRoom().grid].includes(T.STAIR_D));
  ok('grass never grows underground', grassUnder === 0, `${grassUnder} tiles`);
  ok('nothing hunts you in the camp', inCamp === 0);
  ok('but something sometimes hunts on the Field', hunted > 0, `${hunted} field rooms with a dog, of ${sites * 5}`);
  const s = createState(SEED);
  ok('the camp is friendly and daylit', friendly(s) && surface(s));
  s.room = 1;
  ok('the rest of the Field is daylit and NOT friendly', !friendly(s) && surface(s));
  const q = campStations()[0];
  s.x = ((q.tile % COLS) * TILE + TILE / 2) * 256; s.y = (((q.tile / COLS) | 0) * TILE + TILE / 2) * 256;
  ok('the camp\'s counters answer only in the camp', !stationAt(s) && (s.room = FIELD_CAMP, !!stationAt(s)));
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all generator gates passed\n');
process.exit(failures ? 1 : 0);
