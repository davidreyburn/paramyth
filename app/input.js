// L5: device events in, one canonical frame out.
// Keyboard, gamepad and (later) virtual stick all reduce to the same int.
// Analog is quantised to 8-dir booleans HERE, so the simulation never sees
// a float and determinism costs nothing.

import { VERB, setVerb } from '../sim/frame.js';

const KEYS = {
  KeyW: VERB.UP, ArrowUp: VERB.UP,
  KeyS: VERB.DOWN, ArrowDown: VERB.DOWN,
  KeyA: VERB.LEFT, ArrowLeft: VERB.LEFT,
  KeyD: VERB.RIGHT, ArrowRight: VERB.RIGHT,
  KeyJ: VERB.ATTACK, KeyK: VERB.TOOL, KeyE: VERB.INTERACT,
  Space: VERB.DODGE, ShiftLeft: VERB.GUARD, ControlLeft: VERB.SPRINT,
  KeyG: VERB.DROP, Tab: VERB.MAP,
  Escape: VERB.CANCEL, Backspace: VERB.CANCEL,
  KeyI: VERB.INVENTORY,
};

// Standard Gamepad mapping: 0 bottom(A) 1 right(B) 2 left(X) 3 top(Y)
// A pad button can mean more than one thing, so the values are LISTS. They were
// a plain map and two entries collided on button 1 — the object literal kept the
// last, and B silently stopped dodging.
//   0 A interact · 1 B dodge+cancel · 2 X attack · 3 Y tool
//   5 RB guard · 8 Back drop · 9 Start inventory · 10 L3 sprint · 12-15 d-pad
const PADS = {
  0: [VERB.INTERACT],
  1: [VERB.DODGE, VERB.CANCEL],
  2: [VERB.ATTACK],
  3: [VERB.TOOL],
  5: [VERB.GUARD],
  8: [VERB.DROP],
  9: [VERB.INVENTORY],
  10: [VERB.SPRINT],
  12: [VERB.UP], 13: [VERB.DOWN], 14: [VERB.LEFT], 15: [VERB.RIGHT],
};

const DEADZONE = 0.35;

export { PADS, KEYS };

export function createInput() {
  const held = new Set();
  const touched = new Set();                 // the on-screen controls' verbs, kept apart from the keys'
  let padInfo = 'none', padSeen = false, keySeen = false;

  addEventListener('keydown', (e) => {
    if (KEYS[e.code] !== undefined) { held.add(KEYS[e.code]); keySeen = true; e.preventDefault(); }
  });
  addEventListener('keyup', (e) => {
    if (KEYS[e.code] !== undefined) { held.delete(KEYS[e.code]); e.preventDefault(); }
  });
  addEventListener('blur', () => held.clear());
  addEventListener('gamepadconnected', (e) => {
    padInfo = e.gamepad.id.slice(0, 44) + ' (' + e.gamepad.buttons.length + 'b)';
    padSeen = true;
  });
  addEventListener('gamepaddisconnected', () => { padInfo = 'none'; });

  return {
    get pad() { return padInfo; },
    get padSeen() { return padSeen; },
    get keySeen() { return keySeen; },
    // The on-screen controls speak these two words and nothing else.
    hold(v) { touched.add(v); },
    free(v) { touched.delete(v); },
    sample() {
      let f = 0;
      for (const v of held) f = setVerb(f, v, true);
      for (const v of touched) f = setVerb(f, v, true);

      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (const p of pads) {
        if (!p) continue;
        padSeen = true;
        for (const [i, vs] of Object.entries(PADS)) {
          if (!p.buttons[i] || !p.buttons[i].pressed) continue;
          for (const v of vs) f = setVerb(f, v, true);
        }
        const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
        if (ax < -DEADZONE) f = setVerb(f, VERB.LEFT, true);
        if (ax > DEADZONE) f = setVerb(f, VERB.RIGHT, true);
        if (ay < -DEADZONE) f = setVerb(f, VERB.UP, true);
        if (ay > DEADZONE) f = setVerb(f, VERB.DOWN, true);
      }
      return f;
    },
  };
}
