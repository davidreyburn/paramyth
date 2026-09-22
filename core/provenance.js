// L2: what a thing has been through. A pure function of its address, exactly
// like the room it lies in — nothing here is stored, and two readers at the
// same address compute the same history.
//
// design/provenance.md sets the three tiers:
//   truth  = chain(addr)            immutable, arithmetic
//   record = truth (+ amendments)   not yet — nothing writes amendments
//   view   = redact(record, actor)  what this character can perceive
//
// The middle tier is deliberately absent for now. When forgery lands it goes
// between these two and nothing else has to move.

import { h, hi, hrange, hpick } from './addr.js';

// A closed, versioned vocabulary. Adding a verb is a content change; changing
// one is a save-compatibility change.
export const ACTS = [
  'made', 'owned', 'carried', 'gave', 'sold', 'stole', 'lost', 'hid',
  'bled-on', 'killed-with', 'killed-by', 'repaired', 'defaced',
  'consecrated', 'interred', 'buried-with',
];

// Each act leaves physical evidence, or none. This table is the whole bridge
// between history and what you can actually look at.
//   read: which sense finds it — 'keen' is the eye, 'lore' is the education
const EVIDENCE = {
  'made':        { mark: "maker's mark",   read: 'keen', tier: 1, worth: 0.10 },
  'owned':       { mark: 'grip polish',    read: 'keen', tier: 1, worth: 0.10 },
  'carried':     { mark: 'wear',           read: 'keen', tier: 1, worth: 0.05 },
  'gave':        { mark: 'inscription',    read: 'lore', tier: 1, worth: 0.35 },
  'sold':        { mark: null,             read: null,   tier: 0, worth: 0.00 },
  'stole':       { mark: null,             read: null,   tier: 0, worth: 0.00 },
  'lost':        { mark: null,             read: null,   tier: 0, worth: 0.00 },
  'hid':         { mark: 'concealment wax', read: 'keen', tier: 2, worth: 0.20 },
  'bled-on':     { mark: 'staining',       read: 'keen', tier: 1, worth: 0.15 },
  'killed-with': { mark: 'notching',       read: 'keen', tier: 2, worth: 0.30 },
  'killed-by':   { mark: 'a deep score',   read: 'keen', tier: 2, worth: 0.25 },
  'repaired':    { mark: 'mismatched fittings', read: 'keen', tier: 1, worth: -0.22 },
  'defaced':     { mark: 'a scoured panel', read: 'keen', tier: 3, worth: -0.50 },
  'consecrated': { mark: 'a rite-cut',     read: 'lore', tier: 2, worth: 0.50 },
  'interred':    { mark: 'grave-dirt',     read: 'keen', tier: 1, worth: 0.20 },
  'buried-with': { mark: 'shroud fibre',   read: 'keen', tier: 2, worth: 0.30 },
};

export const evidenceFor = (act) => EVIDENCE[act];

// --- actors ---------------------------------------------------------------
// Names are era-shaped. A thing that names a salvager is recent; a thing that
// names a house is imperial; below that the names stop being names.

const NAMES = [
  { // era 0 — recent: salvagers, bandits, the company's own dead
    first: ['Hobb','Sella','Dray','Wick','Corr','Meg','Tam','Orin','Pell','Ruse','Garrow','Nim'],
    house: ['of the Red Hand','of the Company','of Ashmark','of no house','the digger','the scrapper'],
  },
  { // era 1 — the war dead of the Silent Isle
    first: ['Valen','Corin','Aldric','Sera','Marius','Ilde','Bren','Ysolde','Rook','Lucian'],
    house: ['of Grimhaven','sworn to Aurelion','of the Second Cohort','shieldbearer','lanceman'],
  },
  { // era 2 — imperial: houses and offices
    first: ['Aurelios','Mordant','Castellan','Veyne','Thorne','Aurelia','Sabbat','Vance'],
    house: ['of the Ascension','Keeper of the Archive','Sun-anointed','of the Warden’s Gate','First of the Vault'],
  },
  { // era 3 — lost empire: the names stop working
    first: ['Θal','Ulmen','Kezzir','Nine-of-Stone','The Third Apostle','Hollow-Crowned'],
    house: ['that was not a person','of the unnumbered','before the word','Old Apostle'],
  },
];

export function actorOf(seed, id, era) {
  const e = Math.max(0, Math.min(NAMES.length - 1, era));
  const t = NAMES[e];
  return {
    id,
    era: e,
    name: hpick(t.first, seed, id, 0xa001),
    house: hpick(t.house, seed, id, 0xa002),
    // Notability drives price: most people are nobody.
    notable: hi(100, seed, id, 0xa003) < 12 + e * 9,
  };
}

// --- chains ----------------------------------------------------------------
// The address is the key string the delta already uses: "site:floor:room:slot".

const ERA_ACTS = [
  ['made','owned','carried','lost','sold','stole'],
  ['made','owned','carried','bled-on','killed-with','gave','lost','interred','repaired'],
  ['made','owned','consecrated','interred','buried-with','killed-with','defaced','gave','hid'],
  ['made','consecrated','buried-with','defaced','hid','killed-by','interred'],
];

const chainMemo = new Map();

export function chainOf(seed, key, era, depth) {
  const memoKey = `${seed}|${key}`;
  const hit = chainMemo.get(memoKey);
  if (hit) return hit;

  const salt = [];
  for (let i = 0; i < key.length; i++) salt.push(key.charCodeAt(i));

  // Depth is age: a buckle from the surface has a short history; something from
  // the imperial strata has been through hands for centuries.
  const n = hrange(2 + Math.min(2, era), 4 + era * 2, seed, ...salt, 0xb000);
  const out = [];
  let e = 0;
  // Eras run OLDEST FIRST: a thing is made once, long ago, and handled since.
  // So event 0 sits at the item's own era and later hands are more recent. A
  // chain spans at most two eras — a relic does not pass through all of history.
  const span = Math.min(era, 2);
  for (let i = 0; i < n; i++) {
    const evEra = era - Math.round((i / Math.max(1, n - 1)) * span);
    const acts = ERA_ACTS[Math.min(ERA_ACTS.length - 1, evEra)];
    const act = i === 0 ? 'made' : hpick(acts.filter((a) => a !== 'made'), seed, ...salt, i, 0xb001);
    out.push({
      era: evEra,
      act,
      actor: actorOf(seed, h(seed, ...salt, i, 0xb002) % 100000, evEra),
      depth,
    });
  }

  if (chainMemo.size > 2048) chainMemo.clear();
  chainMemo.set(memoKey, out);
  return out;
}

// --- marks -----------------------------------------------------------------
// What is physically on the object. One per event that leaves evidence.

export function marksOf(chain) {
  const out = [];
  for (const [i, ev] of chain.entries()) {
    const ed = EVIDENCE[ev.act];
    if (!ed || !ed.mark) continue;
    out.push({ i, act: ev.act, mark: ed.mark, read: ed.read, tier: ed.tier, actor: ev.actor, era: ev.era });
  }
  return out;
}

// --- perception ------------------------------------------------------------
// Keen is the eye, Lore is the education. A mark is legible when the relevant
// stat reaches its tier; below that you can see THAT it is marked, not what of.

export function readMarks(marks, stats) {
  return marks.map((m) => {
    const stat = m.read === 'lore' ? (stats.lore || 0) : (stats.keen || 0);
    return { ...m, legible: stat >= m.tier };
  });
}

export const markCount = (marks) => marks.length;
export const legibleCount = (read) => read.filter((m) => m.legible).length;

// --- worth -----------------------------------------------------------------
// A chain multiplies base value. A notable owner is most of it, which is why
// reading the heraldry is worth paying for — and defacement and clumsy repair
// cut it, so paying to read a thing can turn out to be bad news. A price that
// could only ever go up would make the appraiser a tax rather than a decision.

export function worthMultiplier(chain) {
  let m = 1;
  for (const ev of chain) {
    const ed = EVIDENCE[ev.act];
    if (ed) m += ed.worth;
    if (ev.actor.notable) m += 0.4;
  }
  return Math.max(0.25, Math.round(m * 100) / 100);
}

// A one-line summary of what a reader can actually make out.
export function describe(chain, stats) {
  const read = readMarks(marksOf(chain), stats);
  const seen = read.filter((m) => m.legible);
  if (!seen.length) return read.length ? `${read.length} marks, none legible` : 'unmarked';
  // A name is the thing worth reporting, so a legible notable beats a
  // higher-tier anonymous mark. Otherwise the deepest mark wins.
  const named = seen.filter((m) => m.actor.notable);
  const pool = named.length ? named : seen;
  const best = pool.reduce((a, b) => (b.tier > a.tier ? b : a));
  const who = best.actor.notable ? `${best.actor.name} ${best.actor.house}` : 'someone';
  return `${best.mark} — ${best.act} by ${who}`;
}
