// Gates for the tools: the Blasting Cap first. Run: node tools/test-tools.mjs
// Written from what was observed, like the rest — a cap that lands in the
// wrong place or hurts twice would have shown up here first.

import { createState, hashState, spawnIn, toDelta, UNITS, MAX_HP, saying } from '../sim/state.js';
import { step, applyAction, enterRoom } from '../sim/step.js';
import combat from '../systems/combat/index.js';
import { VERB, setVerb } from '../sim/frame.js';
import { KIND, blastOf, slotOf, isTool } from '../core/items.js';
import { roomTiles, floorPlan, floorCount, contentsOf, COLS, ROWS, TILE, T, solidTile } from '../core/gen.js';
import { gridOf, roomView } from '../sim/room.js';
import { plantAt, inBlast, liveBlasts, capsHere, brokenKey } from '../sim/blast.js';
import { HALF, impulse } from '../sim/space.js';
import { FOE } from '../core/foes.js';

let failures = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!c) failures++; };
const SEED = 0x1594;
const SYSTEMS = [combat];
const CAP = blastOf('bcap');
const ref = (kind, n = 0) => ({ kind, key: `0:0:0:${n}` });
const tileAt = (s) => Math.floor(s.y / (TILE * UNITS)) * COLS + Math.floor(s.x / (TILE * UNITS));
const centre = (t) => ({ x: ((t % COLS) * TILE + TILE / 2) * UNITS, y: (((t / COLS) | 0) * TILE + TILE / 2) * UNITS });
// Press, then release: a held button is one press, and the next only counts
// once the last was let go.
const press = (s, verb) => { step(s, setVerb(0, verb, true), SYSTEMS); step(s, 0, SYSTEMS); };
const wait = (s, n) => { for (let i = 0; i < n; i++) step(s, 0, SYSTEMS); };

// A place underground with a rubble tile beside a reachable floor tile. The
// player stands on the floor, facing the rubble.
function rubbleSpot() {
  for (let site = 0; site < 8; site++)
    for (let fl = 0; fl < floorCount(SEED, site); fl++)
      for (const room of floorPlan(SEED, site, fl).cells) {
        const { grid, reach } = roomTiles(SEED, site, fl, room);
        for (let t = 0; t < grid.length; t++) {
          if (grid[t] !== T.RUBBLE) continue;
          const x = t % COLS, y = (t / COLS) | 0;
          for (const [dx, dy, facing] of [[1, 0, 3], [-1, 0, 1], [0, 1, 0], [0, -1, 2]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
            const n = ny * COLS + nx;
            const b = (ny + dy) * COLS + (nx + dx);                       // the tile behind you: somewhere to step clear
            if (grid[n] === T.FLOOR && reach[n] && grid[b] === T.FLOOR && reach[b]) return { site, floor: fl, room, rubble: t, stand: n, facing };
          }
        }
      }
  return null;
}
function at(spot) {
  const s = createState(SEED);
  s.site = spot.site; s.floor = spot.floor; s.room = spot.room;
  const c = centre(spot.stand); s.x = c.x; s.y = c.y; s.facing = spot.facing;
  s.hp = 1000;
  enterRoom(s);
  s.foes = [];                                     // the rubble is the subject
  return s;
}

// --- the item ------------------------------------------------------------------
{
  ok('the Blasting Cap is a tool', isTool('bcap') && slotOf('bcap') === 'tool');
  ok('and reads B.Cap on the glass', KIND.bcap.label === 'B.Cap', KIND.bcap.label);
  ok('a Worker is issued one', createState(SEED).equipped.tool?.kind === 'bcap');
  ok('it is cheap: the low end of the scrap sink', KIND.bcap.value <= 3, `${KIND.bcap.value} scrap`);
  let found = 0;
  for (let site = 0; site < 8; site++)
    for (let fl = 0; fl < floorCount(SEED, site); fl++)
      for (const room of floorPlan(SEED, site, fl).cells)
        for (const c of contentsOf(SEED, site, fl, room)) if (c.kind === 'bcap') found++;
  ok('and more can be found in the world', found > 0, `${found} lying about in 8 sites`);
  ok('its shove is the heavy impact a sword is not', impulse(CAP.knock, FOE.sentinel.weight) > 0 && impulse(KIND.sword.knock, FOE.sentinel.weight) === 0,
     `knock ${CAP.knock} moves a Sentinel; ${KIND.sword.knock} does not`);
}

// --- setting one ----------------------------------------------------------------
const spot = rubbleSpot();
ok('the world has rubble beside floor to test against', !!spot, spot ? `site ${spot.site} floor ${spot.floor} room ${spot.room}` : 'none');
if (spot) {
  {
    const s = at(spot);
    ok('the tile ahead is the rubble, and it is solid', solidTile(gridOf(s)[spot.rubble]));
    const p = plantAt(s);
    ok('a cap set facing rubble lands at your feet', p.x === s.x && p.y === s.y, 'the tile ahead is solid');
    press(s, VERB.TOOL);
    ok('the tool verb sets it', s.charges.length === 1 && s.charges[0].kind === 'bcap', `${s.charges.length} set`);
    ok('and empties the slot', s.equipped.tool === null);
    ok('it shows up in this room', capsHere(s).length === 1);
    ok('and nothing has happened yet', s.blasts.length === 0 && s.broken.length === 0);
    const setAt = s.charges[0].at;
    let n = 0;
    while (s.charges.length && n < 200) { wait(s, 1); n++; }
    ok('nothing happens for the length of the fuse, then it goes', s.charges.length === 0 && s.blasts.length === 1 && s.blasts[0].at - setAt === CAP.fuse,
       `set at ${setAt}, went at ${s.blasts[0]?.at}: ${CAP.fuse} ticks`);
    ok('and the rubble is floor', gridOf(s)[spot.rubble] === T.FLOOR);
    // A line of delta per tile: sometimes two, when a second rubble sits inside the square.
    ok('recorded as a line of delta per tile', s.broken.includes(brokenKey(spot.site, spot.floor, spot.room, spot.rubble)) && s.broken.length <= 4, s.broken.join(' '));
    ok('while the generator still says rubble — the world stays pure', roomTiles(SEED, spot.site, spot.floor, spot.room).grid[spot.rubble] === T.RUBBLE);
    wait(s, CAP.linger - 1);
    ok('the blast lingers', s.blasts.length === 1, `still there after ${CAP.linger - 1} ticks`);
    wait(s, 1);
    ok('then is gone', s.blasts.length === 0, `${CAP.linger} ticks`);
    // Walk onto where the rubble was.
    const toward = [VERB.UP, VERB.RIGHT, VERB.DOWN, VERB.LEFT][spot.facing];
    for (let i = 0; i < 60 && tileAt(s) !== spot.rubble; i++) step(s, setVerb(0, toward, true), SYSTEMS);
    ok('and you can walk where the rubble was', tileAt(s) === spot.rubble);
  }

  // The next cap from the pack takes the slot.
  {
    const s = at(spot);
    s.carried = [ref('bones', 1), ref('bcap', 2), ref('bcap', 3)];
    press(s, VERB.TOOL);
    ok('the next cap from the pack takes its place', s.equipped.tool?.kind === 'bcap' && s.equipped.tool.key === '0:0:0:2' && s.carried.length === 2,
       `slot ${s.equipped.tool?.key}, pack ${s.carried.map((r) => r.kind).join(',')}`);
    press(s, VERB.TOOL); press(s, VERB.TOOL);
    ok('until there are none', s.equipped.tool === null && s.charges.length === 3 && s.carried.length === 1);
    press(s, VERB.TOOL);
    ok('and an empty hand says so', s.charges.length === 3 && !!saying(s), saying(s)?.text);
  }

  // In camp the verb refuses, out loud.
  {
    const s = createState(SEED);
    press(s, VERB.TOOL);
    ok('no caps in camp', s.charges.length === 0 && !!saying(s) && s.equipped.tool !== null, saying(s)?.text);
  }

  // The break is saved and replayed.
  {
    const s = at(spot);
    press(s, VERB.TOOL); wait(s, CAP.fuse + 2);
    const d = JSON.parse(JSON.stringify(toDelta(s)));
    const r = Object.assign(createState(SEED), d); enterRoom(r);
    ok('the break survives a save', gridOf(r)[spot.rubble] === T.FLOOR);
    const a = at(spot), b = at(spot);
    const frames = [setVerb(0, VERB.TOOL, true), ...Array(CAP.fuse + CAP.linger + 5).fill(0)];
    for (const f of frames) step(a, f, SYSTEMS);
    for (const f of frames) step(b, f, SYSTEMS);
    ok('and replays', hashState(a) === hashState(b) && a.broken.length >= 1, `${hashState(a).toString(16)} vs ${hashState(b).toString(16)}, ${a.broken.length} broken`);
    ok('everything about it is an integer', s.blasts.every((x) => Number.isInteger(x.x) && Number.isInteger(x.r)) && s.charges.every((c) => Number.isInteger(c.x)));
  }

  // It hurts what stands in it, once, and shoves it.
  {
    const hurt = (kind) => {
      const s = at(spot);
      const f = { id: 'target', kind, x: s.x + 2 * HALF + 4 * UNITS, y: s.y, hp: FOE[kind].hp,
                  mode: 'stagger', modeAt: s.tick + 10000, spin: 1, aimX: 0, aimY: 0, vx: 0, vy: 0 };   // held still
      s.foes = [f];
      press(s, VERB.TOOL);
      const x0 = f.x;
      let hurtTicks = 0, prev = f.hp;
      for (let i = 0; i < CAP.fuse + CAP.linger + 2; i++) { step(s, 0, SYSTEMS); if (s.foes.length && f.hp < prev) { hurtTicks++; prev = f.hp; } }
      const dead = !s.foes.length;
      return { dead, hp: f.hp, hurtTicks, moved: (f.x - x0) / UNITS };
    };
    const dog = hurt('dog');
    ok('a dog in the blast is hurt', dog.dead || dog.hp === FOE.dog.hp - CAP.damage, dog.dead ? 'dead' : `hp ${dog.hp}`);
    ok('and only once, though the blast lingers', dog.hurtTicks <= 1, `${dog.hurtTicks} hurt ticks`);
    const sen = hurt('sentinel');
    ok('a Sentinel in the blast is hurt', sen.hp === FOE.sentinel.hp - CAP.damage, `hp ${sen.hp}/${FOE.sentinel.hp}`);
    ok('and MOVED — the cap is what a sword is not', sen.moved > 2, `${sen.moved.toFixed(1)}px`);
  }

  // It hurts you too, if you stand there; not if you step clear.
  {
    const s = at(spot);
    press(s, VERB.TOOL); wait(s, CAP.fuse + 2);
    ok('standing on your own cap hurts', s.hp === 1000 - CAP.self, `hp ${s.hp}`);
    const c = at(spot);
    press(c, VERB.TOOL);
    // Step clear: away from the rubble, along whatever is open.
    const away = [VERB.DOWN, VERB.LEFT, VERB.UP, VERB.RIGHT][c.facing];
    for (let i = 0; i < CAP.fuse + 3; i++) step(c, setVerb(0, away, true), SYSTEMS);
    ok('stepping clear does not', c.hp === 1000 && c.broken.length >= 1, `hp ${c.hp}, ${c.broken.length} broken`);
  }
}

// --- what a blast does to the things in it: plans/blast-interactions.md --------
{
  const { forceOn } = await import('../core/items.js');
  const { thingsIn, containerItems } = await import('../sim/room.js');
  const { SURVIVOR_ODDS } = await import('../sim/blast.js');
  const { putDownRef } = await import('../sim/step.js');

  ok('a chest stands; everything else breaks', forceOn('chest') === 'stands' && ['barrel', 'pot', 'urn', 'table', 'chair', 'gem', 'sword'].every((k) => forceOn(k) === 'breaks'));

  // Every place a given kind stands beside reachable, EMPTY floor. You stand
  // on the floor facing it, so the cap lands at your feet and the square
  // covers it. Empty matters: a pot under your feet once broke in a gem's
  // fixture and scarred the tile the gem was supposed to leave clean.
  function besides(kind, sites = 8) {
    const out = [];
    for (let site = 0; site < sites; site++)
      for (let fl = 0; fl < floorCount(SEED, site); fl++)
        for (const room of floorPlan(SEED, site, fl).cells) {
          const { grid, reach } = roomTiles(SEED, site, fl, room);
          const all = contentsOf(SEED, site, fl, room);
          const busy = new Set(all.map((c) => c.tile));
          for (const c of all) {
            if (c.kind !== kind) continue;
            const x = c.tile % COLS, y = (c.tile / COLS) | 0;
            for (const [dx, dy, facing] of [[1, 0, 3], [-1, 0, 1], [0, 1, 0], [0, -1, 2]]) {
              const nx = x + dx, ny = y + dy;
              if (nx < 1 || ny < 1 || nx >= COLS - 1 || ny >= ROWS - 1) continue;
              const t = ny * COLS + nx;
              if (grid[t] !== T.FLOOR || !reach[t] || busy.has(t)) continue;
              out.push({ site, floor: fl, room, thing: c, stand: t, facing });
              break;
            }
          }
        }
    return out;
  }
  const beside = (kind) => besides(kind)[0] || null;
  const standAt = (spot) => {
    const s = createState(SEED);
    s.site = spot.site; s.floor = spot.floor; s.room = spot.room;
    const c = centre(spot.stand); s.x = c.x; s.y = c.y; s.facing = spot.facing; s.hp = 1000;
    enterRoom(s); s.foes = [];
    return s;
  };
  const here = (s) => thingsIn(s, s.site, s.floor, s.room);
  const blow = (s) => { press(s, VERB.TOOL); wait(s, CAP.fuse + 2); };

  // A barrel breaks; a scar remains; you can walk where it stood.
  {
    const spot = beside('barrel');
    ok('there is a barrel beside floor to test against', !!spot);
    if (spot) {
      const s = standAt(spot);
      const key = `${spot.site}:${spot.floor}:${spot.room}:${spot.thing.slot}`;
      ok('the barrel is there before', here(s).some((t) => t.key === key));
      blow(s);
      ok('a barrel in the square is gone after', !here(s).some((t) => t.key === key));
      ok('and it is taken, not dropped: its key still has a history', s.taken.includes(key) && !s.dropped.some((d) => d.key === key));
      ok('a blasted barrel leaves a scar on its tile', roomView(s).scars.has(spot.thing.tile), [...roomView(s).scars].join(','));
      const d = JSON.parse(JSON.stringify(toDelta(s)));
      const r = Object.assign(createState(SEED), d); enterRoom(r);
      ok('the scar survives a save', roomView(r).scars.has(spot.thing.tile));
      const toward = [VERB.UP, VERB.RIGHT, VERB.DOWN, VERB.LEFT][spot.facing];
      for (let i = 0; i < 60 && tileAt(s) !== spot.thing.tile; i++) step(s, setVerb(0, toward, true), SYSTEMS);
      ok('and you can walk where the barrel stood', tileAt(s) === spot.thing.tile);
    }
  }

  // A loose thing on the floor in the square is gone.
  {
    const spot = beside('table');
    ok('there is a table beside floor to test against', !!spot);
    if (spot) {
      const s = standAt(spot);
      s.carried = [ref('gem', 7)];
      ok('a gem put down lands at your feet', putDownRef(s, s.carried[0]) && s.dropped[0].tile === spot.stand);
      s.carried = [];
      blow(s);
      ok('a loose gem in the square is gone', !s.dropped.some((d) => d.key === '0:0:0:7') && !here(s).some((t) => t.key === '0:0:0:7'));
      ok('and a gem leaves no scar; furniture does', !roomView(s).scars.has(spot.stand) && roomView(s).scars.has(spot.thing.tile));
    }
  }

  // A chest stands, contents and all.
  {
    const spot = beside('chest');
    ok('there is a chest beside floor to test against', !!spot);
    if (spot) {
      const s = standAt(spot);
      const key = `${spot.site}:${spot.floor}:${spot.room}:${spot.thing.slot}`;
      const before = containerItems(s, key).map((x) => x.key).join(',');
      blow(s);
      ok('a chest in the square stands', here(s).some((t) => t.key === key) && !s.taken.includes(key));
      ok('with its contents intact', containerItems(s, key).map((x) => x.key).join(',') === before, `${before.split(',').filter(Boolean).length} inside`);
    }
  }

  // A broken container leaves one thing behind, one time in three — the same
  // one on replay, keyed to the container and not to luck.
  {
    let tried = 0, spared = 0, agreed = 0, keyed = 0, wrong = 0;
    // Across the whole world: 27 pots once read 15% by bad luck against a true 34%.
    for (const spot of [...besides('pot', 24), ...besides('urn', 24), ...besides('barrel', 24)]) {
      const key = `${spot.site}:${spot.floor}:${spot.room}:${spot.thing.slot}`;
      const a = standAt(spot), b = standAt(spot);
      const inside = containerItems(a, key);
      if (!inside.length) continue;
      tried++;
      blow(a); blow(b);
      const left = a.dropped.filter((d) => d.tile === spot.thing.tile);
      if (left.length) {
        spared++;
        if (left.length === 1 && left[0].key === inside[0].key) keyed++;
      }
      if (JSON.stringify(a.dropped) === JSON.stringify(b.dropped) && hashState(a) === hashState(b)) agreed++;
      if (!inside.every((x) => a.taken.includes(x.key))) wrong++;
    }
    ok('enough containers with something in them to measure', tried >= 40, `${tried} containers`);
    ok('a broken container leaves one thing behind about one time in three', spared > 0 && spared / tried >= 0.22 && spared / tried <= 0.45,
       `${spared}/${tried} spared, odds ${SURVIVOR_ODDS.join(' in ')}`);
    ok('the survivor is its first thing, on the pot\'s tile, with its own key', keyed === spared, `${keyed}/${spared}`);
    ok('the rest are taken, so no trove advertises them', wrong === 0);
    ok('and the same pot gives the same answer on replay', agreed === tried, `${agreed}/${tried}`);
  }
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all tool gates passed\n');
process.exit(failures ? 1 : 0);
