# Backlog

*Ideas, not commitments. **This document schedules nothing** — `plans/roadmap.md`
is the only document that schedules work. Nothing here has a release, an order,
or a promise attached to it, and an entry sitting here for a year is the system
working.*

Origin: a design conversation on 2026-09-22. DJ's verdict is recorded against
each entry, because an idea's status is worth as much as the idea.

## The through-line

Ten of the thirteen entries below are **perception or record features, not
content features.** They add things to know rather than things to fight, and
they are all downstream of two facts the engine already has: the world is a pure
function of its address, and the actor graph inverts.

That is the layer contract paying out. Each of these is an L4 system that reads
downward, writes a handful of bytes, and can be deleted without the game
noticing — so they can be built late, individually, and in any order.

---

## 1. The Estate Commission

> A factor in Grimhaven slides a signet across the counter. He does not want the
> ring. He wants three of the nine things it was buried with.

**Rests on:** `possessionsOf`, exactly as shipped. A commission is a resolved
actor, and the guaranteed-solvability constraint means it is always completable
without leaving the region.

**Shape — amended by DJ, and the amendment is the design.** A commission asks
for **3 pieces of an estate, not all of it**, with bonuses above that:

| | Pays |
|---|---|
| The three named pieces | the commission |
| Each further piece of the same estate | a bonus, diminishing |
| The full set, across as many trips as it takes | a completion payment worth the walk |
| A named centrepiece, if it surfaces at all | name your price |

**Why three.** Bulk. The budget is 20, grave goods run 1–2 bulk each, and
`design/core-loop.md`'s own loadout table puts a plated deep delver at **4 bulk
of cargo**. A resolved actor's estate is 8–14 items in practice — measured, not
guessed. Asking for all of it is asking for five trips before the first payment,
which is not a quest, it is a job. Three is one trip light or two trips laden,
which is precisely the tension the loadout table exists to create. The bonuses
then make the rest of the estate *optional upside* rather than a chore, and they
give a reason to go back to a room already robbed once.

**Design note.** The commission should name the **person**, not the place. It
hands you an actor and lets the existing lead machinery find the room. A
commission that ships a waypoint has thrown away the entire deduction loop to
save the player ninety seconds.

**Status:** loved, amended. The highest-leverage item on this list — it is
mostly UI over machinery that already runs.

---

## 2. The Dead Know Their Own

> You are three rooms deep wearing a lanceman's buckle when something that used
> to be a lanceman puts its head up. It does not want you. It wants the buckle.

**Rests on:** Bearing's high tier — *"what the dead remember of it"* — plus the
inversion. What you carry decides what hunts you.

**Why:** it stops encounters being a parallel system bolted onto salvage and
makes them a **consequence of looting**. The drop-load button stops being a
panic key and becomes a negotiation: give back the one thing it came for and it
may let you keep the rest. `design/combat-and-tools.md` already wants damage
that costs cargo rather than health; this is the same thought upstream of it.

**Status:** solid concept.

---

## 3. The Leak

> The appraiser's fee was never the price. The Guild now knows what came out of
> that tomb, and the Guild owns mules and lanterns and men who are closer than
> you are.

**Rests on:** the reporting clause already written into `design/core-loop.md`,
and the `known` list already in the delta.

**Why:** appraise something rich and a Guild crew is dispatched **to that site**.
You are racing your own information home. It is the mechanic that makes a
perceptive build buy *privacy* rather than knowledge — which the design has
claimed since v0.1 and which nothing currently enforces. It also turns the
appraiser from a pure scrap sink into a decision with a second axis.

**Status:** very interesting.

---

## 4. Selling the Map

> The Guild pays for routes. Sell them the shaft you found and it is a trunk
> passage by spring: lit, safe, patrolled, and stripped of anything worth
> carrying.

**Rests on:** shortcuts already being delta state, and the trunk/capillary split
in `design/world-shape.md`.

**Why:** an irreversible trade of **future wealth for present safety**, where the
world visibly degrades in the direction you sold it. It is knowledge-as-
progression with a price tag, and it gives the Delver's Guild — the buyer that
"pays for information as much as objects" — something to actually buy.

**Status:** really liked.

---

## 5. A Forger Has a Hand

> Every seam is made by someone. Work long enough and a Grimhaven reader says:
> *this stamp sits proud the same way three others did.*

**Rests on:** the amendment tier, with the forger as an actor in the graph like
any other.

**Why:** your forgeries accrue to **your own chain**. Reputation is not a
separate stat with its own store — it is the provenance system pointed back at
you, which is the same arithmetic and no new concepts. It makes the player
legible to the world in exactly the grammar the world is legible to the player,
and it gives `design/provenance.md`'s "you have a record too" somewhere to land.

**Status:** makes sense.

---

## 6. The Script You Could Not Read

> You learn the Apostolic hand in a back room in Ashmark. Walking out, every
> inscription you have ever held — in your stash, in your memory, in a tomb you
> robbed forty hours ago — is suddenly saying something.

**Rests on:** `view-redacts` and a pure world.

**Why:** retroactive revelation costs **nothing**. The text was always there; you
simply redact less of it. Almost no engine can do this honestly — most would
have to have stored what you saw, and then migrate it. This one gets it free,
and it is the single largest emotional payoff per byte in the whole design.
`spec-layer-contract.md` already uses Language Deciphering as its canonical
example of the contract working; this is that example, shipped.

**Status:** yes, absolutely.

---

## 7. Someone Was Here First

> The chest is already open. The pry marks are fresh, crude, and left-handed —
> and they are on the *record*, which means they have a name, and the name has
> an address.

**Rests on:** NPC salvagers writing `inherit` amendments.

**Why:** the world reads as inhabited without a single NPC being simulated. A
robbed room becomes a **lead** instead of a disappointment — you can go and find
him, and he is still carrying it. It also gives the Field's bandit holds a
reason to exist that is not a combat encounter, which `design/provenance.md`
already anticipates: *"a Red Hand raider carries goods with chains, and the
chains name where they camp."*

**Status:** yes, absolutely.

---

## 8. The Mutterstone's Appetite

> Most provenance is information. This one has an opinion about where it would
> like to be taken.

**Rests on:** imposed jobs, already designed in `design/jobs.md`.

**Why:** items that write amendments *about you*, that want to go deeper, or
want to go home. The most valuable thing in the room being the thing you should
not pick up is the sharpest available version of the triage question the whole
game is built to ask. It is also the case that justifies the entire jobs system
— a class you choose is a menu, a class that takes you is a story.

**Status:** yes, absolutely.

---

## 9. Below, the Names Stop Working

> The chain resolves. Nine events, clean arithmetic, a full record. Lore has
> nothing whatever to say about it. Bearing answers immediately.

**Rests on:** open question 4 in `design/provenance.md`, and the era-3 name
table that already exists in `core/provenance.js` — `Θal`, `Nine-of-Stone`,
*"that was not a person"*, *"of the unnumbered"*.

**The idea, precisely.** `design/world-shape.md` says the Fundament's owners
**were not people.** Take that literally at the *perception* layer rather than
the flavour layer. Below era 3 the machinery keeps working perfectly — chains
resolve, marks exist, worth computes, the inversion inverts, leads point at real
rooms. What breaks is **interpretation**:

- **Lore goes dark.** It is the education — inscriptions, houses, era
  contradictions — and there is no scholarship about things that were never
  people. The stat you invested in most stops answering exactly where the
  material is richest.
- **Bearing answers.** Its high tier is already defined as *what the dead
  remember of it*, and these are still, in some sense, present.

So it is an **inversion of the perception hierarchy**, delivered entirely
through `viewFor`: no new system, a name table and a rule that flips which stat
reads at depth. Depth stops being a larger number and becomes a change in kind.

**Why it is worth the risk:** it makes the deepest strata frightening through
*epistemology* rather than through damage numbers, and it gives Bearing — the
stat with no job in the salvage loop — the best job in the game.

**Status:** confirmed (DJ, 2026-09-22), on the second telling. The first pitch
was written badly and got a *not sure what you meant*, which is worth recording:
the idea did not change between the two tellings, only the account of it did.

---

## 10. The Archive of Claims

> A ransacked bureaucracy where the *record* is kept, sold, contested, and — for
> a price and a risk — burned. Truth is immutable. Paper is not.

**Rests on:** amendments given a physical home. The Ransacked Archive is already
an authored anchor in `design/world-shape.md`.

**Why:** file, buy, steal or destroy records. Burning one does not change what
happened — only what everyone believes, and therefore what everything is worth.
It turns the three-tier model from a data structure into **a place you can rob**,
and it is the natural home for attestation, which otherwise has to live in a
menu.

**Status:** very interesting.

---

## Runners-up

*DJ: "all worthy of backlog adds."*

### 11. Noise travels the graph

Opening things is loud — `design/core-loop.md` says so in step 3 and nothing
listens. Propagate sound along the **Deep network's edges** rather than through
room adjacency, so a loud break-in is heard by whatever shares a passage with
you and not by whatever is on the other side of a wall. Makes the trunk/
capillary choice a stealth decision as well as a speed one, and gives quiet
tools a reason to exist.

### 12. Repair is defacement

Fixing a thing writes a `repaired` event with **your** name in it. The act
already carries a negative worth multiplier — `-0.22`, because a clumsy repair
makes a thing worth less than the material. So maintaining your gear degrades
its record, and a pristine heirloom you never used is worth more than the one
that kept you alive. That is a genuine tension and it costs one amendment kind.

### 13. The Warden walks the graph

A patrolling hazard that occupies a **node** and moves along **edges**, not a
monster that spawns in rooms. Its circuit is learnable, which makes it one more
thing knowledge defuses — the same thesis as shortcuts and the map. Pairs with
`design/world-shape.md`'s existing guarantee that every region has at least one
route avoiding a Warden-class hazard, though it may be much longer.

---

## What is deliberately not here

Nothing on this list is a combat system, a gear tier, or a damage number. That
is not an oversight and it is not asceticism: `design/combat-and-tools.md`
already covers threat, and the ideas above are worth more precisely because they
do not compete with it. If this document ever fills up with weapons, something
has gone wrong upstream.
