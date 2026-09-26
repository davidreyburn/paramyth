# The dodge roll

*v0.1, 2026-09-26. Built the same day, steps 1 and 2; step 3 waits on DJ's hands. DJ: "dodge in the direction of the
current input direction; if no input direction, a short backstep; i-frames
while dodging; a subtle particle 'motion' trail."*

## What exists

- `VERB.DODGE` is bit 7: **B** on a pad, **Space** on a keyboard, **B** on the
  screen. It already closes screens. In the world it does nothing.
- The player has a shove velocity (`vx, vy`, worked off by `carry()` through
  `slide()`), a swing with three phases that are pure functions of the tick,
  `HURT_INVULN` (30 ticks of grace after a hit, read by the dog's bite and
  nothing else), and load tiers that scale speed.
- `design/combat-and-tools.md` already commits the roll to the load tiers:
  **Light — full roll. Laden — roll costs double stamina. Overloaded — no
  roll.** And it leaves one question open: *stamina as a second meter, or the
  version where dodge costs nothing and is simply unavailable when laden.*

## The roll, as delta

`s.dodge = { at, dx, dy, back }` — the tick it began, its direction as a unit
octant (the same eight directions the stick gives), and whether it was a
backstep. Every phase is a function of `s.tick - at`, like the swing. Hashed,
saved, replayed.

| | Roll | Backstep |
|---|---|---|
| Trigger | DODGE pressed with a direction held | DODGE pressed with none |
| Direction | the held direction, diagonals included | opposite `facing` |
| Length | 20 ticks | 10 ticks |
| Distance | ~36px, a tile and three quarters, front-loaded (fast then slowing) | ~14px |
| i-frames | ticks 0–13 | ticks 0–6 |
| Recovery | ticks 14–19: still moving, vulnerable, cannot act | ticks 7–9 |
| Cooldown | 10 ticks after it ends before another | same |

**Front-loaded** matters: a roll that moves evenly reads as a slide. Speed per
tick from a small integer table (`[5, 5, 4, 4, 3, 3, 2, 2, 1, 1, …]` px), summed
to the distance, no float.

**Movement goes through `slide()`** against walls, bodies and foes, so you
cannot roll through a dog or a wall; you stop against it and the rest of the
roll is spent standing. Remains, items on the floor, scars: rolled over.

**Committed.** While rolling: no steering, no attack, no tool, no interact.
Input during the roll is ignored, not buffered; a buffered roll is how a
player rolls off a ledge they saw. The one exception: **a roll may cancel the
swing's `recover` phase** (not windup or active). That is the skill move — hit,
roll out — and it costs nothing to allow.

**Invulnerable means invulnerable to everything:** the dog's bite, the
Sentinel's blow, a blast. A new predicate `invulnerable(s)` in `sim/state.js`
returns true for i-frames *or* `HURT_INVULN` grace; the dog's bite, the
Sentinel's lurch and `fuseStep`'s hurt read that one predicate. The blast does
**not** spend its once-per-body hit on an invulnerable player: roll *through*
a blast and you are clear; roll *into* one and stop, and it hurts the tick your
frames end. Being shoved is a consequence of being hurt, so i-frames cover
knockback too. A roll cancels a shove in flight (`vx, vy` zeroed).

## Load, per the design

| Tier | Roll | Backstep |
|---|---|---|
| Light | full | full |
| Laden | roll at ¾ length and distance; i-frames the same *count* (a shorter roll is *more* exposed at the end, not less) | full |
| Overloaded | **no roll** — the button does the backstep instead, and says so once: *"Too heavy to roll"* | full |

This answers the design's open question the way it suggested: **dodge costs
nothing and degrades with load.** No stamina meter. If a second meter is ever
wanted, the roll is the first thing to charge for it, and nothing here has to
change to add the cost.

## The trail

Subtle, and a function of the delta: no particles are stored.

- **Afterimages**: two dim copies of the glyph behind you along the roll's
  line, at where you were 3 and 6 ticks ago (computable from `at`, the
  direction and the speed table), drawn through the Bayer dither at low
  coverage — the fade's mechanism, reused.
- **Flecks**: five or six single pixels scattered along the path, positions
  hashed from `(seed, at, tick)`, in the player's parchment tone, gone with the
  roll.
- The glyph itself **leans**: scaled along the roll's axis (the telegraph's
  trick on the dog) for the i-frame ticks, upright in recovery. That is the
  tell that says *now you can be hit again*, and it is the one thing on screen
  the player has to read.

## Where it lives

| Layer | Change |
|---|---|
| `sim/state.js` | `dodge: null` in the delta; `ROLL`, `BACKSTEP` tables; `dodgePhase(s)`, `invulnerable(s)`; hashed |
| `sim/step.js` | on DODGE press: begin (or refuse, overloaded → backstep); per tick: move by the table through `slide()`; block steering and verbs while committed; cooldown |
| `sim/blast.js`, `systems/combat/` | read `invulnerable(s)` instead of the grace arithmetic |
| `render/canvas.js` | the lean, the afterimages, the flecks |
| `app/input.js` | nothing: B is already DODGE |

## Gates

- rolling with a direction held moves along it, diagonals included, about a
  tile and three quarters, front-loaded (the first half covers more than the
  second)
- with no direction held, a backstep opposite `facing`, shorter
- a bite during the i-frames does not land; the same bite two ticks after they
  end does
- a Sentinel's blow, likewise
- a blast during the i-frames does not hurt, and rolling clear leaves you
  unhurt; stopping inside it hurts the tick the frames end
- a roll into a wall stops at the wall and never overlaps it; into a dog,
  likewise
- no steering, attack, tool or interact during a roll
- a roll cancels the swing's recover phase and not its windup or active
- a second press inside the cooldown does nothing
- laden rolls shorter; overloaded backsteps instead and says so
- replay holds through a roll; no float
- on the glass: the trail draws, draws the same twice, and is gone after

## Sequence

1. The roll and the backstep, the predicate, the gates. One commit.
2. The trail and the lean. One commit.
3. Tuning after DJ has held it — the dog's crouch is 12 ticks and its dash
   line is fixed; with i-frames *and* displacement the sidestep may become
   too easy, in which case the numbers to move are the crouch and the roll's
   cooldown, not the i-frames.

## Not in this plan

Guard (RB / Shift) is a separate verb with its own plan. Stamina is
deliberately not built. Sound is not built. A perfect-dodge reward (slowed
time, a counter window) is a later idea and would sit on `dodgePhase` when
it comes.
