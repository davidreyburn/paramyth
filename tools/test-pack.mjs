// Asset-layer gates. Art is referenced, never assumed: the manifest must cover
// every tile the generator can emit, and the game must still run without it.

import { readFile } from 'node:fs/promises';
import { drawsFor, glazeFor } from '../render/tileset.js';
import { roomTiles, floorPlan, COLS, ROWS } from '../core/gen.js';
import { T } from '../core/gen.js';
import { LIGHT_BANDS, LIGHT_BEYOND, TONES, P, FLICKER, LAMP_BACK, lampShape, SURFACE_LIFT } from '../core/palette.js';
import { ERAS } from '../core/gen.js';

let failures = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

const pack = JSON.parse(await readFile(new URL('../assets/packs/onebit.json', import.meta.url)));

const names = Object.keys(T);
const KINDS = ['variants', 'nineslice', 'overlay'];

const missing = names.filter((n) => !pack.tiles[n]);
ok('pack covers every tile type the generator can emit', missing.length === 0,
   missing.length ? 'missing: ' + missing.join(', ') : `${names.length} types`);

const stray = Object.keys(pack.tiles).filter((n) => !(n in T));
ok('pack declares no tile type the generator cannot emit', stray.length === 0, stray.join(', '));

const badKind = Object.entries(pack.tiles).filter(([, d]) => !KINDS.includes(d.kind));
ok('every type declares a known kind', badKind.length === 0,
   badKind.map(([n, d]) => `${n}:${d.kind}`).join(', '));

// Cells: variants and overlay need at least one; every cell names a real sheet.
const cellDefs = Object.entries(pack.tiles).filter(([, d]) => d.kind !== 'nineslice');
const noCells = cellDefs.filter(([, d]) => !d.cells || !d.cells.length);
ok('every cell-based type has at least one variant', noCells.length === 0,
   noCells.map(([n]) => n).join(', '));

const badSheet = cellDefs.flatMap(([n, d]) =>
  (d.cells || []).filter((c) => !pack.sheets[c[0]]).map((c) => `${n}->${c[0]}`));
ok('every variant names a declared sheet', badSheet.length === 0, badSheet.join(', '));

// Nine-slice: the 3x3 block must fit, and the sheet must exist.
const nine = Object.entries(pack.tiles).filter(([, d]) => d.kind === 'nineslice');
const badNine = nine.filter(([, d]) =>
  !pack.sheets[d.sheet] || !Array.isArray(d.origin) || d.origin.length !== 2 ||
  d.origin[0] < 0 || d.origin[1] < 0);
ok('every nine-slice names a sheet and a valid origin', badNine.length === 0,
   badNine.map(([n]) => n).join(', '));
ok('walls are nine-sliced, not random variants', nine.some(([n]) => n === 'WALL'),
   nine.length ? nine.map(([n]) => n).join(', ') : 'none — a wall picked at random has no edges');

// Overlay bases must resolve, and must not cycle.
let baseOk = true, baseDetail = '';
for (const [n, d] of Object.entries(pack.tiles)) {
  if (d.kind !== 'overlay') continue;
  const seen = new Set([n]);
  let cur = d.base;
  while (cur) {
    if (!pack.tiles[cur] || seen.has(cur)) { baseOk = false; baseDetail = `${n} -> ${cur}`; break; }
    seen.add(cur);
    cur = pack.tiles[cur].base;
  }
}
ok('every overlay base resolves without a cycle', baseOk, baseDetail);

ok('pack tile size matches the world grid', pack.tile === 20, `pack ${pack.tile}px`);

const files = await Promise.all(Object.values(pack.sheets).map(async (s) => {
  const rel = decodeURIComponent(s).replace(/^\//, '');
  try { await readFile(new URL('../' + rel, import.meta.url)); return true; } catch { return false; }
}));
ok('every declared sheet exists on disk', files.every(Boolean),
   `${files.filter(Boolean).length}/${files.length}`);

// Every stratum must have a tone, or the atlas goes monochrome again.
const untoned = ERAS.map((e) => e.name).filter((n) => !TONES[n]);
ok('every era has a two-colour tone', untoned.length === 0, untoned.join(', '));

const toneVals = new Set(Object.values(TONES).map((t) => t.light));
ok('era tones are mutually distinct', toneVals.size === Object.keys(TONES).length,
   `${toneVals.size}/${Object.keys(TONES).length}`);

// Lighting invariants from design/palette.md.
let mono = true;
for (let i = 1; i < LIGHT_BANDS.length; i++) {
  if (LIGHT_BANDS[i].r <= LIGHT_BANDS[i-1].r) mono = false;
  if (LIGHT_BANDS[i].dark < LIGHT_BANDS[i-1].dark) mono = false;
  if (LIGHT_BANDS[i].warm[3] > LIGHT_BANDS[i-1].warm[3]) mono = false;
}
ok('light bands are monotonic: radius out, darker, less warm', mono, `${LIGHT_BANDS.length} bands`);
ok('the void law holds: beyond the lamp is fully unlit', LIGHT_BEYOND === 1,
   'a room with no source in it is not dim, it is unlit');
ok('outermost band reaches the lamp radius exactly', LIGHT_BANDS.at(-1).r === 1);

// The lamp is an egg, not a disc: pinched behind the player, swelling toward
// what they face. These bind the shape so it cannot quietly become a circle
// again, and cannot become a spotlight that blinds you to your own back.
ok('the lamp reaches its full radius dead ahead', lampShape(1) === 1, `${lampShape(1)}`);
ok('daylight lifts the surface rather than dimming it', SURFACE_LIFT > 1, `x${SURFACE_LIFT}`);
{
  // Push the lift far enough and two channels clamp at 255 together, which drags
  // the stratum's hue toward grey — the camp goes from warm stone to overcast
  // concrete. One channel clipping is what makes it read as sunlit; two is what
  // makes it read as washed out.
  //
  // Only the eras that can actually BE above ground matter here. The deep
  // strata clip at this lift and it costs nothing, because nothing lifts them:
  // there is no daylight in the Barrow Deep.
  const { campRoom } = await import('../core/camp.js');
  const surfaceEras = [campRoom().era.name];
  const lift = (hx, k) => [1,3,5].map((i) =>
    Math.min(255, Math.round(parseInt(hx.slice(i, i+2), 16) * k)));
  const washed = surfaceEras.filter((n) =>
    lift(TONES[n].light, SURFACE_LIFT).filter((c) => c === 255).length >= 2);
  ok('and does not wash the surface stratum out to grey', washed.length === 0,
     `${surfaceEras.join(', ')} at x${SURFACE_LIFT} -> ${lift(TONES[surfaceEras[0]].light, SURFACE_LIFT).join(',')}`);
}
ok('and least of all directly behind', lampShape(-1) === LAMP_BACK, `${lampShape(-1)}`);
ok('it never reaches further than the declared radius',
   [1, 0.5, 0, -0.5, -1].every((c) => lampShape(c) <= 1));
ok('you can still see the floor you are backing onto', lampShape(-1) > 0.2,
   `${(100*lampShape(-1)).toFixed(0)}% of full radius behind you`);
ok('and forward is worth turning for', lampShape(1) / lampShape(-1) > 2,
   `${(lampShape(1)/lampShape(-1)).toFixed(1)}:1 front to back`);
{
  let mono = true;
  for (let c = -1; c < 1; c += 0.05) if (lampShape(c + 0.05) < lampShape(c)) mono = false;
  ok('the egg swells smoothly from back to front, with no lip', mono);
  ok('abeam sits between the two', lampShape(0) > lampShape(-1) && lampShape(0) < lampShape(1),
     `${lampShape(0).toFixed(2)} abeam`);
}
ok('palette keeps true black available', P.void === '#000000');

// Band count and spacing are design decisions, so they are asserted rather than
// left to drift: evenly spaced bands read as a technical ramp, not a flame.
ok('few bands: 3 or fewer', LIGHT_BANDS.length <= 3, `${LIGHT_BANDS.length} bands`);

const widths = LIGHT_BANDS.map((b, i) => b.r - (i ? LIGHT_BANDS[i-1].r : 0));
let descending = true;
for (let i = 1; i < widths.length; i++) if (widths[i] >= widths[i-1]) descending = false;
ok('band widths descend', descending, widths.map((w) => w.toFixed(2)).join(' > '));

const even = widths.every((w) => Math.abs(w - widths[0]) < 0.02);
ok('bands are not evenly spaced', !even);

ok('flicker is defined and bounded', FLICKER.pulse > 0 && FLICKER.pulse < 0.25 && FLICKER.edge > 0 && FLICKER.edge < 0.25,
   `pulse ${FLICKER.pulse}, edge ${FLICKER.edge}, ${FLICKER.hz}Hz`);

// A room's border corner has wall on all four sides, so the orthogonals alone
// resolve it to the centre fill and no corner is drawn. DJ: "where's the
// corner?" The diagonal is what makes it a corner.
{
  const plan = floorPlan(0x1594, 0, 0);
  const g = roomTiles(0x1594, 0, 0, plan.cells[0]).grid;
  const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? -1 : g[y*COLS + x]);
  const nb = (x, y) => {
    const t = g[y*COLS + x];
    const same = (a, b) => { const o = at(a, b); return o === -1 || o === t; };
    return [same(x,y-1), same(x+1,y), same(x,y+1), same(x-1,y),
            same(x-1,y-1), same(x+1,y-1), same(x+1,y+1), same(x-1,y+1)];
  };

  const def = pack.tiles.WALL;
  const centre = [def.origin[0] + 1, def.origin[1] + 1];
  // The floor sits in the diagonal AWAY from each corner of the room.
  const corners = [[0, 0, 'se'], [COLS-1, 0, 'sw'], [COLS-1, ROWS-1, 'nw'], [0, ROWS-1, 'ne']];

  let good = 0, detail = [];
  for (const [x, y, diag] of corners) {
    const d = drawsFor(pack, 'WALL', x, y, nb(x, y));
    const want = [def.origin[0] + def.inner[diag][0], def.origin[1] + def.inner[diag][1]];
    const got = d && [d[0][1], d[0][2]];
    const isCentre = got && got[0] === centre[0] && got[1] === centre[1];
    if (got && got[0] === want[0] && got[1] === want[1]) good++;
    else detail.push(`(${x},${y}) wanted ${diag} ${want} got ${got}${isCentre ? ' — the plain centre fill: no corner drawn' : ''}`);
  }
  ok('every room corner draws a corner piece, not the centre fill',
     good === 4, good === 4 ? '4/4' : detail.join(' | '));

  const innerKeys = ['nw','ne','se','sw'];
  ok('the nine-slice declares all four inner corners',
     def.inner && innerKeys.every((k) => Array.isArray(def.inner[k]) && def.inner[k].length === 2),
     def.inner ? innerKeys.join(', ') : 'none declared');
}

// No tile type may draw as a featureless block. PILLAR pointed at the
// nine-slice's interior fill — 400 light pixels, no dark, no transparency —
// and read as a hole in the floor. Detail is what makes a tile look placed.
{
  const { readFileSync } = await import('node:fs');
  const { inflateSync } = await import('node:zlib');
  // Width and height come from the file's own IHDR. They used to be hardcoded
  // to the two reference sheets' sizes, which meant the first sheet of our OWN
  // art (160x20) was decoded with the wrong stride and this gate passed on noise.
  const decode = (rel) => {
    const d = readFileSync(new URL('../' + rel, import.meta.url));
    const w = d.readUInt32BE(16), h = d.readUInt32BE(20);
    let i = 8; const parts = [];
    while (i < d.length) { const ln = d.readUInt32BE(i);
      if (d.slice(i+4, i+8).toString() === 'IDAT') parts.push(d.slice(i+8, i+8+ln)); i += 12 + ln; }
    const raw = inflateSync(Buffer.concat(parts));
    const stride = w*4, out = Buffer.alloc(h*stride);
    let p = 0, prev = Buffer.alloc(stride);
    for (let y = 0; y < h; y++) {
      const ft = raw[p++]; const line = Buffer.from(raw.slice(p, p+stride)); p += stride;
      for (let x = 0; x < stride; x++) { const a = x>=4?line[x-4]:0, b = prev[x], c = x>=4?prev[x-4]:0;
        if (ft===1) line[x]=(line[x]+a)&255; else if (ft===2) line[x]=(line[x]+b)&255;
        else if (ft===3) line[x]=(line[x]+((a+b)>>1))&255;
        else if (ft===4){const q=a+b-c,pa=Math.abs(q-a),pb=Math.abs(q-b),pc=Math.abs(q-c);
          line[x]=(line[x]+(pa<=pb&&pa<=pc?a:pb<=pc?b:c))&255;} }
      line.copy(out, y*stride); prev = line;
    }
    return { out, stride, w, h };
  };
  const sheets = {};
  for (const [k, u] of Object.entries(pack.sheets)) {
    const rel = decodeURIComponent(u).replace(/^\//, '');
    sheets[k] = decode(rel);
  }
  // A cell that lies outside its sheet reads as zeros — 'transparent', which the
  // slab check would wave through. Refuse it instead.
  const offSheet = [];
  const cellsOf = (table) => Object.entries(table || {}).flatMap(([n, d]) => (d.cells || []).map((c) => [n, ...c]));
  for (const [name, sh, gx, gy] of [...cellsOf(pack.tiles), ...cellsOf(pack.items)]) {
    const { w, h } = sheets[sh];
    if ((gx+1)*pack.tile > w || (gy+1)*pack.tile > h) offSheet.push(`${name} -> ${sh} ${gx},${gy} (sheet ${w}x${h})`);
  }
  ok('every cell lies inside its sheet', offSheet.length === 0, offSheet.join(' | ') || `${Object.keys(sheets).map((k) => `${k} ${sheets[k].w}x${sheets[k].h}`).join(', ')}`);
  const flat = [];
  const check = (name, sheet, gx, gy) => {
    const { out, stride } = sheets[sheet];
    let light = 0, other = 0;
    for (let y = gy*pack.tile; y < (gy+1)*pack.tile; y++)
      for (let x = gx*pack.tile; x < (gx+1)*pack.tile; x++) {
        const i = y*stride + x*4;
        if (out[i+3] < 8 || out[i] < 120) other++; else light++;
      }
    if (other === 0) flat.push(`${name} -> ${sheet} ${gx},${gy}`);
  };
  for (const [name, def] of Object.entries(pack.tiles)) {
    if (def.kind === 'nineslice') continue;          // its centre IS fill, correctly
    for (const [sh, gx, gy] of def.cells || []) check(name, sh, gx, gy);
  }
  for (const [name, def] of Object.entries(pack.items || {}))
    for (const [sh, gx, gy] of def.cells || []) check(name, sh, gx, gy);

  ok('no tile or item draws as a featureless slab', flat.length === 0, flat.join(' | '));

  // An overlay promises its base shows through. Art with no transparent pixel
  // covers the base completely, so the base is a wasted draw and a false claim
  // — which is how the stairs kept a FLOOR underneath that nobody could see.
  const clearOf = (sheet, gx, gy) => {
    const { out, stride } = sheets[sheet];
    let clear = 0;
    for (let y = gy*pack.tile; y < (gy+1)*pack.tile; y++)
      for (let x = gx*pack.tile; x < (gx+1)*pack.tile; x++)
        if (out[y*stride + x*4 + 3] < 8) clear++;
    return clear;
  };
  const opaqueOverlays = [];
  for (const [name, def] of Object.entries(pack.tiles))
    if (def.kind === 'overlay')
      for (const [sh, gx, gy] of def.cells || [])
        if (clearOf(sh, gx, gy) === 0) opaqueOverlays.push(`${name} -> ${sh} ${gx},${gy}`);
  ok('every overlay lets its base show through', opaqueOverlays.length === 0,
     opaqueOverlays.join(' | ') || `${Object.values(pack.tiles).filter((d) => d.kind === 'overlay').length} overlays`);
}

// --- the value hierarchy ----------------------------------------------------
// `shade` is what places a tile in the light: floor sits dark and walkable, wall
// stone takes the light. A walkable tile drawn in the WALL's band reads as a
// block pasted on the floor, which is exactly what the stairs did for three
// releases. These are paired constants, so an assertion holds them together.
{
  const floor = pack.tiles.FLOOR.shade;
  const lum = (hx) => [1,3,5].reduce((a, i) => a + parseInt(hx.slice(i, i+2), 16), 0) / 3;
  const stairs = ['STAIR_D', 'STAIR_U'].map((n) => pack.tiles[n]);

  // Stairs were pulled down to the floor's own value to stop them reading as a
  // bright block pasted on the ground. That worked, and then they were nearly
  // invisible (DJ, 2026-09-22). They carry their OWN tone now, which answers
  // both complaints at once, so this gate asserts the new intent rather than the
  // old value.
  ok('stairs carry a fixed tone, so a staircase looks the same at every depth',
     stairs.every((t) => t.tone), stairs.map((t) => t.tone && t.tone.light).join(' '));
  ok('and both stairs agree with each other',
     JSON.stringify(stairs[0].tone) === JSON.stringify(stairs[1].tone));

  if (stairs.every((t) => t.tone)) {
    const st = stairs[0].tone;
    const brightestFloor = Math.max(...Object.values(TONES).map((t) => lum(t.light) * floor));
    ok('a stair is brighter than any floor it sits in, so you can find it',
       lum(st.light) > brightestFloor * 1.5,
       `stair ${lum(st.light).toFixed(0)} vs brightest floor ${brightestFloor.toFixed(0)}`);
    ok('but its dark half stays dark, so a descent still reads as a hole',
       lum(st.dark) <= brightestFloor * 1.15,
       `stair dark ${lum(st.dark).toFixed(0)} vs floor ${brightestFloor.toFixed(0)}`);
  }

  // Objects made of a material carry it around with them; architecture takes the
  // colour of the region it is in. That split is the whole rule.
  const FIXED = ['chest', 'barrel', 'table', 'chair'];
  const drifting = FIXED.filter((k) => !(pack.items[k] && pack.items[k].tone));
  ok('wood and gold are fixed across strata', drifting.length === 0,
     drifting.join(', ') || FIXED.join(', '));
  ok('the chest reads as gold, not as stone',
     lum(pack.items.chest.tone.light) > 150
       && parseInt(pack.items.chest.tone.light.slice(1,3),16) > parseInt(pack.items.chest.tone.light.slice(5,7),16) + 60,
     pack.items.chest.tone.light);
  ok('the stash counter is the same chest, in the same gold',
     JSON.stringify(pack.stations.stash.tone) === JSON.stringify(pack.items.chest.tone));
  ok('wood is one timber everywhere',
     new Set(['barrel','table','chair'].map((k) => JSON.stringify(pack.items[k].tone))).size === 1);

  // --- glaze ----------------------------------------------------------------
  // Pottery is not one colour the way timber is. A piece keeps its own glaze
  // forever, chosen from a palette belonging to the stratum it was FIRED in —
  // so a cobalt urn stays cobalt when you carry it up into the terracotta.
  {
    const strata = ERAS.map((e) => e.name);
    const missing = strata.filter((n) => !(pack.glazes && pack.glazes[n] && pack.glazes[n].length));
    ok('every stratum has a glaze palette', missing.length === 0, missing.join(', ') || strata.join(', '));

    const thin = strata.filter((n) => pack.glazes[n].length < 2);
    ok('and more than one glaze in each, or it is just a tone', thin.length === 0,
       thin.join(', ') || strata.map((n) => `${n} ${pack.glazes[n].length}`).join(' \u00b7 '));

    const sets = strata.map((n) => JSON.stringify(pack.glazes[n]));
    ok('no two strata share a palette', new Set(sets).size === sets.length);

    const allLights = strata.flatMap((n) => pack.glazes[n].map((g) => g.light));
    ok('and no glaze is reused across strata', new Set(allLights).size === allLights.length);

    ok('pottery is glazed', ['pot', 'urn'].every((k) => pack.items[k].glazed));
    ok('and things that are not pottery are not',
       ['chest','barrel','table','chair','sword','gem'].every((k) => !pack.items[k].glazed));

    // The same pot is the same colour forever. This is the actual request.
    const a1 = glazeFor(pack, 'urn', '0:2:1:3'), a2 = glazeFor(pack, 'urn', '0:2:1:3');
    ok('one pot is one colour, forever', a1 && a1.light === a2.light, a1 && a1.light);

    // Coverage: every glaze declared must actually be reachable, or it is dead
    // content that looks identical to working content.
    const used = new Set();
    for (let f = 0; f < 12; f++)
      for (let i = 0; i < 200; i++) {
        const g = glazeFor(pack, 'urn', `0:${f}:${i % 6}:${i}`);
        if (g) used.add(g.light);
      }
    const dead = allLights.filter((l) => !used.has(l));
    ok('every glaze is reachable', dead.length === 0, dead.join(', ') || `${used.size}/${allLights.length}`);

    // And a piece is glazed from its OWN address, not from wherever it is lying.
    const deep = glazeFor(pack, 'urn', '0:9:1:1'), shallow = glazeFor(pack, 'urn', '0:0:1:1');
    const deepSet = pack.glazes[ERAS.at(-1).name].map((g) => g.light);
    const topSet = pack.glazes[ERAS[0].name].map((g) => g.light);
    ok('a deep pot is glazed deep and a shallow one shallow',
       deepSet.includes(deep.light) && topSet.includes(shallow.light),
       `${deep.light} vs ${shallow.light}`);
  }
  ok('the wall still takes the light', pack.tiles.WALL.shade > floor,
     `WALL ${pack.tiles.WALL.shade} > FLOOR ${floor}`);
}

// --- the word and the picture -----------------------------------------------
// A kind with no art falls back to a flat rectangle, and art with no kind is a
// cell nothing can ever draw. Neither shows up as an error, and a rename that
// touches one and not the other is invisible until someone looks at the screen
// and says the pots are showing up as crates.
{
  const { KIND } = await import('../core/items.js');
  const kinds = Object.keys(KIND), arted = Object.keys(pack.items || {});
  const noArt = kinds.filter((k) => !arted.includes(k));
  const noKind = arted.filter((k) => !kinds.includes(k));
  ok('every item kind has art', noArt.length === 0, noArt.join(', ') || `${kinds.length} kinds`);
  ok('every item drawing has a kind', noKind.length === 0, noKind.join(', '));
}

// One version, in two files that must agree.
{
  const { VERSION } = await import('../core/version.js');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  ok('package.json and core/version.js agree', pkg.version === VERSION, `${pkg.version} vs ${VERSION}`);
  ok('the version is semver', /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(VERSION), VERSION);
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all asset gates passed\n');
process.exit(failures ? 1 : 0);
