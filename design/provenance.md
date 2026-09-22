# Provenance

*v0.1, 2026-09-22. Chains are **amendable**: the truth is computed and
immutable, the record is written and contestable.*

## The three tiers

This is the whole design, and everything below is consequence.

```
truth    = chain(item)                 pure function of address. Immutable. Arithmetic.
record   = truth ⊕ amendments          what is written down. Mutable, contestable.
view     = redact(record, actor)       what this character can perceive.
```

**What happened cannot be changed. What is written about it can.**

A forger does not alter history — they alter the record. An appraiser does not
discover truth — they add authority to a claim. A buyer pays for the *record*.
And a character with enough Keen or Lore reads closer to the *truth*, which
means they can detect that a seam exists.

That detection is not a judgement call and there is no judge model in the loop:
`record ≠ truth` is a comparison of two computed values. It is the Babel
verifier — a claim about the world that is true or false as arithmetic —
turned into the central economic mechanic of a game.

## Truth: the computed chain

An item's chain is a pure function of its address, per `pure-world`. It is an
ordered list of events, oldest first:

```
event = { era, actor, act, place }
```

- **era** — position in the world's periodization; derived from the site's depth
- **actor** — an actor address, resolving through L1 to name, house, faction, fate
- **act** — a verb from a closed vocabulary
- **place** — a site address

**Act vocabulary** (closed, versioned, ~16 entries): `made · owned · carried ·
gave · sold · stole · lost · hid · bled-on · killed-with · killed-by ·
repaired · defaced · consecrated · interred · buried-with`

Chain length scales with depth, because depth is era:

| Stratum | Typical chain | Actors |
|---|---|---|
| Field, Mausoleums | 2–4 events | Salvagers, Red Hand, Aurelion war dead |
| Barrow Deep | 5–9 events | Imperial houses, Archive, Temple |
| Frontier Halls | 8–14 events | Lost Empire, Old Apostles |
| Fundament and below | long, and strange | **Not people** |

## Marks: how a chain becomes legible

A chain is never shown as a list of facts. It is shown as **marks on the
object**, each mark evidence for one event. This is the mechanism for three
things at once: the perception gating, the item art, and the deduction.

| Mark | Evidence of | Read with |
|---|---|---|
| Maker's mark, foundry stamp | `made` | Keen |
| Inscription | `consecrated`, `gave`, `interred` | Lore + the right script |
| Wear pattern, grip polish | `carried`, long `owned` | Keen |
| Staining, patina | `bled-on`, `killed-with` | Keen + Lore |
| Grave-dirt, mineral accretion | `interred`, and for how long | Keen |
| Repair, re-hafting, mismatched fittings | `repaired` — and a second owner | Keen or craft |
| Heraldry, livery | `owned` by a house | Lore |
| Filed-off mark, scoured panel | `defaced` — someone hid something | Keen, high |

**Provenance renders.** The item sprite is composed from its marks, so a player
reads age, abuse, and sometimes ownership off the silhouette before identifying
anything. Composition is part-based — a base form plus mark overlays — which
keeps thousands of distinct items inside a small atlas.

The last row is the important one. A filed-off maker's mark is *itself* a mark.
Effacement is visible as effacement; what it concealed is not. That asymmetry is
where most of the game's mystery lives.

## The record: amendments

An amendment is a delta entry attached to an item address:

```
amendment = { author, kind, claim, era }
```

| Kind | Effect on record | Who |
|---|---|---|
| **attest** | Confirms an event; adds market authority | Guild appraiser, scholar |
| **assert** | Claims an event without authority | Anyone. Sellers, rumors, you |
| **annotate** | A note with no market effect | You, labeling your own stock |
| **efface** | Removes an event from the record | Anyone with a file and a reason |
| **forge** | Inserts a false event, with fabricated marks | Specialists, at a price |
| **inherit** | Appended automatically by play | The world |

`inherit` is the one that writes itself. You carried it, you killed with it, you
died holding it — the chain records that, unprompted, forever. **Your corpse
writes provenance**, and an appraiser three regions and forty hours away will
one day read your own name back to you.

Amendments are cheap to store: an author id, a kind, and a claim, attached to an
address. A mature world's amendment table is kilobytes.

## Detection

When `record ≠ truth`, a **seam** exists.

- **Below the threshold** — the character sees the record and believes it.
- **At the threshold** — the character perceives *that something is wrong*. A
  stamp sits a half-millimetre proud. The wear does not match the claimed
  ownership. The grave-dirt is from the wrong stratum.
- **Well above** — the character reads what the record conceals.

Keen finds physical seams; Lore finds historical ones — a claim that cannot be
true because the named house was extinct by that era. The two catch different
forgeries, which is a reason to build for one or the other, or to pay someone
who did.

**And you have a record too.** Sell an attested forgery and get caught, and an
amendment is written against *your* name. The player is an actor in the graph
like any other, with a chain that follows them.

## The actor graph, and how troves are found

Actors are addresses. `actor(id)` yields name, house, faction, era, fate. And
because chains name actors, the relation inverts:

```
possessionsOf(actorId) → the set of item addresses whose chains name them
```

**This is the treasure map, and it is the answer to how a player uncovers
troves, graves and storehouses.**

You recover a signet ring. Keen reads the heraldry; Lore names the house; the
chain's `interred` event names a place you have never been. That place exists,
at that address, with the rest of that person's grave goods still in it —
because the same function that generated the ring generated them.

The deduction chain in practice:

1. Find an object with a legible mark.
2. Resolve the actor. Now you know a name.
3. The actor's other possessions are computable. Some you already hold.
4. One of the events names a **place**.
5. Go there. It is real, and it is stocked, because it was always computed that
   way.

Every discovery vector the design wants is a different route into that same
loop. **Language deciphering** makes inscriptions readable, unlocking `place`
events you could see but not parse. **Pursuit of bandits** works because a Red
Hand raider carries goods with chains, and the chains name where they camp.
**Adventure** is the brute-force version: walk in and find it.

### Guaranteed solvability

The risk I flagged early is real: if cross-references only *sometimes* resolve
within reach, the deduction loop feels broken rather than deep. So it is a
constraint on the generator, not a hope.

**For every region, seed a set of resolved actors whose full possession set is
placed within that region's reach.** There is always a deducible trove nearby.
Beyond those, cross-references may run anywhere — including down — and those are
the long threads that pull a player deeper than they meant to go.

This wants a gate: *for N sampled regions, assert at least K resolvable actors
whose possessions are all reachable without leaving the region.*

## Perception, by stat

`viewFor(actor, item)` is the single function. No separate knowledge store, per
`view-redacts`.

| | Low | Mid | High |
|---|---|---|---|
| **Keen** | Condition, rough age | Marks located and named | Seams; concealed and filed-off marks |
| **Lore** | — | Inscriptions in known scripts; houses | Era contradictions; unattested claims |
| **Bearing** | — | What a buyer will believe | What the *dead* remember of it |

Bearing's high tier is the strange one and it should stay strange: carrying a
dead man's goods changes how his kind respond to you. That is a combat and
dialogue effect derived from provenance, and it is the cheapest possible bridge
between the salvage layer and the encounter layer.

**Appraisal services** are the alternative to having the stats. They cost coin
and time — and **they report**. The Guild learns what you found, and factions
act on what the Guild knows. So a perceptive build is not buying knowledge, it
is buying **privacy**, and both routes stay live.

## Layer placement

- **L1** — `item(address)`, `actor(id)`, `site(address)`. Pure.
- **L2** — `chain(item)`, `possessionsOf(actor)`, `marksOf(chain)`. Pure, from L1.
- **L3** — the amendment table, and what this player knows. The only mutable part.
- **L4** — `appraisal`, `language`, `economy`, `forgery` as separate systems that
  read L2/L3 and never each other.

`forgery` is deletable: remove it and no amendment of kind `forge` is ever
written, every record equals its truth, seams never occur, and the game is a
simpler and entirely playable one. That is the module test passing on the most
entangled-looking system in the design.

## Open questions

1. **Amendment authority decay.** Does an attestation from a discredited
   appraiser lose force retroactively? Interesting, and it makes the record
   time-dependent, which complicates `viewFor`.
2. **Can the player efface their own inherited entries?** Filing your name off a
   thing you did is thematically loud and mechanically a reputation-laundering
   exploit. Probably yes, probably expensive, probably leaves a seam.
3. **Chain length ceiling.** Fundament-era chains want to be long. Rendering and
   reading a fourteen-event chain on a 640×360 screen is a UI problem before it
   is a design one.
4. **Do non-human actors resolve to names?** Below the Fundament the `actor`
   field points at something the name-generator has no vocabulary for. That is
   an opportunity, not a bug, but it needs an answer before those strata build.
5. **Other players' amendments** (LAN module). Once amendments cross machines,
   one player's forgery is another's problem. That is the best version of this
   system and it should not be built first.
