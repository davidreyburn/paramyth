// L5 boundary artifact: the canonical input frame.
// Devices produce these; the simulation consumes nothing else.
// One frame is one 32-bit int, so a frame log is a typed array.

export const VERB = {
  UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3,
  ATTACK: 4, TOOL: 5, INTERACT: 6, DODGE: 7,
  GUARD: 8, SPRINT: 9, DROP: 10, MAP: 11,
  // Cancel/back. Deliberately its own verb rather than an alias for DODGE:
  // sharing that bit would make Escape roll you across the room.
  CANCEL: 12,
  // The pack, on its own button. Y is left free for tools.
  INVENTORY: 13,
};

export const VERB_NAMES = Object.keys(VERB);

export const setVerb = (f, v, on) => (on ? f | (1 << v) : f & ~(1 << v));
export const hasVerb = (f, v) => (f & (1 << v)) !== 0;
