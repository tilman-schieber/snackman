// Mazes: corridors one tile wide on a 3-tile lattice, mirrored left to right, with no dead ends,
// a ghost house in the middle and tunnels that wrap around the sides.
import { Rng } from './rng';

export const COLS = 30;
export const ROWS = 24;
export const TILE = 8;
export const FLOOR = 0;
export const WALL = 1;
/** Inside the ghost house: only ghosts on their way in or out are ever there. */
export const HOUSE = 2;
export const DOOR = 3;

export const DOT = 1;
export const PELLET = 2;

export const cellAt = (x: number, y: number) => y * COLS + x;
export const cx = (c: number) => c % COLS;
export const cy = (c: number) => Math.floor(c / COLS);

// The lattice: corridor crossings sit at (X(i), Y(j)), two wall tiles apart.
const NX = 10;
const NY = 8;
const X = (i: number) => 1 + 3 * i;
const Y = (j: number) => 1 + 3 * j;

// The house fills the block between lattice columns 3-6 and rows 2-4. These hold for every maze.
/** Where ghosts come out, in board pixels: above the door, between two tiles. */
export const DOOR_X = 120;
export const DOOR_Y = Y(2) * TILE + 4;
/** The middle of the house. */
export const HOUSE_Y = Y(3) * TILE + 4;
/** Tiles either side of the spot above the door. */
export const DOOR_TILES = [cellAt(14, Y(2)), cellAt(15, Y(2))];
/** Where Snackman starts: below the house, between two tiles. */
export const START_X = 120;
export const START_Y = Y(5) * TILE + 4;
/** Where the bonus fruit shows up: right under the house. */
export const FRUIT_X = 120;
export const FRUIT_Y = Y(4) * TILE + 4;
/** The four power pellet corners. */
const PELLET_NODES = [[0, 1], [NX - 1, 1], [0, NY - 2], [NX - 1, NY - 2]];

export interface Layout {
  grid: Uint8Array;
  /** DOT or PELLET per tile, 0 for none. */
  dots: Uint8Array;
}

export interface MazeOptions {
  /** Share of the removable corridors taken out (0-1): more gives bigger wall blocks. */
  sparse: number;
  /** Rows with a wrap-around tunnel. */
  tunnels: number;
  pellets: boolean;
}

function shuffle<T>(a: T[], rng: Rng) {
  for (let k = a.length - 1; k > 0; k--) {
    const r = Math.floor(rng() * (k + 1));
    [a[k], a[r]] = [a[r], a[k]];
  }
  return a;
}

export function generate(rng: Rng, o: MazeOptions): Layout {
  // Corridors between neighbouring crossings: h[j][i] runs right from (i, j), v[j][i] down from it.
  const h = Array.from({ length: NY }, () => new Array<boolean>(NX - 1).fill(true));
  const v = Array.from({ length: NY - 1 }, () => new Array<boolean>(NX).fill(true));
  const hKeep = h.map((r) => r.map(() => false));
  const vKeep = v.map((r) => r.map(() => false));

  // Faces of the lattice (the wall blocks), merged as corridors between them go.
  const FX = NX - 1, FY = NY - 1;
  const parent = Array.from({ length: FX * FY }, (_, k) => k);
  const size = new Array<number>(FX * FY).fill(1);
  const find = (a: number): number => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const union = (a: number, b: number) => {
    a = find(a);
    b = find(b);
    if (a === b) return;
    parent[b] = a;
    size[a] += size[b];
  };
  const face = (i: number, j: number) => j * FX + i;

  // The outer ring stays.
  for (let i = 0; i < NX - 1; i++) hKeep[0][i] = hKeep[NY - 1][i] = true;
  for (let j = 0; j < NY - 1; j++) vKeep[j][0] = vKeep[j][NX - 1] = true;
  // The house: its two inner crossings go, the ring around it stays.
  for (const i of [3, 4, 5]) {
    h[3][i] = false;
    hKeep[2][i] = hKeep[4][i] = hKeep[3][i] = true;
  }
  for (const j of [2, 3]) {
    v[j][4] = v[j][5] = false;
    vKeep[j][3] = vKeep[j][4] = vKeep[j][5] = vKeep[j][6] = true;
  }
  for (const i of [3, 4, 5]) union(face(3, 2), face(i, 2)), union(face(3, 2), face(i, 3));
  size[find(face(3, 2))] = 99;
  // Snackman's starting corridor.
  hKeep[5][4] = true;

  const degree = (i: number, j: number) =>
    (i > 0 && h[j][i - 1] ? 1 : 0) + (i < NX - 1 && h[j][i] ? 1 : 0) + (j > 0 && v[j - 1][i] ? 1 : 0) + (j < NY - 1 && v[j][i] ? 1 : 0);
  const inHouse = (i: number, j: number) => j === 3 && (i === 4 || i === 5);
  const valid = () => {
    let total = 0;
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        if (inHouse(i, j)) continue;
        total++;
        if (degree(i, j) < 2) return false;
      }
    const seen = new Uint8Array(NX * NY);
    const stack = [0];
    seen[0] = 1;
    let n = 0;
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      const i = k % NX, j = Math.floor(k / NX);
      const visit = (ni: number, nj: number) => {
        const nk = nj * NX + ni;
        if (!seen[nk]) {
          seen[nk] = 1;
          stack.push(nk);
        }
      };
      if (i > 0 && h[j][i - 1]) visit(i - 1, j);
      if (i < NX - 1 && h[j][i]) visit(i + 1, j);
      if (j > 0 && v[j - 1][i]) visit(i, j - 1);
      if (j < NY - 1 && v[j][i]) visit(i, j + 1);
    }
    return n === total;
  };

  // Candidates in the left half (and the middle); each goes together with its mirror image.
  type Edge = { horizontal: boolean; i: number; j: number };
  const cands: Edge[] = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i <= 4; i++) if (h[j][i] && !hKeep[j][i]) cands.push({ horizontal: true, i, j });
  for (let j = 0; j < NY - 1; j++) for (let i = 0; i <= 4; i++) if (v[j][i] && !vKeep[j][i]) cands.push({ horizontal: false, i, j });
  shuffle(cands, rng);
  const MAX_FACE = 3;
  let budget = Math.round(cands.length * o.sparse);
  for (const e of cands) {
    if (budget <= 0) break;
    const { i, j } = e;
    const mi = e.horizontal ? NX - 2 - i : NX - 1 - i;
    // The two wall blocks this corridor separates, and their mirror images.
    const a = e.horizontal ? face(i, j - 1) : face(i - 1, j);
    const b = face(i, j);
    const ma = e.horizontal ? face(mi, j - 1) : face(mi, j);
    const mb = e.horizontal ? face(mi, j) : face(mi - 1, j);
    if (find(a) === find(b)) continue;
    // A corridor on or next to the centre line joins a block to its own mirror image.
    const roots = new Set([find(a), find(b)]);
    const all = new Set([...roots, find(ma), find(mb)]);
    const area = (s: Set<number>) => [...s].reduce((n, r) => n + size[r], 0);
    if (area(all.size < 4 ? all : roots) > MAX_FACE) continue;
    const set = (on: boolean) => {
      if (e.horizontal) h[j][i] = h[j][mi] = on;
      else v[j][i] = v[j][mi] = on;
    };
    set(false);
    if (!valid()) {
      set(true);
      continue;
    }
    union(a, b);
    union(ma, mb);
    budget--;
  }

  const grid = new Uint8Array(COLS * ROWS).fill(WALL);
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      if (inHouse(i, j)) continue;
      grid[cellAt(X(i), Y(j))] = FLOOR;
      if (i < NX - 1 && h[j][i]) grid[cellAt(X(i) + 1, Y(j))] = grid[cellAt(X(i) + 2, Y(j))] = FLOOR;
      if (j < NY - 1 && v[j][i]) grid[cellAt(X(i), Y(j) + 1)] = grid[cellAt(X(i), Y(j) + 2)] = FLOOR;
    }
  for (let y = Y(2) + 2; y <= Y(4) - 2; y++) for (let x = 12; x <= 17; x++) grid[cellAt(x, y)] = HOUSE;
  grid[cellAt(14, Y(2) + 1)] = grid[cellAt(15, Y(2) + 1)] = DOOR;

  // Tunnels: never on the top or bottom row, and not two on neighbouring rows.
  const rows = shuffle([1, 2, 3, 4, 5, 6], rng);
  const tunnels: number[] = [];
  for (const j of rows) {
    if (tunnels.length >= o.tunnels) break;
    if (tunnels.some((t) => Math.abs(t - j) < 2)) continue;
    tunnels.push(j);
    grid[cellAt(0, Y(j))] = grid[cellAt(COLS - 1, Y(j))] = FLOOR;
  }

  return { grid, dots: layDots(grid, o.pellets) };
}

function layDots(grid: Uint8Array, pellets: boolean) {
  const dots = new Uint8Array(grid.length);
  for (let c = 0; c < grid.length; c++) {
    const x = cx(c), y = cy(c);
    if (grid[c] !== FLOOR || x === 0 || x === COLS - 1) continue;
    // Nothing where Snackman starts.
    if (y === Y(5) && (x === 14 || x === 15)) continue;
    dots[c] = DOT;
  }
  if (pellets) for (const [i, j] of PELLET_NODES) dots[cellAt(X(i), Y(j))] = PELLET;
  return dots;
}

/** A maze from a picture: # wall, . dot, o power pellet, space bare floor, H house, - door. */
export function parse(rows: string[]): Layout {
  const grid = new Uint8Array(COLS * ROWS).fill(WALL);
  const dots = new Uint8Array(COLS * ROWS);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = cellAt(x, y);
      if (ch === 'H') grid[c] = HOUSE;
      else if (ch === '-') grid[c] = DOOR;
      else if (ch !== '#') grid[c] = FLOOR;
      if (ch === '.') dots[c] = DOT;
      if (ch === 'o') dots[c] = PELLET;
    }),
  );
  return { grid, dots };
}

/** The picture of a maze, as `parse` reads it. */
export function picture(l: Layout) {
  const rows: string[] = [];
  for (let y = 0; y < ROWS; y++) {
    let row = '';
    for (let x = 0; x < COLS; x++) {
      const c = cellAt(x, y);
      const g = l.grid[c];
      row += g === WALL ? '#' : g === HOUSE ? 'H' : g === DOOR ? '-' : l.dots[c] === DOT ? '.' : l.dots[c] === PELLET ? 'o' : ' ';
    }
    rows.push(row);
  }
  return rows;
}
