// Figma-exact dimensions used across the app
export const PAGE_W = 478;
export const PAGE_H = 650;

export const GRID_X = 28;
export const GRID_Y = 47;
export const GRID_W = 416;
export const GRID_H = 554;

export const COLS = 3;
export const ROWS = 3;
export const COL_GAP = 8;
export const ROW_GAP = 10;

export const SLOT_W = (GRID_W - (COLS - 1) * COL_GAP) / COLS;
export const SLOT_H = (GRID_H - (ROWS - 1) * ROW_GAP) / ROWS;

export const INNER_PAD_X = 5;
export const INNER_PAD_Y = 6;

export const SLOT_ASPECT = SLOT_W / SLOT_H;
