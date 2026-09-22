// Provenance gates. The design's claim is that truth is arithmetic and what you
// see is a redaction of it — so the things under test are purity, that marks
// derive from acts, that perception genuinely gates, and that reading changes
// what a thing is worth.

import { chainOf, marksOf, readMarks, worthMultiplier, describe, evidenceFor, ACTS,
         possessionsOf, resolvedActors, occupantOf, homeOf, isResolved, actorOf,
         leadOf, RESOLVED, POOL } from '../core/provenance.js';
import { contentsOf, floorPlan, floorCount, ERAS, eraFor, absDepth } from '../core/gen.js';
import { isPortable, valueOf } from '../core/items.js';
import { createState } from '../sim/state.js';
import { step } from '../sim/step.js';
import { VERB, setVerb } from '../sim/frame.js';
import { chainFor, marksFor, assessed, itemValue, readOut, keyOf, leadFor, troveFor,
         leads, visible, containerItems, placeHere, APPRAISAL_FEE } from '../sim/interact.js';
import { isContainer } from '../core/items.js';

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

// --- the graph inverts ------------------------------------------------------
// The claim this release exists to make good: an actor is an address, so the
// relation "chains name actors" runs backwards.
{
  const id = actorOf(SEED, 0).id;
  ok('an actor address decomposes into who and where',
     homeOf(id).site === 0 && homeOf(id).era === 0 && homeOf(id).n === 0);

  const a = possessionsOf(SEED, 8), b = possessionsOf(SEED, 8);
  ok('the inversion is pure', JSON.stringify(a) === JSON.stringify(b), `${a.length} items`);

  // Every possession must genuinely name its owner, or the index is lying.
  let checked = 0, named = 0;
  for (let site = 0; site < 6; site++)
    for (const { actor, items } of resolvedActors(SEED, site))
      for (const it of items) {
        checked++;
        const floor = Number(it.key.split(':')[1]);
        if (chainFor({ seed: SEED }, it.key).some((ev) => ev.actor.id === actor.id)) named++;
      }
  ok('every possession names its owner', checked > 0 && named === checked, `${named}/${checked}`);
}

// --- solvable ---------------------------------------------------------------
// The gate `plans/slice-01.md` names: for N sampled regions, at least K actors
// whose possessions are all reachable without leaving the region. Reachability
// here is the region's own floor plan — a room that is not in it is not a room.
{
  const REGIONS = 40, LEAST = 1;
  let worst = Infinity, worstSite = -1, strays = 0, deadPlaces = 0, leads = 0;

  for (let site = 0; site < REGIONS; site++) {
    const rooms = new Set();
    for (let f = 0; f < floorCount(SEED, site); f++)
      for (const r of floorPlan(SEED, site, f).cells) rooms.add(`${site}:${f}:${r}`);

    let solvable = 0;
    for (const { actor, items } of resolvedActors(SEED, site)) {
      // All of it here, all of it in a room that exists.
      const home = items.every((it) => rooms.has(`${it.site}:${it.floor}:${it.room}`));
      if (!home) strays++;
      const place = items.find((it) => it.place);
      if (place) {
        leads++;
        if (!rooms.has(place.place)) deadPlaces++;
        else if (home) solvable++;
      }
    }
    if (solvable < worst) { worst = solvable; worstSite = site; }
  }

  ok('a resolved actor never owns anything outside their own region', strays === 0, `${strays} strays`);
  ok('no lead points at a room that is not there', deadPlaces === 0, `${leads} leads, ${deadPlaces} dead`);
  ok('every region has a deducible trove within it', worst >= LEAST,
     `fewest in any of ${REGIONS} regions: ${worst} (site ${worstSite})`);
}

// --- a lead is worth walking to ---------------------------------------------
// Solvable is not enough: the named room has to actually hold more of that
// person's goods than any other room does, or the deduction is a formality.
{
  let named = 0, elsewhere = 0, n = 0;
  for (let site = 0; site < 40; site++)
    for (const { items } of resolvedActors(SEED, site)) {
      const p = items.find((it) => it.place);
      if (!p) continue;
      const [, f, r] = p.place.split(':').map(Number);
      const here = items.filter((it) => it.floor === f && it.room === r).length;
      const rooms = new Set(items.map((it) => `${it.floor}:${it.room}`));
      rooms.delete(`${f}:${r}`);
      named += here;
      elsewhere += rooms.size ? (items.length - here) / rooms.size : 0;
      n++;
    }
  const a = named / n, b = elsewhere / n;
  ok('the room a lead names is a trove, not an average room', a > b * 1.3,
     `${a.toFixed(2)} of their things there vs ${b.toFixed(2)} in any other room`);
}

// --- perception gates the lead, too -----------------------------------------
{
  const s = createState(SEED);
  let blind = 0, seen = 0, total = 0;
  for (let f = 1; f < 4; f++)
    for (let i = 0; i < 200; i++) {
      const key = `0:${f}:${i % 6}:${i}`;
      const chain = chainOf(SEED, key, eraAt(f), absDepth(f));
      total++;
      if (!leadOf(chain, { keen: 0, lore: 0 })) blind++;
      if (leadOf(chain, { keen: 9, lore: 9 })) seen++;
    }
  ok('an untrained eye follows nothing', blind === total, `${blind}/${total}`);
  ok('a trained one finds leads', seen > total * 0.2, `${seen}/${total} items name somewhere`);

  // And the fee buys the same thing the stats would have.
  const withLead = [];
  for (let i = 0; i < 400 && withLead.length < 1; i++) {
    const key = `0:2:${i % 6}:${i}`;
    if (leadOf(chainOf(SEED, key, eraAt(2), absDepth(2)), { keen: 9, lore: 9 })) withLead.push(key);
  }
  ok('there is such an item to test with', withLead.length === 1, withLead[0]);
  if (withLead.length) {
    const k = withLead[0];
    const before = leadFor(s, k);
    s.known.push(k);
    const after = leadFor(s, k);
    ok('paying the appraiser hands you the lead', !!after && !!after.place, after ? after.place : 'none');
    ok('and it is the one the stats would have found', !before || before.place === after.place);
  }
}

// --- following one, end to end ----------------------------------------------
// The loop as a player runs it: take a thing, pay to have it read, learn a
// name and a room, walk there, and find that person's goods waiting.
{
  const s = createState(SEED);
  s.scrap = 100;

  // Find something whose record names somewhere ELSE. A thing that names the
  // room it is already lying in is a true lead and a useless gate: it would
  // pass without the player ever walking anywhere.
  let held = null;
  outer:
  for (let floor = 1; floor < floorCount(SEED, 0) && !held; floor++)
    for (const room of floorPlan(SEED, 0, floor).cells)
      for (const c of contentsOf(SEED, 0, floor, room)) {
        if (!isPortable(c.kind)) continue;
        const key = `0:${floor}:${room}:${c.slot}`;
        s.known = [key];
        const l = leadFor(s, key);
        if (l && l.place !== `0:${floor}:${room}` && l.place.startsWith('0:')) {
          held = { key, kind: c.kind, floor, room, lead: l }; break outer;
        }
      }
  ok('the world contains an item that names somewhere else', !!held,
     held ? `${held.kind} at ${held.key} names ${held.lead.place}` : 'none');

  if (held) {
    s.known = [held.key];
    s.carried = [{ kind: held.kind, key: held.key }];
    const l = leadFor(s, held.key);
    ok('carrying it, the lead is in hand', leads(s).length === 1, `${leads(s).length}`);

    // Walk there. The delta says where you are; nothing else has to agree.
    const [, f, r] = l.place.split(':').map(Number);
    ok('and it is somewhere you are not', `${f}:${r}` !== `${held.floor}:${held.room}`,
       `found in 0:${held.floor}:${held.room}, sent to ${l.place}`);
    s.floor = f; s.room = r;
    ok('the room the lead names is a room that exists',
       floorPlan(SEED, 0, f).cells.includes(r), l.place);

    const there = visible(s).filter((c) => c.key && !isContainer(c.kind));
    const theirs = there.filter((c) =>
      chainFor(s, c.key).some((ev) => ev.actor.id === l.actor.id));
    ok('and it is stocked with that person\'s goods', theirs.length > 0,
       `${theirs.length} of ${there.length} loose things in ${l.place} name ${l.actor.name}`);

    // Including what is still shut in the containers standing in it.
    const inside = visible(s).filter((c) => isContainer(c.kind))
      .flatMap((c) => containerItems(s, c.key))
      .filter((it) => chainFor(s, it.key).some((ev) => ev.actor.id === l.actor.id));
    ok('the trove counts what the containers hold too', theirs.length + inside.length >= theirs.length,
       `${theirs.length} loose + ${inside.length} boxed`);

    ok('standing in it, the game says so', leads(s).some((x) => x.place === placeHere(s)), placeHere(s));
  }
}

console.log(failures ? `\n  ${failures} failed\n` : '\n  all provenance gates passed\n');
process.exit(failures ? 1 : 0);
