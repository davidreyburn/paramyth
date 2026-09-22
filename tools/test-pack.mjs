// Asset-layer gates. Art is referenced, never assumed: the manifest must cover
// every tile the generator can emit, and the game must still run without it.

import { readFile } from 'node:fs/promises';
import { drawsFor } from '../render/tileset.js';
import { roomTiles, floorPlan, COLS, ROWS } from '../core/gen.js';
import { T } from '../core/gen.js';
import { LIGHT_BANDS, LIGHT_BEYOND, TONES, P, FLICKER } from '../core/palette.js';
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
  const decode = (rel, w, h) => {
    const d = readFileSync(new URL('../' + rel, import.meta.url));
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
    return { out, stride };
  };
  const sheets = {};
  for (const [k, u] of Object.entries(pack.sheets)) {
    const rel = decodeURIComponent(u).replace(/^\//, '');
    sheets[k] = decode(rel, k === 'tiles' ? 440 : 140, 280);
  }
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
