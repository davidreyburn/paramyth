# Foe behaviour: circle, strike, back off — and knockback

*v0.1, 2026-09-24. A plan, not a build. DJ's brief:*

> The dog walks into you and reduces health until you die. It needs to circle
> the target, then strike, then back off and prepare to strike. Hitting an enemy
> with a weapon should incur knockback, influenced by the weapon and the weight
> of the enemy.

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

1. **Knockback first.** Smaller, self-contained, immediately satisfying, and
   `stagger` is the first mode — so it seeds the `mode` field the machine needs.
   One commit.
2. **The machine.** Replace pursuit-and-cooldown with the five modes. Corridor
   fallback in the same commit, because a dog that stalls against a wall is a
   regression from today.
3. **The telegraph.** Rendering per mode. Small, but it is what makes the
   sidestep possible for a human rather than only for a gate.
4. **Tuning, and the speed-tier gates rewritten** around escape rather than
   pace.

One MINOR release — *0.7.0, the dog learns to hunt* — in four commits. The
`interact.js` split from the review could ride along, since this touches
`weaponOf` and `hitBox`, but it is optional and should not gate the release.

## Open questions

1. **Does a lunge that connects shove the player?** Same machinery, one more
   action. It would make a bite feel like a bite. Not assumed.
2. **Does knockback into a wall cost the foe extra?** A natural reward for
   fighting with your back to open floor and theirs to masonry. Not assumed.
3. **Is circle-and-lunge the dog's pattern, or the template for melee foes?**
   Ghouls swarm and grab; Sentinels block; a War Child stalks. The machine is
   general — modes are data — but the *policies* differ. Assumed: the dog gets
   this; the table shape is what the others reuse.
4. **Rupture on death** — the design's dog "sprays corruption when slain". Out
   of scope here; it is the corruption system's first customer.
