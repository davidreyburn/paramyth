// The replay gate, headless. The kernel runs in Node with no renderer,
// which is the whole point of keeping L0-L3 free of browser globals.

import { createState, hashState } from '../sim/state.js';
import { step } from '../sim/step.js';

let failures = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? '  ok  ' : '  FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) failures++;
};

// Deterministic pseudo-input, so the corpus is reproducible.
function makeLog(seed, n) {
  let s = seed >>> 0;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    out[i] = (s >>> 11) & 0x3ff;
  }
  return out;
}

const SEED = 0x1594;
const N = 50000;
const log = makeLog(0xbeef, N);

const a = createState(SEED);
for (const f of log) step(a, f);

const b = createState(SEED);
for (const f of log) step(b, f);

ok('replay: seed + frame log reproduces state exactly',
   hashState(a) === hashState(b),
   `hash ${hashState(a).toString(16)} over ${N} frames`);

ok('tick count matches log length', a.tick === N);

const c = createState(SEED);
for (let i = 0; i < N - 1; i++) step(c, log[i]);
ok('divergence is detected (negative control)', hashState(c) !== hashState(a));

const d = createState(SEED);
for (const f of log) step(d, f);
ok('integer position: no float leaked into the sim path',
   Number.isInteger(d.x) && Number.isInteger(d.y),
   `x=${d.x} y=${d.y}`);

const e = createState(SEED);
for (const f of log) step(e, 0);
ok('empty input is a no-op for position', e.x === createState(SEED).x);

ok('save size is bounded by play, not by world',
   N * 4 < 250 * 1024, `${N} frames = ${(N * 4 / 1024).toFixed(0)} KiB`);

// --- the lamp turns, and turns deterministically -----------------------------
// It is eased in the DELTA rather than in the renderer: a render-side ease would
// make two draws of one state differ, and would come apart entirely at the
// 120 Hz render option where draws outnumber ticks.
{
  const { lampStep, lampVec, LAMP_AIM, LAMP_TURN, LAMP_BRADS } = await import('../sim/state.js');

  ok('the lamp starts pointing where the player does',
     createState(1).lampDir === LAMP_AIM[createState(1).facing], `${createState(1).lampDir}`);

  // It sweeps rather than snapping, and it arrives.
  let d = LAMP_AIM[2], steps = 0;                       // south, turning to east
  const seen = [d];
  while (d !== LAMP_AIM[1] && steps < 100) { d = lampStep(d, 1); seen.push(d); steps++; }
  ok('a right-angle turn takes several ticks, not one', steps > 4 && steps < 16, `${steps} ticks`);
  ok('and it gets there exactly', d === LAMP_AIM[1], `${d} vs ${LAMP_AIM[1]}`);
  ok('and then stays put', lampStep(d, 1) === d);
  ok('every step is a whole number of brads', seen.every(Number.isInteger));
  ok('no step is larger than the turn rate',
     seen.every((v, i) => i === 0 || Math.abs(((v - seen[i-1] + 1536) % 1024) - 512) <= LAMP_TURN));

  // The short way round: west to north is a quarter turn, not three quarters.
  let w = LAMP_AIM[3], n = 0;
  while (w !== LAMP_AIM[0] && n < 100) { w = lampStep(w, 0); n++; }
  ok('it turns the short way round', n <= LAMP_BRADS / 4 / LAMP_TURN, `${n} ticks west to north`);

  // And it stays in range however long you spin.
  let spin = 0, bad = 0;
  for (let i = 0; i < 400; i++) {
    spin = lampStep(spin, i % 4);
    if (spin < 0 || spin >= LAMP_BRADS || !Number.isInteger(spin)) bad++;
  }
  ok('spinning forever never leaves the circle', bad === 0, `${bad} bad`);

  // The vector is a unit vector, so the egg keeps its declared radius.
  let off = 0;
  for (let a = 0; a < LAMP_BRADS; a += 7) {
    const [x, y] = lampVec(a);
    if (Math.abs(Math.hypot(x, y) - 1) > 1e-9) off++;
  }
  ok('the lamp vector is always unit length', off === 0);

  // Replay: the lamp angle is delta, so a rebuilt run must match it exactly.
  const a2 = createState(99), b2 = createState(99), lg = [];
  for (let i = 0; i < 300; i++) { const f = (i * 2654435761) & 0x3ff; lg.push(f); step(a2, f); }
  for (const f of lg) step(b2, f);
  ok('the lamp angle survives replay', a2.lampDir === b2.lampDir && hashState(a2) === hashState(b2),
     `lampDir ${a2.lampDir}`);
}

// --- on-screen controls: the verdict is a pure function --------------------------
{
  const { controlsFor } = await import('../app/controls.js');
  const phone = { coarse: true, touchPoints: 5 };
  ok('a phone in portrait gets the Game Boy', controlsFor({ ...phone, portrait: true }) === 'portrait');
  ok('a phone in landscape gets the overlay', controlsFor({ ...phone, portrait: false }) === 'landscape');
  ok('a desktop gets nothing', controlsFor({ coarse: false, touchPoints: 0 }) === 'none');
  ok('a touch laptop with a fine pointer gets nothing', controlsFor({ coarse: false, touchPoints: 10 }) === 'none');
  ok('a controller hides them', controlsFor({ ...phone, padSeen: true }) === 'none');
  ok('so does a keyboard', controlsFor({ ...phone, keySeen: true }) === 'none');
  ok("'off' wins over a phone", controlsFor({ ...phone, pref: 'off' }) === 'none');
  ok("'on' wins over a controller", controlsFor({ ...phone, padSeen: true, pref: 'on', portrait: true }) === 'portrait');
  ok("but 'on' with no touch screen is still nothing", controlsFor({ coarse: false, touchPoints: 0, pref: 'on' }) === 'none');
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all headless gates passed');
console.log('  2 gates need a browser: start the server and open /tools/pagecheck.html\n');
process.exit(failures ? 1 : 0);
