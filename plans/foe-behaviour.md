# Foe behaviour: circle, strike, back off — and knockback

*v0.1, 2026-09-24. A plan, not a build. DJ's brief:*

> The dog walks into you and reduces health until you die. It needs to circle
> the target, then strike, then back off and prepare to strike. Hitting an enemy
> with a weapon should incur knockback, influenced by the weapon and the weight
> of the enemy.

## Step 0: bodies cannot overlap

*Added mid-plan (DJ): "enemies and players need collision so they can't occupy
the same space as a player and kill them."*

This is not an extra — it is the ground the rest stands on. Today `blocked()`
in `sim/space.js` tests wall tiles and item bodies and **nothing else**: the
dog's move is checked against barrels, never against you, and yours never
against it. That is literally why it walks *into* you. A circling dog has to
stop at contact; a shove has to start from two bodies that are not already
inside each other; two dogs that can stack are one dog on screen.

**The change.** Actors become bodies. `blocked(grid, bodies, x, y)` gains the
other actors as boxes of `HALF` extent — the constant player and foe already
share, because "two things that move through the same doorways should measure
the same." The player's check includes every foe; each foe's includes the
player and every *other* foe. It is one more list walked by the same loop that
walks the barrels.

**What it changes downstream, and must not be missed:**

- **The bite trigger.** Today a bite fires on *overlap* (`|dx| < 2·HALF`).
  Two bodies that cannot overlap will stop exactly `2·HALF` apart on the axis of
  approach, so that test would **never fire again**. Contact becomes
  *touching*: within `2·HALF` plus a small margin. Getting this wrong makes the
  dog harmless, silently.
- **Room entry.** You arrive at a door or stair; a foe stands on its roster
  tile. They can coincide. On `enterRoom`, a foe overlapping the arrival point
  is nudged to the nearest free tile — never the other way round, because where
  *you* arrive is a promise the stairs keep.
- **The mode machine inherits it for free.** `circle` keeps distance because it
  steers away; `lunge` stops at contact because the body does; `recover` backs
  off from a position it could actually reach. None of that works against a
  ghost.

**Gates:**

- the player cannot walk through a foe
- a foe cannot walk through the player
- two foes cannot occupy the same tile
- a bite fires from *touching*, not overlap — construct two bodies exactly
  `2·HALF` apart, assert the bite; at `2·HALF + margin + 1`, assert none
- entering a room never lands you inside a foe, over the whole gate corpus
- replay and no-float, re-run

**Cost.** Small. `blocked()` grows a loop; `combat()` passes the actor list;
`enterRoom` gains a nudge. It goes in as its own commit ahead of knockback,
because it changes what "contact" means and every later step has to be built
on the new meaning.

## What is wrong with the dog today

`systems/combat/index.js` moves the dog straight at you, one axis at a time, and
bites whenever it is touching you and its `bite` cooldown has elapsed. That is
a *proximity tax*, not a fight: nothing it does is readable, nothing you do
short of killing it changes the outcome, and "kill at a doorway" — the counter
`design/combat-and-tools.md` promises — means nothing, because a straight-line
pursuer is the same in a corridor as in a hall.

The encumbrance thesis survives (light outruns it, laden does not) but only as a
footrace. There is no *timing* in it.

## The shape: a state machine per foe

A foe's `mode` lives in the delta beside its position — it is replayed state,
so it is hashed and saved like everything else. `systems/combat/` reads the mode
and proposes what happens next; `applyAction` writes it. No system writes state.

| Mode | What the dog does | Leaves when |
|---|---|---|
| `asleep` | Nothing. As now. | You come within `wake` tiles |
| `circle` | Orbits you at `orbit` tiles, moving tangentially, correcting radially. Keeps its distance — **never bites in this mode.** | `circleTicks` elapse (jittered per foe so a pack does not lunge in unison) |
| `lunge` | Commits to a straight dash at **where you were when it decided** — not homing. Bites on contact. | `lungeTicks` elapse, or contact, or a wall |
| `recover` | Backs off toward orbit radius. Cannot bite. This is the window. | `recoverTicks` elapse → `circle` |
| `stagger` | Knocked back and helpless. Cannot act. | `staggerTicks` elapse → `circle` |

Read left to right, that is: circle, strike, back off, prepare. The `bite`
cooldown becomes redundant — the machine *is* the cooldown — and is removed.

**Why the lunge is not homing.** A dash at a fixed point can be sidestepped. That
is the entire difference between a fight and a tax: you watch the crouch, you
step, it misses, and you have a recovery window to swing into. The gate for this
is "a player who sidesteps during the lunge is not bitten".

**Corridors.** A dog that cannot take its tangent step for a few ticks reverses
its `spin`; if it still cannot, it approaches directly. So in a one-wide passage
it degrades to today's behaviour — but *only* there, which is exactly where the
design wants the player to make a stand. "Kill at a doorway" becomes true rather
than aspirational.

## Knockback

On a hit, the foe is shoved along the swing's direction. The impulse is the
weapon's `knock` divided by the foe's `weight`:

```
impulse = knock(weapon) / weight(foe)        integer, subpixel units
```

- **Weapons gain `knock`.** Sword more than fists. A future maul more than a
  sword. It is a stat beside `damage`/`reach`/`wide` in `core/items.js`.
- **Foes gain `weight`.** The dog is light. A Broken Sentinel is heavy; a Barrow
  Warden is *rooted* — `weight: Infinity` — and does not move at all. One number
  covers the whole roster.
- **It is a velocity, not a teleport.** `vx, vy` on the foe, applied through
  `slide()` each tick so walls stop it, decaying by a fixed integer fraction.
  Reads as a shove.
- **It staggers.** A shoved foe enters `stagger` for `staggerTicks`, then
  resumes `circle`. That is the "back off" you can *force*, and it is what makes
  landing a hit feel like something happened.
- **Everything integer.** Direction from `facing` (four cardinals — already how
  the hitbox works), impulse an integer, decay a shift or an integer ratio. No
  float enters the sim path; a gate already asserts foe positions are integers
  and will keep doing so.

## Where it lives

| Layer | Change |
|---|---|
| `core/foes.js` (L1) | `weight`, `orbit`, `circleTicks: [min, max]`, `lungeSpeed`, `lungeTicks`, `recoverTicks`, `staggerTicks`. Data, no behaviour. `bite` cooldown removed. |
| `core/items.js` (L1) | `knock` on weapons; `UNARMED.knock` small |
| `sim/state.js` (L3) | Foe record gains `mode`, `modeAt`, `spin`, `vx`, `vy`, `aimX`, `aimY`. All hashed. `enterRoom` initialises them. |
| `sim/space.js` (L3) | An integer `steer(dx, dy, speed)` that scales a direction to a speed with an octagonal norm — no sqrt |
| `sim/step.js` (L3) | `applyAction` gains `setMode` and `shoveFoe`; `hurtFoe` no longer changes mode itself |
| `systems/combat/` (L4) | The machine. Reads mode, proposes moves, mode changes, bites, shoves. Still returns actions and mutates nothing. |
| `render/canvas.js` (L5) | The telegraph: crouch before a lunge, stretch during, flat in recovery, jitter in stagger. Even on a `D` glyph, an offset and a colour are enough. |

`applyAction`'s vocabulary grows by two verbs. That is worth watching — the
comment on it says a long list is a system that has started writing state — but
both are things that happen *to* the world, not decisions about it.

## Gates

The discipline is that the behaviour is asserted, not eyeballed:

- **circling keeps its distance** — over N ticks in `circle`, the dog is never
  in contact
- **a lunge closes the gap** — from orbit radius, contact within `lungeTicks`
- **a lunge can be sidestepped** — dog lunging at P, player steps perpendicular
  during windup, no bite occurs
- **recovery is a window** — after a bite, no second bite for at least
  `recoverTicks`
- **a corridor forces the direct approach** — in a one-wide passage the dog
  still reaches you, so a doorway is a place to fight and not a place to hide
- **knockback moves the foe along the swing** — position after a hit is further
  from the player along `facing`
- **a sword shoves further than fists**
- **a heavier foe shoves less; a rooted one not at all** — a test roster with
  weights 1, 3, ∞
- **knockback respects walls** — a foe shoved into masonry stops at it
- **a staggered foe does not bite**
- **replay holds** with modes, spins and velocities in flight — the existing
  gate, re-run with the new fields hashed
- **no float** — the existing gate, still green
- **a pack does not lunge in unison** — two dogs in one room have different
  `circleTicks`

And two existing gates that must be **re-examined**, not just re-run:

- *"light outruns a dog, laden does not."* With circle-and-lunge the chase is
  no longer a footrace. The thesis becomes: a light player can *break contact*
  during `recover`; a laden one cannot make the distance before the next lunge.
  The numbers that make that true are the tuning target, and the gate should
  measure escape from a circling dog, not raw speed.
- *"grace after a hit stops contact being a shredder."* Still true, but the
  machine now provides most of the grace. Keep `HURT_INVULN` as a floor.

## Numbers to start from

Tuned at the table, not here. Integer, in the units the code already uses.

| | value | why |
|---|---|---|
| `orbit` | 2 tiles | close enough to threaten, far enough to read |
| `circleTicks` | 45–90 | ¾s to 1½s; jittered per foe |
| `lungeSpeed` | 1.6× base | faster than a light player for the dash only |
| `lungeTicks` | 18 | about 3 tiles at that speed |
| `recoverTicks` | 30 | half a second of open window |
| `staggerTicks` | 15 | a quarter second helpless |
| sword `knock` | 24 px | one tile and a bit |
| fists `knock` | 8 px | a shove, not a launch |
| dog `weight` | 1 | the reference weight |
| decay | ×¾ per tick | integer ratio |

## Sequence

0. ✓ (v0.6.1+, `c22473e`) **Bodies.** Actors collide with actors. The bite trigger becomes touching.
   Room entry nudges a coincident foe. Its own commit, first, because it changes
   what contact *means* and everything after is built on the new meaning.
1. ✓ (2026-09-25) **Knockback. Smaller, self-contained, immediately satisfying, and
   `stagger` is the first mode — so it seeds the `mode` field the machine needs.
   One commit.
2. ✓ (2026-09-25) **The machine.** Replace pursuit-and-cooldown with the five modes. Corridor
   fallback in the same commit, because a dog that stalls against a wall is a
   regression from today.
3. ✓ (2026-09-25) **The telegraph.** Rendering per mode. Small, but it is what makes the
   sidestep possible for a human rather than only for a gate.
4. ✓ (2026-09-25, v0.7.0) **Tuning, and the speed-tier gates rewritten** around escape rather than
   pace.

One MINOR release — *0.7.0, the dog learns to hunt* — in five commits. The
`interact.js` split from the review could ride along, since this touches
`weaponOf` and `hitBox`, but it is optional and should not gate the release.

## Status after step 4 (2026-09-25) — shipped as 0.7.0

- The contact gates run on the camp's top row: thirty clear tiles, a wall
  above so the dog circles below. After a bite you run for 400 ticks.
- **Three geometry faults**, found by the gates and fixed before any tuning:
  recover backed off from a player already out of range; the circle's radial
  share (equal-weighted with the tangent) was ~180, slower than laden's 216;
  the dash ended at the aim point, so it could not catch a straight runner.
- **The dash is now a line through you**, `lungeSpeed × (lungeTicks −
  lungeWindup)` long, aimed the tick the crouch begins. Closure per tier over
  a 30-tick dash at 640: light 41px, laden 50px, overloaded 56px. Light reaches
  the crouch at ~76px (the dog cannot close on 288), laden at ~60, so the
  first is clear and the second is caught. This is the whole load thesis in
  two numbers, and they are the ones to move if it stops feeling right.
- Numbers left as played: orbit 40 ± 14 over 120, circle 45–90, crouch 12,
  recover 30, stagger 15, dog walk 255.
- ✓ (2026-09-25) The second policy table: the Broken Sentinel. No orbit, a
  strike range, weight 6. The machine gained two knobs and no branches.

## Status after step 3 (2026-09-25)

- Drawn on the glyph with a scale, an offset and a colour per mode, plus one
  addition to the plan: a **cross at the aim point** during the crouch. It is
  drawn under the player, so it is invisible until you step off it — which is
  exactly when you need to see that the dash is going somewhere you are not.
- `tools/telegraph.html` renders all six modes through the real renderer,
  cropped, so the feel can be judged without hunting a dog.
- Remaining: step 4, tuning and the speed-tier gates rewritten around
  breaking contact. Then `0.7.0 — the dog learns to hunt`.

## Status after step 2 (2026-09-25)

- All five modes are live; `hunt` is gone, so is the `bite` cooldown and
  `bitAt`. The record carries `mode, modeAt, spin, aimX, aimY, vx, vy`.
- **Added a crouch:** `lungeWindup` (12 ticks) at the start of a lunge, dog
  still, aim already fixed. Without it a sidestep was arithmetically
  impossible at these speeds (contact needs 12px of lateral clearance; the
  dash covers the gap in 11 ticks; a light player moves 1.1px/tick). The gate
  “a lunge can be sidestepped” only passes because of it, and step 3 draws it.
- **Corridor test changed:** not “could not take the tangent step for a few
  ticks” (a wall lets a fraction of a diagonal step through, and the dog crept
  forever without deciding) but **probe a whole tile along each tangent**. No
  room either side → straight on. Stateless, and it is a real test of room.
- `circleFor()` and `spinOf()` live in `core/foes.js` as pure derivations of
  the table — policy, not behaviour.
- For step 4: from orbit range the bite lands at tick 29 of a 30-tick lunge.
  One step back makes a lunge fall short, which is a dodge, but it is tight.

## Status after step 1 (2026-09-25)

- `mode` on the foe record is `asleep` / `hunt` / `stagger`. `hunt` is today's
  straight pursuit under an honest name; step 2 splits it into `circle` /
  `lunge` / `recover`. The `bite` cooldown is still in place until then.
- `space.js` has the arithmetic: `impulse(knock, weight)`, `decay(v)` and
  `carry(grid, bodies, body)`. `carry` returns `slammed` when a wall or body
  cut the shove short — the hook for backlog 12, unused so far.
- `knock` is a **distance in px**, not a force: the impulse is solved from the
  decay series so that the sum comes out to `knock`. Tuning reads directly.
- The player gains `vx, vy` and `PLAYER_WEIGHT` (1; armor will add to it). A
  player *stagger* (`staggerAt`) is deferred: with no dodge or guard verb yet
  there is nothing for it to deny, and a helpless player with no answer is a
  tax. Revisit with the guard verb.
- Fixture lesson: a foe placed 11px away is already *touching*. It wakes on
  the first tick and bites during the windup, shoving you before the blade
  lands. Measure a shove from where the foe stood when the hit registered.

## Open questions — resolved (DJ, 2026-09-24)

1. **Does a lunge that connects shove the player?** Yes. Knockback runs both
   ways: an opponent's move can knock the player back. Same machinery — the
   player gains `vx, vy` and a `staggerAt`, applied through `slide()` like a
   foe's. The dog's lunge carries a `knock`; a bite that lands shoves you.
2. **Knockback into a wall.** Long-term, not MVP: a wall-slam should produce a
   radial impact effect, extra damage, and a stun or guard-break status. On the
   backlog as entry 12. The `slide()` return already tells us a shove was
   stopped short, which is the hook.
3. **Template or dog-only?** Template. **This is the foundation of the melee
   system.** The mode machine is the shape every melee foe uses; each kind
   supplies its own policy — orbit radius, when to commit, what recovery looks
   like. Ghouls, Sentinels and War Children are tables, not new machines.
4. **Rupture** belongs to the corruption system, and its rule is now known:
   **most Rot-type foes have a chance of producing Appendages on death, higher
   if the creature "burst"** — through a blunt weapon (not yet implemented) or a
   wall-slam. So the death action needs to carry *how* it died, and a `blunt`
   weapon property and the wall-slam signal from (2) are both inputs to a system
   that does not exist yet. Recorded so those two hooks are left in place.
