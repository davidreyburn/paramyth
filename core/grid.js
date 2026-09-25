// The grid's shape, shared by generated rooms and authored places alike so
// neither has to import the other. 20px tiles divide 640x320 exactly.

export const TILE = 20, COLS = 32, ROWS = 16;

export const T = { FLOOR:0, WALL:1, RUBBLE:2, SARC:3, NICHE:4, STAIR_D:5, STAIR_U:6, GRASS:7 };

// RUBBLE blocks. A rock is a rock. GRASS is the Field's ground: walked on.
const SOLID = [false, true, true, true, false, false, false, false];
// Ground you can stand on, walk over, drop a thing onto.
export const groundTile = (t) => t === T.FLOOR || t === T.GRASS;
export const solidTile = (t) => SOLID[t];
