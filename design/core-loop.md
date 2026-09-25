# Core Loop

*v0.1, 2026-09-22. The question this document exists to get right: **is triage
under cost fun?** Everything else is scaffolding around that one verb.*

## The loop

1. **Outfit** — armor, tools, empty bulk. A bet placed before you know anything.
2. **Descend** — route choice: trunk or capillary, known or unknown.
3. **Scavenge** — open things. Make noise. Accumulate.
4. **Triage (in the dark)** — bulk is finite. What comes, what stays.
5. **Extract** — carry it home. The laden walk is the dangerous one.
6. **Triage (at camp)** — scrap it, identify it, hold it, or sell it.
7. **Sell** — to whom, and with what written on it.
8. **Spend** — repair, cure, resupply, and buy your way deeper.

**Triage happens twice and they are different decisions.** In the dark it is
about weight and risk, under pressure, with poor information. At camp it is
about money and knowledge, at leisure, with the option to pay for more. Getting
both to feel distinct is the design's central craft problem.

## Why triage is not a chore

In most loot games sorting is the thing players automate. Three properties stop
that here, and all three are load-bearing:

- **You cannot auto-sell**, because value is hidden in provenance.
- **You cannot identify everything**, because identification costs coin, time,
  and privacy.
- **You can often tell whether something is worth asking about**, which converts
  the whole thing from a coin flip into a skill.

That third one is the fairness rule and it needs stating as a constraint:

> **Every item freely tells you whether it is worth a question, even when it
> will not tell you the answer.**

Bulk, material and condition are free. *That marks are present* is free or very
cheap. What the marks **say** costs — Insight, Lore, or an appraiser's fee.

So a scrapper in a dark room holding a corroded buckle knows: it weighs almost
nothing, it is bronze, and it carries four marks, one of which is unusual. That
is enough to make carrying it a *judgement* rather than a gamble, and enough
that being wrong is the player's fault. Mark density and mark rarity are the
tells, and learning to read them is the mastery curve.

## Bulk is the shared currency

Armor, tools and haul draw from one budget. Base 20, raised by Might.

| Loadout | Armor | Tools | Used | **Haul** |
|---|---|---|---|---|
| Light scavenger | rags 0 | prybar 2, lantern 2, chalk 1 | 5 | **15** |
| Balanced delver | leathers 2 | prybar 2, lantern 2, grapnel 3, net 2 | 11 | **9** |
| Deep delver | plate 7 | prybar 2, lantern 2, grapnel 3, charge 2 | 16 | **4** |

Those numbers are the game stated plainly. The character best equipped to
survive the Deep can carry four bulk of cargo home. That is not a balance
problem to solve — it is the reason shortcuts, guild lifts and the net's sling
matter, and it is why wealth in this game buys *reach*, not damage.

## The identification economy

The appraiser is the pressure valve on the whole loop.

| | Cost | Time | Reveals | Cost you don't see |
|---|---|---|---|---|
| **Insight / Lore** | stat investment | none | Marks, per your tier | — |
| **Camp appraiser** | small fee | a day | One item's record | **Reports to the Guild** |
| **Guild scholar** | large fee | several days | Full record, attested | Reports, and files a claim |
| **Ashmark reader** | mid fee | a day | Full record, unattested | Tells someone else too |

Appraisal is how a build without Insight stays viable, and the fee is a continuous
scrap sink that scales with how much you find. The reporting clause is what
keeps perceptive builds worth having: **they buy privacy, not knowledge.** A
Guild that knows what you pulled out of a tomb is a Guild that can send someone
back for the rest of it.

## Buyers

The same object is worth wildly different amounts depending on who you hand it
to and what is written on it.

| Buyer | Wants | Pays for | Refuses |
|---|---|---|---|
| **Company quartermaster** | Bulk scrap, no questions | Weight, badly | Nothing |
| **Grimhaven factor** | Aurelion heirlooms repatriated | Attested provenance | Effaced goods — and reports you |
| **Ashmark fence** | Anything anonymous | Volume, quickly | Attested imperial goods, too hot |
| **Delver's Guild** | Catalogued knowledge, maps, routes | **Information as much as objects** | — |
| **Specialists** | One particular chain | Enormously, for that one thing | Everything else |

A plain imperial blade might fetch 3 from the quartermaster, 40 from Grimhaven
attested, or 15 from Ashmark effaced. "What do I do with this" has several
correct answers depending on build, standing and how much heat you are carrying
— which is the second triage made real.

The Guild buying *information* is the important row. Selling a mapped route or a
resolved actor without selling the goods is a live strategy, and it is how a
low-Might, high-Lore character makes rent.

## Extraction and the corpse run

Haul is not yours until it is at camp. Extraction points are discovered, not
given (see `world-shape.md`), and each one found permanently de-risks a region.

Death drops everything — armor, tools, cargo — at an address. The recovery run
is played with the backup kit from the stash, which is worse, which is forced
variety nobody had to design. Corpses attract Red Hand looters, so the timer is
a story rather than a bar. And the items record that you died holding them.

**Keep a spare prybar in the stash.** The game says this once, in-fiction, from
a veteran at the camp, and never again.

## Scrap: faucets and sinks

One faucet, many sinks. The sinks must outgrow the faucet or the economy dies
around hour twenty.

**In:** selling salvage (dominant), bounties, found coin (minor).

**Out**, roughly in order of when they start to bite:

| Sink | Shape |
|---|---|
| Consumables — charges, chalk, healing | Continuous, small |
| Repair — armor condition, tool wear | Continuous, scales with depth |
| Appraisal fees | Scales with how much you find |
| Corruption clearing | Event-driven, sharp |
| Injury treatment | Event-driven, lasting |
| Stash expansion | Quality of life, and see below |
| **Depth permits and guild dues** | **Gates progression** |
| **Guild lifts and installed shortcuts** | **The big-ticket sink** |

The governing rule: **wealth converts into safety and reach, never into
numbers.** There is no +5 sword for sale. Money buys a hoist that turns a
two-hour haul into two minutes, a permit for sealed plate, a physician who keeps
your hand. This keeps the economy from breaking combat balance, and it keeps the
tone — you are poor, and you are buying your way down.

**The stash is finite.** If it is not, camp triage evaporates and the correct
play is to keep everything forever. A finite stash with paid expansion makes the
second triage a real decision and gives the economy an early sink.

## Progression

Six axes, only one of which is a number going up.

1. **Stats** — Might, Swift, Vigor, Lore, Insight, Charm
2. **Gear** — armor, tools, and eventually sacred arms
3. **Map knowledge** — shortcuts and extraction points. *The largest, and free to store*
4. **Scripts** — what you can read without paying
5. **Faction standing** — who buys, at what price, and what they tell you
6. **The index** — item types, houses and actors you have resolved before

Three, four and six are all knowledge. That is deliberate: the game's thesis is
that knowing the Barrowlands is what makes you rich, and none of it costs
anything to persist.

## Session shape

A run should be **15–40 minutes** — a handheld session, interruptible, with camp
time short and consequential. Nothing in the loop may require a long sitting.
The extraction structure gives this for free: the run ends when you decide it
does, and deciding is the game.

## Failure modes to watch at the table

- **Identification too cheap** → everything gets appraised, triage collapses to
  a queue. Dial: fee, and the reporting consequence.
- **Tells too weak** → carrying decisions feel arbitrary. Dial: mark visibility
  at low Insight. This is the most likely way the slice fails.
- **Routes long and safe** → extraction becomes commute. Dial: noise, patrols,
  and making the laden walk genuinely different from the empty one.
- **Sinks too shallow** → wealth accumulates, decisions stop mattering. Dial:
  repair curve and permit costs.
- **Stash infinite** → camp triage evaporates. Dial: it isn't.
- **Bulk too generous** → the central tension disappears. Dial: base 20 is a
  guess and should be the first number tuned.
