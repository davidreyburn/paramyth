// Provenance gates. The design's claim is that truth is arithmetic and what you
// see is a redaction of it — so the things under test are purity, that marks
// derive from acts, that perception genuinely gates, and that reading changes
// what a thing is worth.

import { chainOf, marksOf, readMarks, worthMultiplier, describe, evidenceFor, ACTS } from '../core/provenance.js';
import { contentsOf, floorPlan, floorCount, ERAS, eraFor, absDepth } from '../core/gen.js';
import { isPortable, valueOf } from '../core/items.js';
import { createState } from '../sim/state.js';
import { step } from '../sim/step.js';
import { VERB, setVerb } from '../sim/frame.js';
import { chainFor, marksFor, assessed, itemValue, readOut, keyOf, APPRAISAL_FEE } from '../sim/interact.js';

let failures = 0;
const ok = (n, c, d = '') => { console.log(`${c ? '  ok  ' : '  FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!c) failures++; };
const SEED = 0x1594;
const eraAt = (floor) => ERAS.indexOf(eraFor(absDepth(floor)));

// --- truth is arithmetic ----------------------------------------------------
{
  const a = chainOf(SEED, '0:2:1:3', 1, 3);
  const b = chainOf(SEED, '0:2:1:3', 1, 3);
  ok('the same address yields the same history', JSON.stringify(a) === JSON.stringify(b), `${a.length} events`);

  const c = chainOf(SEED, '0:2:1:4', 1, 3);
  ok('a different address yields a different one', JSON.stringify(a) !== JSON.stringify(c));

  ok('every chain begins with its making', a[0].act === 'made' && c[0].act === 'made');

  const acts = new Set();
  for (let f = 0; f < 8; f++)
    for (let i = 0; i < 400; i++)
      for (const ev of chainOf(SEED, `0:${f}:${i % 6}:${i}`, eraAt(f), absDepth(f))) acts.add(ev.act);
  const stray = [...acts].filter((x) => !ACTS.includes(x));
  ok('no act outside the declared vocabulary', stray.length === 0, stray.join(', '));
  ok('most of the vocabulary is reachable', acts.size >= ACTS.length - 2,
     `${acts.size}/${ACTS.length}: ${[...acts].sort().join(' ')}`);
}

// --- depth is age -----------------------------------------------------------
{
  const mean = (floor) => {
    let n = 0;
    for (let i = 0; i < 300; i++) n += chainOf(SEED, `0:${floor}:${i % 6}:${i}`, eraAt(floor), absDepth(floor)).length;
    return n / 300;
  };
  const shallow = mean(0), deep = mean(7);
  ok('deeper things have longer histories', deep > shallow + 1, `floor 0: ${shallow.toFixed(1)} events, floor 7: ${deep.toFixed(1)}`);

  // Oldest first: the making is the earliest era in the chain.
  let ordered = 0, checked = 0;
  for (let i = 0; i < 300; i++) {
    const c = chainOf(SEED, `0:6:${i % 6}:${i}`, eraAt(6), absDepth(6));
    checked++;
    if (c.every((ev, j) => j === 0 || ev.era <= c[j-1].era)) ordered++;
  }
  ok('a history runs oldest first, never backwards', ordered === checked, `${ordered}/${checked}`);
}

// --- marks derive from acts -------------------------------------------------
{
  let mismatch = 0, total = 0;
  for (let i = 0; i < 400; i++) {
    const c = chainOf(SEED, `0:4:${i % 6}:${i}`, eraAt(4), absDepth(4));
    for (const m of marksOf(c)) {
      total++;
      const ed = evidenceFor(m.act);
      if (!ed || ed.mark !== m.mark || ed.read !== m.read) mismatch++;
    }
  }
  ok('every mark is the evidence its act leaves', mismatch === 0, `${total} marks checked`);

  const silent = ACTS.filter((a) => !evidenceFor(a).mark);
  ok('some acts leave no trace at all', silent.length > 0, silent.join(', '));
}

// --- perception gates -------------------------------------------------------
{
  const c = chainOf(SEED, '0:6:2:5', eraAt(6), absDepth(6));
  const m = marksOf(c);
  const blind = readMarks(m, { keen: 0, lore: 0 }).filter((x) => x.legible).length;
  const adept = readMarks(m, { keen: 3, lore: 3 }).filter((x) => x.legible).length;
  ok('a stat of zero reads nothing', blind === 0, `${blind}/${m.length}`);
  ok('a trained eye reads everything', adept === m.length, `${adept}/${m.length}`);
  ok('perception is monotonic in the stat', adept >= blind);

  ok('an unreadable thing still shows that it is marked',
     describe(c, { keen: 0, lore: 0 }).includes('marks'), describe(c, { keen: 0, lore: 0 }));

  // Lore and Keen must not substitute for one another.
  const loreOnly = readMarks(m, { keen: 0, lore: 3 }).filter((x) => x.legible);
  ok('Lore does not read what Keen is for', loreOnly.every((x) => x.read === 'lore'),
     loreOnly.map((x) => x.read).join(','));
}

// --- the appraiser ----------------------------------------------------------
{
  // Something a Worker genuinely cannot read, or the fee buys nothing.
  let hard = null;
  outer:
  for (let si = 0; si < 40; si++)
    for (let f = 2; f < floorCount(SEED, si); f++)
      for (const r of floorPlan(SEED, si, f).cells)
        for (const c of contentsOf(SEED, si, f, r)) {
          if (!isPortable(c.kind)) continue;
          const s = createState(SEED); s.site = si; s.floor = f; s.room = r;
          const key = keyOf(s, c.slot);
          if (!assessed(s, key)) { hard = { s, key, kind: c.kind }; break outer; }
        }
  ok('some things are beyond a Worker’s eye', !!hard, hard ? `${hard.kind} at ${hard.key}` : 'none found');

  if (hard) {
    const { s, key, kind } = hard;
    const r = { kind, key };
    const before = itemValue(s, r);
    ok('an unread thing sells at base', before === valueOf(kind), `${before} vs base ${valueOf(kind)}`);

    s.scrap = 100;
    s.carried = [r];
    s.screen = 'appraiser'; s.side = 1; s.cur = 0;
    step(s, setVerb(0, VERB.INTERACT, true));
    ok('the appraiser takes the fee', s.scrap === 100 - APPRAISAL_FEE, `${s.scrap} left`);
    ok('and the record is now read', assessed(s, key));

    const after = itemValue(s, r);
    ok('reading it changes the price', after !== before, `${before} -> ${after} (x${worthMultiplier(chainFor(s, key))})`);

    const poor = createState(SEED);
    poor.site = s.site; poor.floor = s.floor; poor.room = s.room;
    poor.scrap = APPRAISAL_FEE - 1;
    poor.carried = [r];
    poor.screen = 'appraiser'; poor.side = 1; poor.cur = 0;
    step(poor, setVerb(0, VERB.INTERACT, true));
    ok('you cannot appraise what you cannot pay for',
       poor.scrap === APPRAISAL_FEE - 1 && !poor.known.length, `${poor.scrap} scrap`);
  }
}

// --- worth ------------------------------------------------------------------
{
  let hi = 0, lo = 99, n = 0, sum = 0;
  for (let f = 0; f < 8; f++)
    for (let i = 0; i < 200; i++) {
      const m = worthMultiplier(chainOf(SEED, `0:${f}:${i % 6}:${i}`, eraAt(f), absDepth(f)));
      hi = Math.max(hi, m); lo = Math.min(lo, m); sum += m; n++;
    }
  ok('a chain can lower the price as well as raise it', lo < 1, `lowest x${lo}`);
  ok('and the spread is wide enough to matter', hi / lo > 3, `x${lo} to x${hi}, mean x${(sum/n).toFixed(2)}`);
  ok('nothing is ever worth nothing', lo > 0, `x${lo}`);
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all provenance gates passed\n');
process.exit(failures ? 1 : 0);
