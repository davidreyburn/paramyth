// The grid's shape, shared by generated rooms and authored places alike so
// neither has to import the other. 20px tiles divide 640x320 exactly.

export const TILE = 20, COLS = 32, ROWS = 16;

export const T = { FLOOR:0, WALL:1, RUBBLE:2, SARC:3, NICHE:4, STAIR_D:5, STAIR_U:6 };

// RUBBLE blocks. A rock is a rock.
const SOLID = [false, true, true, true, false, false, false];
export const solidTile = (t) => SOLID[t];
